import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assignments, subjects } from "@/lib/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { toISODate } from "@/lib/school-days";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { uploadDir as getUploadDir, uploadUrl } from "@/lib/uploads";
import { evaluateHomeworkPhotos } from "@/lib/ai/homework-evaluator";

// GET /api/assignments?status=pending&from=2026-03-14&to=2026-03-21
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const result = await db
    .select({
      id: assignments.id,
      subjectId: assignments.subjectId,
      subjectName: subjects.name,
      subjectColor: subjects.color,
      title: assignments.title,
      description: assignments.description,
      assignedDate: assignments.assignedDate,
      dueDate: assignments.dueDate,
      status: assignments.status,
      completedAt: assignments.completedAt,
      photoPaths: assignments.photoPaths,
      aiHomeworkEval: assignments.aiHomeworkEval,
      studentConfirmedComplete: assignments.studentConfirmedComplete,
      verifiedAt: assignments.verifiedAt,
      createdAt: assignments.createdAt,
    })
    .from(assignments)
    .innerJoin(subjects, eq(assignments.subjectId, subjects.id))
    .where(
      and(
        status ? eq(assignments.status, status as "pending" | "completed" | "verified") : undefined,
        from ? gte(assignments.dueDate, from) : undefined,
        to ? lte(assignments.dueDate, to) : undefined
      )
    )
    .orderBy(assignments.dueDate, assignments.createdAt);

  return NextResponse.json({ assignments: result });
}

// POST /api/assignments — create new assignment (student only)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { subjectId, title, description, dueDate } = body;

  if (!subjectId || !title || !dueDate) {
    return NextResponse.json(
      { error: "subjectId, title, and dueDate are required" },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(assignments)
    .values({
      subjectId,
      title,
      description: description || null,
      assignedDate: toISODate(new Date()),
      dueDate,
    })
    .returning();

  await logAction(session.userId, "create", "assignment", created.id, null, {
    subjectId,
    title,
    dueDate,
  });

  return NextResponse.json({ assignment: created }, { status: 201 });
}

// Helper: save photos for an assignment
async function savePhotos(files: File[], assignmentId: number): Promise<string[]> {
  const dir = getUploadDir("assignments");
  await mkdir(dir, { recursive: true });
  const paths: string[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `assignment-${assignmentId}-${randomUUID()}.${ext}`;
    const filepath = join(dir, filename);
    const bytes = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));
    paths.push(uploadUrl("assignments", filename));
  }
  return paths;
}

// PATCH /api/assignments — add_photos, complete, confirm_complete, verify
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";

  let id: number;
  let action: string;
  let photoFiles: File[] = [];

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    id = parseInt(formData.get("id") as string);
    action = formData.get("action") as string;
    photoFiles = formData.getAll("photos") as File[];
    const single = formData.get("photo") as File | null;
    if (single && photoFiles.length === 0) photoFiles = [single];
  } else {
    const body = await req.json();
    id = body.id;
    action = body.action;
  }

  const assignment = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, id))
    .then((rows) => rows[0]);

  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Add photos without completing
  if (action === "add_photos") {
    if (photoFiles.length === 0) {
      return NextResponse.json({ error: "No photos provided" }, { status: 400 });
    }

    const newPaths = await savePhotos(photoFiles, id);
    const existing = (assignment.photoPaths as string[] | null) || [];
    const allPaths = [...existing, ...newPaths];

    await db
      .update(assignments)
      .set({ photoPaths: allPaths })
      .where(eq(assignments.id, id));

    return NextResponse.json({ ok: true, photoPaths: allPaths });
  }

  // Mark as already turned in at school (no photo required)
  if (action === "already_turned_in") {
    await db
      .update(assignments)
      .set({
        status: "completed",
        completedAt: new Date(),
        studentConfirmedComplete: true,
      })
      .where(eq(assignments.id, id));

    await logAction(session.userId, "already_turned_in", "assignment", id);
    return NextResponse.json({ ok: true });
  }

  if (action === "complete") {
    if (assignment.status === "verified") {
      return NextResponse.json({ error: "Already verified" }, { status: 400 });
    }

    // Must have at least one photo
    const existing = (assignment.photoPaths as string[] | null) || [];
    const newPaths = photoFiles.length > 0 ? await savePhotos(photoFiles, id) : [];
    const allPaths = [...existing, ...newPaths];

    if (allPaths.length === 0) {
      return NextResponse.json(
        { error: "Upload at least one photo of your completed work" },
        { status: 400 }
      );
    }

    // AI evaluation
    let aiHomeworkEval = null;
    try {
      aiHomeworkEval = await evaluateHomeworkPhotos(allPaths);
    } catch (err) {
      console.error("Assignment AI evaluation failed:", err);
    }

    // If AI flags issues, require confirmation
    if (aiHomeworkEval && (aiHomeworkEval.missingAnswers || !aiHomeworkEval.appearsComplete || !aiHomeworkEval.looksLikeHomework)) {
      await db
        .update(assignments)
        .set({ photoPaths: allPaths, aiHomeworkEval })
        .where(eq(assignments.id, id));

      return NextResponse.json({
        ok: false,
        needsConfirmation: true,
        aiHomeworkEval,
        photoPaths: allPaths,
      });
    }

    await db
      .update(assignments)
      .set({
        status: "completed",
        completedAt: new Date(),
        photoPaths: allPaths,
        aiHomeworkEval,
      })
      .where(eq(assignments.id, id));

    await logAction(session.userId, "complete", "assignment", id, null, {
      photoCount: allPaths.length,
      aiHomeworkEval,
    });
    return NextResponse.json({ ok: true, photoPaths: allPaths, aiHomeworkEval });
  }

  if (action === "confirm_complete") {
    await db
      .update(assignments)
      .set({
        status: "completed",
        completedAt: new Date(),
        studentConfirmedComplete: true,
      })
      .where(eq(assignments.id, id));

    await logAction(session.userId, "confirm_complete", "assignment", id, null, {
      overrodeAiWarning: true,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "verify") {
    if (session.role !== "parent") {
      return NextResponse.json({ error: "Parent only" }, { status: 403 });
    }

    await db
      .update(assignments)
      .set({
        status: "verified",
        verifiedBy: session.userId,
        verifiedAt: new Date(),
      })
      .where(eq(assignments.id, id));

    await logAction(session.userId, "verify", "assignment", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assignments, subjects } from "@/lib/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { toISODate } from "@/lib/school-days";

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

// PATCH /api/assignments — complete or verify
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, action } = await req.json();

  const assignment = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, id))
    .then((rows) => rows[0]);

  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "complete") {
    // Students cannot complete already-verified items
    if (assignment.status === "verified") {
      return NextResponse.json({ error: "Already verified" }, { status: 400 });
    }

    await db
      .update(assignments)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(assignments.id, id));

    await logAction(session.userId, "complete", "assignment", id);
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

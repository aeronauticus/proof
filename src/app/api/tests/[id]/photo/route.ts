import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tests } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { uploadDir, uploadUrl } from "@/lib/uploads";
import { readScoreFromPhotos } from "@/lib/ai/score-reader";

type Params = { params: Promise<{ id: string }> };

// POST /api/tests/[id]/photo — upload one or more graded test photos, AI reads score
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const testId = parseInt(id);

  const test = await db
    .select()
    .from(tests)
    .where(eq(tests.id, testId))
    .then((rows) => rows[0]);

  if (!test) {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }

  if (test.status !== "taken" && test.status !== "returned") {
    return NextResponse.json(
      { error: "Test must be in 'taken' or 'returned' status to upload photos" },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const photoFiles = formData.getAll("photos") as File[];
  const single = formData.get("photo") as File | null;
  const files = photoFiles.length > 0 ? photoFiles : single ? [single] : [];

  if (files.length === 0) {
    return NextResponse.json({ error: "No photos provided" }, { status: 400 });
  }

  // Save all files
  const dir = uploadDir("tests");
  await mkdir(dir, { recursive: true });

  const newPaths: string[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `test-${testId}-${randomUUID()}.${ext}`;
    const filepath = join(dir, filename);
    const bytes = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));
    newPaths.push(uploadUrl("tests", filename));
  }

  // Merge with any existing photos
  const existingPaths = (test.photoPaths as string[] | null) || [];
  const allPaths = [...existingPaths, ...newPaths];

  // Use AI to read the score from all photos together
  let scoreResult;
  try {
    scoreResult = await readScoreFromPhotos(allPaths);
  } catch (err) {
    scoreResult = {
      scoreRaw: null,
      scoreTotal: null,
      letterGrade: null,
      confidence: 0,
      notes: "AI score reading failed. Manual correction may be needed.",
    };
  }

  // Update test with photos and AI-read score
  await db
    .update(tests)
    .set({
      status: "returned",
      photoPath: allPaths[0], // backward compat — first photo
      photoPaths: allPaths,
      returnedAt: test.returnedAt || new Date(),
      scoreRaw: scoreResult.scoreRaw,
      scoreTotal: scoreResult.scoreTotal,
      letterGrade: scoreResult.letterGrade,
      aiConfidence: scoreResult.confidence,
    })
    .where(eq(tests.id, testId));

  await logAction(session.userId, "upload_grade", "test", testId, null, {
    photoPaths: allPaths,
    newPhotos: newPaths.length,
    scoreResult,
  });

  return NextResponse.json({
    ok: true,
    photoPaths: allPaths,
    score: scoreResult,
  });
}

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
import { readScoreFromPhoto } from "@/lib/ai/score-reader";

// POST /api/tests/[id]/photo — upload graded test photo, AI reads score
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  if (test.status !== "taken") {
    return NextResponse.json(
      { error: "Test must be in 'taken' status to upload a grade photo" },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("photo") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  }

  // Save file
  const ext = file.name.split(".").pop() || "jpg";
  const filename = `test-${testId}-${randomUUID()}.${ext}`;
  const dir = uploadDir("tests");
  await mkdir(dir, { recursive: true });
  const filepath = join(dir, filename);

  const bytes = await file.arrayBuffer();
  await writeFile(filepath, Buffer.from(bytes));

  const photoPath = uploadUrl("tests", filename);

  // Use AI to read the score
  let scoreResult;
  try {
    scoreResult = await readScoreFromPhoto(photoPath);
  } catch (err) {
    scoreResult = {
      scoreRaw: null,
      scoreTotal: null,
      letterGrade: null,
      confidence: 0,
      notes: "AI score reading failed. Manual correction may be needed.",
    };
  }

  // Update test with photo and AI-read score
  await db
    .update(tests)
    .set({
      status: "returned",
      photoPath,
      returnedAt: new Date(),
      scoreRaw: scoreResult.scoreRaw,
      scoreTotal: scoreResult.scoreTotal,
      letterGrade: scoreResult.letterGrade,
      aiConfidence: scoreResult.confidence,
    })
    .where(eq(tests.id, testId));

  await logAction(session.userId, "upload_grade", "test", testId, null, {
    photoPath,
    scoreResult,
  });

  return NextResponse.json({
    ok: true,
    photoPath,
    score: scoreResult,
  });
}

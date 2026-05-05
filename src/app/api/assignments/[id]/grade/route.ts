import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assignments, subjects, homeworkQuizzes } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { uploadDir, uploadUrl } from "@/lib/uploads";
import { gradeReturnedHomework, generateHomeworkQuiz } from "@/lib/ai/homework-grader";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/assignments/[id]/grade
 * Parent uploads graded photos of returned homework. AI extracts wrong/right
 * answers, grades the work, and generates a quiz from the wrong answers
 * (or full sheet if everything was correct).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const assignmentId = parseInt(id);

  const assignment = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .then((rows) => rows[0]);

  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  const subject = await db
    .select()
    .from(subjects)
    .where(eq(subjects.id, assignment.subjectId))
    .then((rows) => rows[0]);
  const subjectName = subject?.name || "Unknown";

  const formData = await req.formData();
  const photoFiles = formData.getAll("photos") as File[];
  const single = formData.get("photo") as File | null;
  const files = photoFiles.length > 0 ? photoFiles : single ? [single] : [];

  if (files.length === 0) {
    return NextResponse.json({ error: "No photos provided" }, { status: 400 });
  }

  // Save graded photos
  const dir = uploadDir("assignments-graded");
  await mkdir(dir, { recursive: true });
  const newPaths: string[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `graded-${assignmentId}-${randomUUID()}.${ext}`;
    const filepath = join(dir, filename);
    const bytes = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));
    newPaths.push(uploadUrl("assignments-graded", filename));
  }

  const existing = (assignment.gradedPhotoPaths as string[] | null) || [];
  const allPaths = [...existing, ...newPaths];

  // AI grades the homework
  let grading;
  try {
    grading = await gradeReturnedHomework(
      allPaths,
      subjectName,
      assignment.title,
      assignment.isProject
    );
  } catch (err) {
    console.error("Homework grading failed:", err);
    return NextResponse.json(
      { error: "AI grading failed. Try again or grade manually." },
      { status: 500 }
    );
  }

  // Update assignment with grading
  await db
    .update(assignments)
    .set({
      status: "graded",
      gradedPhotoPaths: allPaths,
      gradedAt: new Date(),
      aiGrading: grading,
    })
    .where(eq(assignments.id, assignmentId));

  // Generate quiz (replaces any existing quiz for this assignment)
  let quiz: { id: number } | null = null;
  try {
    const questions = await generateHomeworkQuiz(
      grading,
      subjectName,
      assignment.title
    );

    if (questions.length > 0) {
      // Remove any prior quiz for this assignment
      await db.delete(homeworkQuizzes).where(eq(homeworkQuizzes.assignmentId, assignmentId));

      const [inserted] = await db
        .insert(homeworkQuizzes)
        .values({ assignmentId, questions, attempts: [] })
        .returning();
      quiz = { id: inserted.id };
    }
  } catch (err) {
    console.error("Quiz generation failed:", err);
  }

  await logAction(session.userId, "upload_graded", "assignment", assignmentId, null, {
    photoCount: allPaths.length,
    scorePct: grading.scorePct,
    quizGenerated: !!quiz,
  });

  return NextResponse.json({
    ok: true,
    grading,
    gradedPhotoPaths: allPaths,
    quiz,
  });
}

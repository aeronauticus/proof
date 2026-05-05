import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assignments, homeworkQuizzes, dailyChecklist } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { gradeQuizAttempt } from "@/lib/ai/homework-grader";

type Params = { params: Promise<{ id: string }> };

const PASSING_PCT = 90;

// GET /api/assignments/[id]/quiz — fetch quiz for an assignment
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const assignmentId = parseInt(id);

  const quiz = await db
    .select()
    .from(homeworkQuizzes)
    .where(eq(homeworkQuizzes.assignmentId, assignmentId))
    .then((rows) => rows[0]);

  if (!quiz) {
    return NextResponse.json({ quiz: null });
  }

  return NextResponse.json({ quiz });
}

// POST /api/assignments/[id]/quiz — submit a quiz attempt
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const assignmentId = parseInt(id);

  const quiz = await db
    .select()
    .from(homeworkQuizzes)
    .where(eq(homeworkQuizzes.assignmentId, assignmentId))
    .then((rows) => rows[0]);

  if (!quiz) {
    return NextResponse.json({ error: "No quiz for this assignment" }, { status: 404 });
  }

  const body = await req.json();
  const studentAnswers = body.answers as string[];

  if (!Array.isArray(studentAnswers)) {
    return NextResponse.json({ error: "answers array required" }, { status: 400 });
  }

  const questions = quiz.questions as Array<{
    question: string;
    expectedAnswer: string;
  }>;

  if (studentAnswers.length !== questions.length) {
    return NextResponse.json(
      { error: `Expected ${questions.length} answers, got ${studentAnswers.length}` },
      { status: 400 }
    );
  }

  // Grade with AI
  let evaluations;
  try {
    evaluations = await gradeQuizAttempt(quiz.questions, studentAnswers);
  } catch (err) {
    console.error("Quiz grading failed:", err);
    return NextResponse.json(
      { error: "Grading failed. Try again." },
      { status: 500 }
    );
  }

  const correctCount = evaluations.filter((e) => e.correct).length;
  const scorePct = Math.round((correctCount / questions.length) * 100);

  const newAttempt = {
    submittedAt: new Date().toISOString(),
    answers: evaluations,
    scorePct,
  };

  const existingAttempts = (quiz.attempts as Array<typeof newAttempt>) || [];
  const allAttempts = [...existingAttempts, newAttempt];
  const passed = scorePct >= PASSING_PCT;
  const wasPassed = !!quiz.passedAt;
  const bestScore = Math.max(quiz.bestScorePct || 0, scorePct);

  await db
    .update(homeworkQuizzes)
    .set({
      attempts: allAttempts,
      bestScorePct: bestScore,
      passedAt: !wasPassed && passed ? new Date() : quiz.passedAt,
    })
    .where(eq(homeworkQuizzes.id, quiz.id));

  // If quiz passed, mark the assignment as fully done and clear any
  // linked checklist items
  if (!wasPassed && passed) {
    const assignment = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .then((rows) => rows[0]);
    if (assignment && assignment.status === "graded") {
      await db
        .update(assignments)
        .set({ status: "verified", verifiedAt: new Date() })
        .where(eq(assignments.id, assignmentId));
    }
    // Auto-complete the daily checklist quiz item(s)
    await db
      .update(dailyChecklist)
      .set({ completed: true, completedAt: new Date() })
      .where(eq(dailyChecklist.homeworkQuizId, quiz.id));
  }

  await logAction(session.userId, "submit_quiz", "homework_quiz", quiz.id, null, {
    scorePct,
    passed,
    attemptNumber: allAttempts.length,
  });

  return NextResponse.json({
    ok: true,
    scorePct,
    passed,
    passingThreshold: PASSING_PCT,
    evaluations,
    attemptNumber: allAttempts.length,
  });
}

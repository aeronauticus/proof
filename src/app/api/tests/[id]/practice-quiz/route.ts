import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tests, studyGuides, subjects } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { evaluatePracticeQuizAnswers } from "@/lib/ai/material-analyzer";
import { toISODate } from "@/lib/school-days";

type Params = { params: Promise<{ id: string }> };

// POST /api/tests/[id]/practice-quiz — submit quiz answers
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

  const guide = await db
    .select()
    .from(studyGuides)
    .where(eq(studyGuides.testId, testId))
    .then((rows) => rows[0]);

  if (!guide || !guide.practiceQuiz) {
    return NextResponse.json(
      { error: "No practice quiz available. Upload study materials first." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const studentAnswers: string[] = body.answers || [];

  const quiz = guide.practiceQuiz as Array<{
    question: string;
    choices?: string[];
    expectedAnswer: string;
    difficulty: "easy" | "medium" | "hard";
    sourceHint: string;
  }>;

  if (studentAnswers.length !== quiz.length) {
    return NextResponse.json(
      { error: `Expected ${quiz.length} answers, got ${studentAnswers.length}` },
      { status: 400 }
    );
  }

  // Get subject name for AI context
  const subject = await db
    .select()
    .from(subjects)
    .where(eq(subjects.id, test.subjectId))
    .then((rows) => rows[0]);

  // Evaluate answers
  const results = await evaluatePracticeQuizAnswers(
    quiz,
    studentAnswers,
    subject?.name || "Unknown"
  );

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const overallScore = Math.round(totalScore / results.length);

  // Append attempt to study guide
  const existingAttempts = (guide.quizAttempts as Array<{
    attemptDate: string;
    answers: Array<{
      questionIndex: number;
      studentAnswer: string;
      correct: boolean;
      feedback: string;
      score: number;
    }>;
    overallScore: number;
  }>) || [];

  const newAttempt = {
    attemptDate: toISODate(new Date()),
    answers: results.map((r, i) => ({
      questionIndex: r.questionIndex,
      studentAnswer: studentAnswers[i],
      correct: r.correct,
      feedback: r.feedback,
      score: r.score,
    })),
    overallScore,
  };

  await db
    .update(studyGuides)
    .set({
      quizAttempts: [...existingAttempts, newAttempt],
    })
    .where(eq(studyGuides.id, guide.id));

  await logAction(session.userId, "practice_quiz", "test", testId, null, {
    overallScore,
    questionCount: quiz.length,
  });

  return NextResponse.json({
    ok: true,
    results,
    overallScore,
    attemptNumber: existingAttempts.length + 1,
  });
}

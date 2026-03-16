import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tests, studyGuides, subjects, studyMaterials, studyPlans, studySessions } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import {
  evaluatePracticeQuizAnswers,
  regeneratePracticeQuiz,
  type PracticeQuizQuestion,
  type StudyGuideContent,
} from "@/lib/ai/material-analyzer";
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

  const attemptNumber = existingAttempts.length + 1;

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

  // Mark the next incomplete practice_test study session as completed
  const plan = await db
    .select({ id: studyPlans.id })
    .from(studyPlans)
    .where(eq(studyPlans.testId, testId))
    .then((rows) => rows[0]);

  let hasMorePracticeSessions = false;
  if (plan) {
    const incompletePracticeSessions = await db
      .select({ id: studySessions.id })
      .from(studySessions)
      .where(
        and(
          eq(studySessions.planId, plan.id),
          eq(studySessions.technique, "practice_test"),
          eq(studySessions.completed, false)
        )
      )
      .orderBy(studySessions.sessionDate, studySessions.sessionOrder);

    if (incompletePracticeSessions.length > 0) {
      await db
        .update(studySessions)
        .set({ completed: true })
        .where(eq(studySessions.id, incompletePracticeSessions[0].id));

      // More practice sessions remaining after this one?
      hasMorePracticeSessions = incompletePracticeSessions.length > 1;
    }
  }

  // Regenerate quiz with new questions in the background
  // so it's ready next time Jack opens it
  const guideContent = guide.content as StudyGuideContent;

  // Collect wrong answers from this attempt
  const wrongFromThis = results
    .filter((r) => !r.correct)
    .map((r) => ({
      question: quiz[r.questionIndex]?.question || "",
      studentAnswer: studentAnswers[r.questionIndex] || "",
      expectedAnswer: quiz[r.questionIndex]?.expectedAnswer || "",
      feedback: r.feedback,
    }));

  // Also collect wrong answers from all previous attempts
  const wrongFromPrevious = existingAttempts.flatMap((attempt) =>
    attempt.answers
      .filter((a) => !a.correct)
      .map((a) => ({
        question: quiz[a.questionIndex]?.question || "",
        studentAnswer: a.studentAnswer,
        expectedAnswer: quiz[a.questionIndex]?.expectedAnswer || "",
        feedback: a.feedback,
      }))
  );

  const allWrongAnswers = [...wrongFromThis, ...wrongFromPrevious];

  // Gather highlights and notes from materials
  const materialRows = await db
    .select({ extractedContent: studyMaterials.extractedContent })
    .from(studyMaterials)
    .where(eq(studyMaterials.testId, testId));

  const allHighlights: string[] = [];
  const allNotes: string[] = [];
  for (const m of materialRows) {
    if (m.extractedContent) {
      const ec = m.extractedContent as { highlightedText?: string[]; handwrittenNotes?: string[] };
      if (ec.highlightedText) allHighlights.push(...ec.highlightedText);
      if (ec.handwrittenNotes) allNotes.push(...ec.handwrittenNotes);
    }
  }

  // All previous questions (to avoid repeats)
  const allPreviousQuestions = quiz;

  // Fire and forget — regenerate in background
  regeneratePracticeQuiz(
    guideContent,
    allPreviousQuestions,
    allWrongAnswers,
    allHighlights,
    allNotes,
    subject?.name || "Unknown",
    test.topics,
    attemptNumber
  )
    .then(async (newQuiz) => {
      if (newQuiz.length > 0) {
        await db
          .update(studyGuides)
          .set({ practiceQuiz: newQuiz })
          .where(eq(studyGuides.id, guide.id));
        console.log(`Regenerated practice quiz for test ${testId}: ${newQuiz.length} new questions`);
      }
    })
    .catch((err) => {
      console.error(`Failed to regenerate practice quiz for test ${testId}:`, err);
    });

  return NextResponse.json({
    ok: true,
    results,
    overallScore,
    attemptNumber,
    hasMorePracticeSessions,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailyNotes, subjects } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { toISODate } from "@/lib/school-days";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { uploadDir, uploadUrl } from "@/lib/uploads";
import { evaluateNotes, evaluateManualNotes, evaluateAnswer } from "@/lib/ai/notes-evaluator";

// GET /api/notes?date=2026-03-14
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateStr =
    req.nextUrl.searchParams.get("date") || toISODate(new Date());

  const notes = await db
    .select({
      id: dailyNotes.id,
      date: dailyNotes.date,
      subjectId: dailyNotes.subjectId,
      subjectName: subjects.name,
      subjectColor: subjects.color,
      photoPath: dailyNotes.photoPath,
      summaryEvaluation: dailyNotes.summaryEvaluation,
      summaryFeedback: dailyNotes.summaryFeedback,
      summaryWordCount: dailyNotes.summaryWordCount,
      quizQuestions: dailyNotes.quizQuestions,
      quizAnswers: dailyNotes.quizAnswers,
      quizScore: dailyNotes.quizScore,
      quizCompletedAt: dailyNotes.quizCompletedAt,
    })
    .from(dailyNotes)
    .innerJoin(subjects, eq(dailyNotes.subjectId, subjects.id))
    .where(eq(dailyNotes.date, dateStr));

  return NextResponse.json({ notes });
}

// POST /api/notes — upload notes photo, AI evaluates + generates quiz
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("photo") as File | null;
  const subjectId = parseInt(formData.get("subjectId") as string);
  const date = (formData.get("date") as string) || toISODate(new Date());

  if (!file || !subjectId) {
    return NextResponse.json(
      { error: "photo and subjectId required" },
      { status: 400 }
    );
  }

  // Check for duplicate
  const existing = await db
    .select()
    .from(dailyNotes)
    .where(and(eq(dailyNotes.date, date), eq(dailyNotes.subjectId, subjectId)))
    .then((rows) => rows[0]);

  if (existing) {
    return NextResponse.json(
      { error: "Notes already uploaded for this subject today" },
      { status: 400 }
    );
  }

  // Get subject name for AI context
  const subject = await db
    .select()
    .from(subjects)
    .where(eq(subjects.id, subjectId))
    .then((rows) => rows[0]);

  // Save file
  const ext = file.name.split(".").pop() || "jpg";
  const filename = `notes-${date}-${subjectId}-${randomUUID()}.${ext}`;
  const dir = uploadDir("notes");
  await mkdir(dir, { recursive: true });
  const filepath = join(dir, filename);

  const bytes = await file.arrayBuffer();
  await writeFile(filepath, Buffer.from(bytes));

  const photoPath = uploadUrl("notes", filename);

  // Use AI to evaluate notes and generate quiz
  let evaluation;
  try {
    evaluation = await evaluateNotes(photoPath, subject?.name || "");
  } catch (err) {
    evaluation = {
      summaryEvaluation: "unreadable" as const,
      summaryWordCount: 0,
      feedback: "Could not evaluate notes. Please try a clearer photo.",
      quizQuestions: [],
    };
  }

  const [created] = await db
    .insert(dailyNotes)
    .values({
      date,
      subjectId,
      photoPath,
      summaryEvaluation: evaluation.summaryEvaluation,
      summaryFeedback: evaluation.feedback,
      summaryWordCount: evaluation.summaryWordCount,
      quizQuestions: evaluation.quizQuestions,
    })
    .returning();

  await logAction(session.userId, "upload", "notes", created.id, null, {
    subjectId,
    date,
    evaluation: evaluation.summaryEvaluation,
  });

  return NextResponse.json(
    {
      note: {
        ...created,
        subjectName: subject?.name,
        subjectColor: subject?.color,
      },
      evaluation,
    },
    { status: 201 }
  );
}

// PUT /api/notes — submit manually typed notes (when photo is unreadable)
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { noteId, subjectId, date, manualNotes } = await req.json();

  if (!manualNotes || !manualNotes.trim()) {
    return NextResponse.json({ error: "Notes text required" }, { status: 400 });
  }

  // Get subject name for AI context
  const subject = await db
    .select()
    .from(subjects)
    .where(eq(subjects.id, subjectId || 0))
    .then((rows) => rows[0]);

  // Evaluate the typed notes
  let evaluation;
  try {
    evaluation = await evaluateManualNotes(manualNotes, subject?.name || "");
  } catch {
    evaluation = {
      summaryEvaluation: "unreadable" as const,
      summaryWordCount: 0,
      feedback: "Could not evaluate notes.",
      quizQuestions: [],
    };
  }

  let note;
  if (noteId) {
    // Update existing unreadable note with manual text
    [note] = await db
      .update(dailyNotes)
      .set({
        manualNotes: manualNotes.trim(),
        summaryEvaluation: evaluation.summaryEvaluation,
        summaryFeedback: evaluation.feedback,
        summaryWordCount: evaluation.summaryWordCount,
        quizQuestions: evaluation.quizQuestions,
        // Clear old quiz answers since we have new questions
        quizAnswers: null,
        quizScore: null,
        quizCompletedAt: null,
      })
      .where(eq(dailyNotes.id, noteId))
      .returning();
  } else {
    // Create new note from manual text (no photo)
    const noteDate = date || toISODate(new Date());
    [note] = await db
      .insert(dailyNotes)
      .values({
        date: noteDate,
        subjectId,
        manualNotes: manualNotes.trim(),
        summaryEvaluation: evaluation.summaryEvaluation,
        summaryFeedback: evaluation.feedback,
        summaryWordCount: evaluation.summaryWordCount,
        quizQuestions: evaluation.quizQuestions,
      })
      .returning();
  }

  await logAction(session.userId, "manual_notes", "notes", note.id, null, {
    subjectId,
    evaluation: evaluation.summaryEvaluation,
  });

  return NextResponse.json({
    note: {
      ...note,
      subjectName: subject?.name,
      subjectColor: subject?.color,
    },
    evaluation,
  });
}

// DELETE /api/notes — remove a note (for re-upload when unreadable)
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { noteId } = await req.json();
  if (!noteId) {
    return NextResponse.json({ error: "noteId required" }, { status: 400 });
  }

  await db.delete(dailyNotes).where(eq(dailyNotes.id, noteId));
  return NextResponse.json({ ok: true });
}

// PATCH /api/notes — submit quiz answers
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { noteId, answers } = await req.json();

  const note = await db
    .select()
    .from(dailyNotes)
    .where(eq(dailyNotes.id, noteId))
    .then((rows) => rows[0]);

  if (!note || !note.quizQuestions) {
    return NextResponse.json({ error: "Note or quiz not found" }, { status: 404 });
  }

  const subject = await db
    .select()
    .from(subjects)
    .where(eq(subjects.id, note.subjectId))
    .then((rows) => rows[0]);

  // Evaluate each answer
  const questions = note.quizQuestions as Array<{
    question: string;
    expectedAnswer: string;
  }>;

  const evaluatedAnswers = [];
  let totalScore = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const studentAnswer = answers[i] || "";

    let evaluation;
    try {
      evaluation = await evaluateAnswer(
        q.question,
        q.expectedAnswer,
        studentAnswer,
        subject?.name || ""
      );
    } catch {
      evaluation = {
        correct: false,
        feedback: "Could not evaluate this answer.",
        score: 0,
      };
    }

    evaluatedAnswers.push({
      answer: studentAnswer,
      correct: evaluation.correct,
      feedback: evaluation.feedback,
    });
    totalScore += evaluation.score;
  }

  const avgScore =
    questions.length > 0 ? totalScore / questions.length : 0;

  await db
    .update(dailyNotes)
    .set({
      quizAnswers: evaluatedAnswers,
      quizScore: avgScore,
      quizCompletedAt: new Date(),
    })
    .where(eq(dailyNotes.id, noteId));

  await logAction(session.userId, "submit_quiz", "notes", noteId, null, {
    score: avgScore,
  });

  return NextResponse.json({
    answers: evaluatedAnswers,
    score: avgScore,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tests, studyMaterials, studyGuides, studyPlans, studySessions, dailyNotes } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { uploadDir, uploadUrl } from "@/lib/uploads";
import {
  extractMaterialContent,
  generateStudyGuide,
  enhanceSessionDescriptions,
  type PastPerformance,
} from "@/lib/ai/material-analyzer";

type Params = { params: Promise<{ id: string }> };

async function getTestById(testId: number) {
  return db
    .select()
    .from(tests)
    .where(eq(tests.id, testId))
    .then((rows) => rows[0] || null);
}

async function getMaterials(testId: number) {
  return db
    .select()
    .from(studyMaterials)
    .where(eq(studyMaterials.testId, testId))
    .orderBy(studyMaterials.uploadedAt);
}

async function getGuide(testId: number) {
  return db
    .select()
    .from(studyGuides)
    .where(eq(studyGuides.testId, testId))
    .then((rows) => rows[0] || null);
}

async function gatherPastPerformance(subjectId: number, currentTestId: number): Promise<PastPerformance> {
  const performance: PastPerformance = {
    pastTests: [],
    wrongAnswers: [],
    dailyNotesWrong: [],
  };

  // 1. Past graded tests/quizzes in this subject
  const pastTests = await db
    .select({
      title: tests.title,
      type: tests.type,
      scoreRaw: tests.scoreRaw,
      scoreTotal: tests.scoreTotal,
      letterGrade: tests.letterGrade,
      topics: tests.topics,
    })
    .from(tests)
    .where(
      and(
        eq(tests.subjectId, subjectId),
        eq(tests.status, "reviewed")
      )
    );

  // Also include "returned" tests (graded but not yet reviewed)
  const returnedTests = await db
    .select({
      title: tests.title,
      type: tests.type,
      scoreRaw: tests.scoreRaw,
      scoreTotal: tests.scoreTotal,
      letterGrade: tests.letterGrade,
      topics: tests.topics,
    })
    .from(tests)
    .where(
      and(
        eq(tests.subjectId, subjectId),
        eq(tests.status, "returned")
      )
    );

  performance.pastTests = [...pastTests, ...returnedTests];

  // 2. Wrong answers from practice quizzes on past tests in this subject
  const sameSubjectTests = await db
    .select({ id: tests.id, title: tests.title })
    .from(tests)
    .where(eq(tests.subjectId, subjectId));

  for (const t of sameSubjectTests) {
    if (t.id === currentTestId) continue; // skip current test
    const guide = await db
      .select({ practiceQuiz: studyGuides.practiceQuiz, quizAttempts: studyGuides.quizAttempts })
      .from(studyGuides)
      .where(eq(studyGuides.testId, t.id))
      .then((rows) => rows[0] || null);

    if (!guide || !guide.quizAttempts) continue;
    const attempts = guide.quizAttempts as Array<{
      answers: Array<{
        questionIndex: number;
        studentAnswer: string;
        correct: boolean;
        feedback: string;
      }>;
    }>;
    const quiz = guide.practiceQuiz as Array<{
      question: string;
      expectedAnswer: string;
    }>;

    // Get wrong answers from the most recent attempt
    const lastAttempt = attempts[attempts.length - 1];
    if (!lastAttempt) continue;

    for (const a of lastAttempt.answers) {
      if (!a.correct && quiz[a.questionIndex]) {
        performance.wrongAnswers.push({
          testTitle: t.title,
          question: quiz[a.questionIndex].question,
          studentAnswer: a.studentAnswer,
          expectedAnswer: quiz[a.questionIndex].expectedAnswer,
          feedback: a.feedback,
        });
      }
    }
  }

  // 3. Wrong answers from daily notes quizzes in this subject
  const notesWithQuizzes = await db
    .select({
      date: dailyNotes.date,
      quizQuestions: dailyNotes.quizQuestions,
      quizAnswers: dailyNotes.quizAnswers,
    })
    .from(dailyNotes)
    .where(eq(dailyNotes.subjectId, subjectId));

  for (const note of notesWithQuizzes) {
    if (!note.quizQuestions || !note.quizAnswers) continue;
    const questions = note.quizQuestions as Array<{ question: string }>;
    const answers = note.quizAnswers as Array<{
      answer: string;
      correct: boolean;
      feedback: string;
    }>;

    for (let i = 0; i < answers.length; i++) {
      if (!answers[i].correct && questions[i]) {
        performance.dailyNotesWrong.push({
          date: note.date,
          question: questions[i].question,
          studentAnswer: answers[i].answer,
          feedback: answers[i].feedback,
        });
      }
    }
  }

  return performance;
}

async function regenerateGuide(
  testId: number,
  subjectId: number,
  subjectName: string,
  testTopics: string | null,
  testTitle: string
) {
  const materials = await getMaterials(testId);
  const extractedContents = materials
    .map((m) => m.extractedContent)
    .filter((ec): ec is NonNullable<typeof ec> => ec !== null);

  if (extractedContents.length === 0) {
    // No materials left — delete guide
    await db.delete(studyGuides).where(eq(studyGuides.testId, testId));
    return null;
  }

  // Gather past performance data for this subject
  const pastPerformance = await gatherPastPerformance(subjectId, testId);

  // Generate study guide from all extracted content + past performance
  const { content, practiceQuiz } = await generateStudyGuide(
    extractedContents,
    subjectName,
    testTopics,
    testTitle,
    pastPerformance
  );

  // Upsert study guide
  const existing = await getGuide(testId);
  if (existing) {
    await db
      .update(studyGuides)
      .set({
        content,
        practiceQuiz,
        materialCount: materials.length,
        generatedAt: new Date(),
        // Preserve quiz attempts
      })
      .where(eq(studyGuides.id, existing.id));
  } else {
    await db.insert(studyGuides).values({
      testId,
      content,
      practiceQuiz,
      materialCount: materials.length,
    });
  }

  // Enhance study session descriptions
  const plan = await db
    .select()
    .from(studyPlans)
    .where(eq(studyPlans.testId, testId))
    .then((rows) => rows[0] || null);

  if (plan) {
    const sessions = await db
      .select({
        id: studySessions.id,
        technique: studySessions.technique,
        description: studySessions.description,
      })
      .from(studySessions)
      .where(eq(studySessions.planId, plan.id));

    const enhanced = enhanceSessionDescriptions(content, sessions);
    for (const s of enhanced) {
      await db
        .update(studySessions)
        .set({ description: s.description })
        .where(eq(studySessions.id, s.id));
    }
  }

  return await getGuide(testId);
}

// GET /api/tests/[id]/materials — fetch materials + study guide
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const testId = parseInt(id);

  const [materials, guide] = await Promise.all([
    getMaterials(testId),
    getGuide(testId),
  ]);

  return NextResponse.json({ materials, studyGuide: guide });
}

// POST /api/tests/[id]/materials — upload material photos
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const testId = parseInt(id);

  const test = await getTestById(testId);
  if (!test) {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }

  if (test.status !== "upcoming") {
    return NextResponse.json(
      { error: "Can only add study materials for upcoming tests" },
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

  // Get subject name for AI context
  const { subjects } = await import("@/lib/schema");
  const subject = await db
    .select()
    .from(subjects)
    .where(eq(subjects.id, test.subjectId))
    .then((rows) => rows[0]);
  const subjectName = subject?.name || "Unknown";

  // Save and process each photo
  const dir = uploadDir("study-materials");
  await mkdir(dir, { recursive: true });

  const newMaterials = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `material-${testId}-${randomUUID()}.${ext}`;
    const filepath = join(dir, filename);
    const bytes = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));

    const photoPath = uploadUrl("study-materials", filename);

    // Extract content from this photo using AI
    let extractedContent = null;
    try {
      extractedContent = await extractMaterialContent(
        photoPath,
        subjectName,
        test.topics
      );
    } catch (err) {
      console.error("Material extraction failed:", err);
    }

    const [inserted] = await db
      .insert(studyMaterials)
      .values({
        testId,
        photoPath,
        extractedContent,
      })
      .returning();

    newMaterials.push(inserted);

    await logAction(session.userId, "upload", "study_material", inserted.id, null, {
      testId,
      photoPath,
      sourceType: extractedContent?.sourceType,
    });
  }

  return NextResponse.json({
    ok: true,
    materials: newMaterials,
  });
}

// DELETE /api/tests/[id]/materials — remove a material
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const testId = parseInt(id);

  const body = await req.json();
  const materialId = body.materialId;

  if (!materialId) {
    return NextResponse.json({ error: "materialId required" }, { status: 400 });
  }

  // Verify material belongs to this test
  const material = await db
    .select()
    .from(studyMaterials)
    .where(eq(studyMaterials.id, materialId))
    .then((rows) => rows[0]);

  if (!material || material.testId !== testId) {
    return NextResponse.json({ error: "Material not found" }, { status: 404 });
  }

  await db.delete(studyMaterials).where(eq(studyMaterials.id, materialId));

  await logAction(session.userId, "delete", "study_material", materialId, null, {
    testId,
  });

  // If no materials remain, delete the study guide too
  const remaining = await getMaterials(testId);
  if (remaining.length === 0) {
    await db.delete(studyGuides).where(eq(studyGuides.testId, testId));
  }

  return NextResponse.json({ ok: true, remainingCount: remaining.length });
}

// In-memory tracker for background guide generation
const generatingTests = new Map<number, { status: "generating" | "done" | "error"; error?: string; startedAt: number }>();

// PATCH /api/tests/[id]/materials — kick off study guide generation in background
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const testId = parseInt(id);

  // Check if already generating
  const existing = generatingTests.get(testId);
  if (existing && existing.status === "generating") {
    return NextResponse.json({ status: "generating" });
  }

  const test = await getTestById(testId);
  if (!test) {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }

  const materials = await getMaterials(testId);
  if (materials.length === 0) {
    return NextResponse.json(
      { error: "No materials uploaded yet" },
      { status: 400 }
    );
  }

  const { subjects } = await import("@/lib/schema");
  const subject = await db
    .select()
    .from(subjects)
    .where(eq(subjects.id, test.subjectId))
    .then((rows) => rows[0]);
  const subjectName = subject?.name || "Unknown";

  // Mark as generating and run in background
  generatingTests.set(testId, { status: "generating", startedAt: Date.now() });

  // Fire and forget — don't await
  regenerateGuide(testId, test.subjectId, subjectName, test.topics, test.title)
    .then(() => {
      console.log(`Study guide generated for test ${testId}`);
      generatingTests.set(testId, { status: "done", startedAt: Date.now() });
      // Clean up after 5 minutes
      setTimeout(() => generatingTests.delete(testId), 5 * 60 * 1000);
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Study guide generation failed for test ${testId}:`, message, err);
      generatingTests.set(testId, { status: "error", error: message, startedAt: Date.now() });
      setTimeout(() => generatingTests.delete(testId), 5 * 60 * 1000);
    });

  return NextResponse.json({ status: "generating" });
}

// PUT /api/tests/[id]/materials — check generation status
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const testId = parseInt(id);

  const entry = generatingTests.get(testId);
  if (!entry) {
    return NextResponse.json({ status: "idle" });
  }

  if (entry.status === "error") {
    generatingTests.delete(testId);
    return NextResponse.json({ status: "error", error: entry.error });
  }

  if (entry.status === "done") {
    generatingTests.delete(testId);
    const guide = await getGuide(testId);
    return NextResponse.json({ status: "done", studyGuide: guide });
  }

  return NextResponse.json({ status: "generating", elapsed: Date.now() - entry.startedAt });
}

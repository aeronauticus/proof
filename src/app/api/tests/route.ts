import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tests, subjects, studyPlans, studySessions } from "@/lib/schema";
import { eq, and, gte, lte, inArray, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { toISODate, addSchoolDays } from "@/lib/school-days";
import { generateStudyPlan } from "@/lib/study-plan-generator";

// GET /api/tests?status=upcoming
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status");

  const result = await db
    .select({
      id: tests.id,
      subjectId: tests.subjectId,
      subjectName: subjects.name,
      subjectColor: subjects.color,
      type: tests.type,
      title: tests.title,
      topics: tests.topics,
      testDate: tests.testDate,
      status: tests.status,
      takenAt: tests.takenAt,
      expectedReturnDate: tests.expectedReturnDate,
      scoreRaw: tests.scoreRaw,
      scoreTotal: tests.scoreTotal,
      letterGrade: tests.letterGrade,
      aiConfidence: tests.aiConfidence,
      photoPath: tests.photoPath,
      photoPaths: tests.photoPaths,
      returnedAt: tests.returnedAt,
      correctionStatus: tests.correctionStatus,
      studentProposedScoreRaw: tests.studentProposedScoreRaw,
      studentProposedScoreTotal: tests.studentProposedScoreTotal,
      studentProposedLetterGrade: tests.studentProposedLetterGrade,
      reviewedBy: tests.reviewedBy,
      reviewedAt: tests.reviewedAt,
      parentNotes: tests.parentNotes,
      createdAt: tests.createdAt,
    })
    .from(tests)
    .innerJoin(subjects, eq(tests.subjectId, subjects.id))
    .where(
      status
        ? eq(tests.status, status as "upcoming" | "taken" | "returned" | "reviewed")
        : undefined
    )
    .orderBy(tests.testDate);

  return NextResponse.json({ tests: result });
}

// POST /api/tests — create new test/quiz (auto-generates study plan)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subjectId, type, title, topics, testDate } = await req.json();

  if (!subjectId || !type || !title || !testDate) {
    return NextResponse.json(
      { error: "subjectId, type, title, testDate required" },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(tests)
    .values({
      subjectId,
      type,
      title,
      topics: topics || null,
      testDate,
    })
    .returning();

  await logAction(session.userId, "create", "test", created.id, null, {
    subjectId,
    type,
    title,
    testDate,
  });

  // Generate study plan
  const subject = await db
    .select()
    .from(subjects)
    .where(eq(subjects.id, subjectId))
    .then((rows) => rows[0]);

  await generateStudyPlan(created.id, testDate, title, topics, subject?.name || "");

  return NextResponse.json({ test: created }, { status: 201 });
}

// PATCH /api/tests — lifecycle transitions
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, action, ...data } = await req.json();

  const test = await db
    .select()
    .from(tests)
    .where(eq(tests.id, id))
    .then((rows) => rows[0]);

  if (!test) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Student cannot delete or edit tests after creation (immutable)
  if (session.role === "student" && action === "edit") {
    return NextResponse.json(
      { error: "Students cannot edit tests" },
      { status: 403 }
    );
  }

  if (action === "edit") {
    if (session.role !== "parent") {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.testDate !== undefined) updates.testDate = data.testDate;
    if (data.subjectId !== undefined) updates.subjectId = data.subjectId;
    if (data.type !== undefined) updates.type = data.type;
    if (data.topics !== undefined) updates.topics = data.topics || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    await db.update(tests).set(updates).where(eq(tests.id, id));
    await logAction(session.userId, "edit", "test", id, null, updates);
    return NextResponse.json({ ok: true });
  }

  if (action === "take") {
    // Mark test as taken
    if (test.status !== "upcoming") {
      return NextResponse.json(
        { error: "Test is not in upcoming status" },
        { status: 400 }
      );
    }

    const expectedReturn = await addSchoolDays(test.testDate, 5);

    await db
      .update(tests)
      .set({
        status: "taken",
        takenAt: new Date(),
        expectedReturnDate: expectedReturn,
      })
      .where(eq(tests.id, id));

    await logAction(session.userId, "take", "test", id);
    return NextResponse.json({ ok: true, expectedReturnDate: expectedReturn });
  }

  if (action === "submit_correction") {
    // Student disputes AI-read score
    if (session.role !== "student") {
      return NextResponse.json({ error: "Student only" }, { status: 403 });
    }

    await db
      .update(tests)
      .set({
        studentProposedScoreRaw: data.scoreRaw,
        studentProposedScoreTotal: data.scoreTotal,
        studentProposedLetterGrade: data.letterGrade,
        correctionStatus: "pending",
        correctionReason: data.reason,
      })
      .where(eq(tests.id, id));

    await logAction(session.userId, "submit_correction", "test", id);
    return NextResponse.json({ ok: true });
  }

  if (action === "review_correction") {
    // Parent approves or rejects score correction
    if (session.role !== "parent") {
      return NextResponse.json({ error: "Parent only" }, { status: 403 });
    }

    const approved = data.approved === true;

    if (approved) {
      await db
        .update(tests)
        .set({
          scoreRaw: test.studentProposedScoreRaw,
          scoreTotal: test.studentProposedScoreTotal,
          letterGrade: test.studentProposedLetterGrade,
          correctionStatus: "approved",
        })
        .where(eq(tests.id, id));
    } else {
      await db
        .update(tests)
        .set({ correctionStatus: "rejected" })
        .where(eq(tests.id, id));
    }

    await logAction(session.userId, "review_correction", "test", id, null, {
      approved,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "review") {
    // Parent reviews the returned test
    if (session.role !== "parent") {
      return NextResponse.json({ error: "Parent only" }, { status: 403 });
    }

    await db
      .update(tests)
      .set({
        status: "reviewed",
        reviewedBy: session.userId,
        reviewedAt: new Date(),
        parentNotes: data.notes || null,
      })
      .where(eq(tests.id, id));

    await logAction(session.userId, "review", "test", id);
    return NextResponse.json({ ok: true });
  }

  if (action === "extend_return") {
    // Parent extends expected return date
    if (session.role !== "parent") {
      return NextResponse.json({ error: "Parent only" }, { status: 403 });
    }

    const newExpected = await addSchoolDays(
      test.expectedReturnDate || toISODate(new Date()),
      5
    );

    await db
      .update(tests)
      .set({ expectedReturnDate: newExpected })
      .where(eq(tests.id, id));

    await logAction(session.userId, "extend_return", "test", id);
    return NextResponse.json({ ok: true, expectedReturnDate: newExpected });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// DELETE /api/tests — parent-only delete (cascades to study plans, sessions, materials, guides)
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "parent") {
    return NextResponse.json({ error: "Parent access required" }, { status: 403 });
  }

  const { id } = await req.json();

  const test = await db
    .select()
    .from(tests)
    .where(eq(tests.id, id))
    .then((rows) => rows[0]);

  if (!test) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete related study sessions, then study plans
  const plans = await db
    .select()
    .from(studyPlans)
    .where(eq(studyPlans.testId, id));

  if (plans.length > 0) {
    const planIds = plans.map((p) => p.id);
    // Find study sessions to delete
    const sessions = await db
      .select({ id: studySessions.id })
      .from(studySessions)
      .where(inArray(studySessions.planId, planIds));
    if (sessions.length > 0) {
      const sessionIds = sessions.map((s) => s.id);
      // Clear FK references from checklist items before deleting sessions
      const { dailyChecklist } = await import("@/lib/schema");
      await db
        .update(dailyChecklist)
        .set({ studySessionId: null })
        .where(inArray(dailyChecklist.studySessionId, sessionIds));
      await db.delete(studySessions).where(inArray(studySessions.planId, planIds));
    }
    await db.delete(studyPlans).where(eq(studyPlans.testId, id));
  }

  // Delete study materials and guides
  const { studyMaterials, studyGuides } = await import("@/lib/schema");
  await db.delete(studyMaterials).where(eq(studyMaterials.testId, id));
  await db.delete(studyGuides).where(eq(studyGuides.testId, id));

  // Delete the test itself
  await db.delete(tests).where(eq(tests.id, id));

  await logAction(session.userId, "delete", "test", id, null, {
    title: test.title,
    testDate: test.testDate,
  });

  return NextResponse.json({ ok: true });
}

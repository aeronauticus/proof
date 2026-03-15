import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { studySessions, studyPlans, tests, subjects, studyMaterials } from "@/lib/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getSession } from "@/lib/auth";

/**
 * GET /api/study-progress?from=2026-03-14&to=2026-03-21
 *
 * Returns upcoming tests with their study plan progress:
 * - Test info (subject, title, date, type)
 * - Total study sessions
 * - Completed study sessions
 * - Next upcoming session (if any)
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];
  const from = req.nextUrl.searchParams.get("from") || today;
  // Default: 14 days out to catch tests with study sessions starting now
  const defaultTo = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
  const to = req.nextUrl.searchParams.get("to") || defaultTo;

  // Get all upcoming/taken tests in the date range
  const upcomingTests = await db
    .select({
      testId: tests.id,
      testTitle: tests.title,
      testDate: tests.testDate,
      testType: tests.type,
      testStatus: tests.status,
      subjectName: subjects.name,
      subjectColor: subjects.color,
    })
    .from(tests)
    .innerJoin(subjects, eq(tests.subjectId, subjects.id))
    .where(
      and(
        gte(tests.testDate, from),
        lte(tests.testDate, to)
      )
    )
    .orderBy(tests.testDate);

  // For each test, get its study sessions
  const result = [];
  for (const test of upcomingTests) {
    const plans = await db
      .select({ planId: studyPlans.id })
      .from(studyPlans)
      .where(eq(studyPlans.testId, test.testId));

    if (plans.length === 0) {
      const materialsRows = await db
        .select({ id: studyMaterials.id })
        .from(studyMaterials)
        .where(eq(studyMaterials.testId, test.testId));
      result.push({
        ...test,
        totalSessions: 0,
        completedSessions: 0,
        materialCount: materialsRows.length,
        sessions: [],
      });
      continue;
    }

    const sessions = await db
      .select({
        id: studySessions.id,
        sessionDate: studySessions.sessionDate,
        title: studySessions.title,
        technique: studySessions.technique,
        durationMin: studySessions.durationMin,
        description: studySessions.description,
        completed: studySessions.completed,
      })
      .from(studySessions)
      .where(eq(studySessions.planId, plans[0].planId))
      .orderBy(studySessions.sessionDate, studySessions.sessionOrder);

    const completedSessions = sessions.filter((s) => s.completed).length;
    const nextSession = sessions.find(
      (s) => !s.completed && s.sessionDate >= today
    );

    // Count study materials uploaded for this test
    const materialsRows = await db
      .select({ id: studyMaterials.id })
      .from(studyMaterials)
      .where(eq(studyMaterials.testId, test.testId));

    result.push({
      ...test,
      totalSessions: sessions.length,
      completedSessions,
      nextSession: nextSession || null,
      materialCount: materialsRows.length,
      sessions,
    });
  }

  return NextResponse.json({ tests: result });
}

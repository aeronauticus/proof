import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  dailyChecklist,
  checklistTemplates,
  scheduleSlots,
  subjects,
  studySessions,
  studyPlans,
  tests,
  plannerPhotos,
} from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { toISODate, isSchoolDay, isBreakDay } from "@/lib/school-days";

/**
 * Generate the daily checklist for a given date.
 * Combines fixed templates with dynamic "Review [Subject] Notes" items.
 */
async function generateChecklist(dateStr: string, dayOfWeek: string) {
  // Check if already generated
  const existing = await db
    .select()
    .from(dailyChecklist)
    .where(eq(dailyChecklist.date, dateStr));

  if (existing.length > 0) return existing;

  const isWeekend = dayOfWeek === "sat" || dayOfWeek === "sun";

  // Get templates applicable to this day
  const templates = await db.select().from(checklistTemplates);
  const applicableTemplates = templates.filter((t) =>
    (t.applicableDays as string[]).includes(dayOfWeek)
  );

  // Get today's subjects for dynamic items (only on school days)
  let reviewSubjects: Array<{ slotId: number; subjectId: number; subjectName: string; startTime: string }> = [];
  if (!isWeekend) {
    const todaySlots = await db
      .select({
        slotId: scheduleSlots.id,
        subjectId: scheduleSlots.subjectId,
        subjectName: subjects.name,
        startTime: scheduleSlots.startTime,
      })
      .from(scheduleSlots)
      .innerJoin(subjects, eq(scheduleSlots.subjectId, subjects.id))
      .where(eq(scheduleSlots.dayOfWeek, dayOfWeek as "mon" | "tue" | "wed" | "thu" | "fri"))
      .orderBy(scheduleSlots.startTime);

    // Filter out Math from note review subjects
    reviewSubjects = todaySlots.filter((s) => s.subjectName !== "Math");
  }

  // Get any study sessions due today
  const todayStudySessions = await db
    .select({
      sessionId: studySessions.id,
      sessionTitle: studySessions.title,
      testTitle: tests.title,
      subjectName: subjects.name,
    })
    .from(studySessions)
    .innerJoin(studyPlans, eq(studySessions.planId, studyPlans.id))
    .innerJoin(tests, eq(studyPlans.testId, tests.id))
    .innerJoin(subjects, eq(tests.subjectId, subjects.id))
    .where(
      and(
        eq(studySessions.sessionDate, dateStr),
        eq(studySessions.completed, false)
      )
    );

  const items: Array<{
    templateId: number | null;
    date: string;
    title: string;
    subjectId: number | null;
    orderIndex: number;
    requiresParent: boolean;
  }> = [];

  let orderIdx = 0;

  for (const template of applicableTemplates.sort(
    (a, b) => a.orderIndex - b.orderIndex
  )) {
    if (template.isDynamic) {
      // Expand "Review [Subject] Notes" for each subject today (except Math)
      for (const slot of reviewSubjects) {
        orderIdx++;
        items.push({
          templateId: template.id,
          date: dateStr,
          title: `Review ${slot.subjectName} Notes`,
          subjectId: slot.subjectId,
          orderIndex: orderIdx,
          requiresParent: template.requiresParent,
        });
      }
    } else {
      orderIdx++;
      items.push({
        templateId: template.id,
        date: dateStr,
        title: template.title,
        subjectId: null,
        orderIndex: orderIdx,
        requiresParent: template.requiresParent,
      });
    }
  }

  // Add study sessions as checklist items
  for (const session of todayStudySessions) {
    orderIdx++;
    items.push({
      templateId: null,
      date: dateStr,
      title: `Study for ${session.subjectName} — ${session.testTitle}`,
      subjectId: null,
      orderIndex: orderIdx,
      requiresParent: false,
    });
  }

  if (items.length > 0) {
    await db.insert(dailyChecklist).values(items);
  }

  return db
    .select()
    .from(dailyChecklist)
    .where(eq(dailyChecklist.date, dateStr))
    .orderBy(dailyChecklist.orderIndex);
}

// GET /api/checklist?date=2026-03-14
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateStr =
    req.nextUrl.searchParams.get("date") || toISODate(new Date());

  // Check if it's a break (summer, holiday, etc.) — fully dormant
  const onBreak = await isBreakDay(dateStr);
  if (onBreak) {
    return NextResponse.json({ items: [], isSchoolDay: false, isBreak: true });
  }

  // Determine day of week (works for weekdays and weekends)
  const date = new Date(dateStr + "T12:00:00");
  const dow = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getDay()];
  const schoolDay = await isSchoolDay(dateStr);

  const items = await generateChecklist(dateStr, dow);

  // Check if planner photo exists (only relevant on school days)
  let hasPlannerPhoto = false;
  if (schoolDay) {
    const plannerPhoto = await db
      .select()
      .from(plannerPhotos)
      .where(eq(plannerPhotos.date, dateStr))
      .then((rows) => rows[0] || null);
    hasPlannerPhoto = !!plannerPhoto;
  }

  return NextResponse.json({
    items,
    isSchoolDay: schoolDay,
    hasPlannerPhoto,
  });
}

// PATCH /api/checklist — toggle completion or verify
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId, action } = await req.json();

  if (action === "complete") {
    // Student marks item as completed
    const item = await db
      .select()
      .from(dailyChecklist)
      .where(eq(dailyChecklist.id, itemId))
      .then((rows) => rows[0]);

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Check planner photo gate: Organization can't be checked without planner photo
    if (item.title === "Organization") {
      const plannerPhoto = await db
        .select()
        .from(plannerPhotos)
        .where(eq(plannerPhotos.date, item.date))
        .then((rows) => rows[0]);

      if (!plannerPhoto) {
        return NextResponse.json(
          { error: "Upload planner photo first" },
          { status: 400 }
        );
      }
    }

    await db
      .update(dailyChecklist)
      .set({ completed: true, completedAt: new Date() })
      .where(eq(dailyChecklist.id, itemId));

    await logAction(session.userId, "complete", "checklist", itemId);

    return NextResponse.json({ ok: true });
  }

  if (action === "verify") {
    // Parent verifies item
    if (session.role !== "parent") {
      return NextResponse.json(
        { error: "Parent access required" },
        { status: 403 }
      );
    }

    await db
      .update(dailyChecklist)
      .set({ verifiedBy: session.userId, verifiedAt: new Date() })
      .where(eq(dailyChecklist.id, itemId));

    await logAction(session.userId, "verify", "checklist", itemId);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

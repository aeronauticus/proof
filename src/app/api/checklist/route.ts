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
import { eq, and, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { toISODate, isSchoolDay, isBreakDay } from "@/lib/school-days";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { uploadDir as getUploadDir, uploadUrl } from "@/lib/uploads";

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
      sessionTechnique: studySessions.technique,
      sessionDuration: studySessions.durationMin,
      sessionDescription: studySessions.description,
      testTitle: tests.title,
      testDate: tests.testDate,
      subjectName: subjects.name,
      subjectId: subjects.id,
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
    studySessionId: number | null;
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
          studySessionId: null,
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
        studySessionId: null,
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
      subjectId: session.subjectId,
      studySessionId: session.sessionId,
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

  const rawDate =
    req.nextUrl.searchParams.get("date") || toISODate(new Date());

  // Check if it's a break (summer, holiday, etc.) — fully dormant
  const onBreak = await isBreakDay(rawDate);
  if (onBreak) {
    return NextResponse.json({ items: [], isSchoolDay: false, isBreak: true });
  }

  // Determine day of week
  const date = new Date(rawDate + "T12:00:00");
  const dayIndex = date.getDay();
  const dow = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dayIndex];
  const isWeekend = dayIndex === 0 || dayIndex === 6;
  const schoolDay = !isWeekend;

  // Weekend: use Saturday's date as the canonical date so Sat+Sun share one checklist
  let dateStr = rawDate;
  if (dayIndex === 0) {
    // Sunday — roll back to Saturday
    const sat = new Date(date);
    sat.setDate(sat.getDate() - 1);
    dateStr = toISODate(sat);
  }

  // For weekend checklists, generate using "sat" as the day key
  const checklistDow = isWeekend ? "sat" : dow;
  const items = await generateChecklist(dateStr, checklistDow);

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

  // Enrich study session items with context (test date, technique, duration, description)
  const studySessionIds = items
    .filter((i) => i.studySessionId)
    .map((i) => i.studySessionId as number);

  const studyContextMap: Record<number, {
    testDate: string;
    technique: string;
    durationMin: number;
    description: string | null;
    testTitle: string;
    subjectName: string;
  }> = {};

  if (studySessionIds.length > 0) {
    const sessionRows = await db
      .select({
        sessionId: studySessions.id,
        technique: studySessions.technique,
        durationMin: studySessions.durationMin,
        description: studySessions.description,
        testDate: tests.testDate,
        testTitle: tests.title,
        subjectName: subjects.name,
      })
      .from(studySessions)
      .innerJoin(studyPlans, eq(studySessions.planId, studyPlans.id))
      .innerJoin(tests, eq(studyPlans.testId, tests.id))
      .innerJoin(subjects, eq(tests.subjectId, subjects.id))
      .where(inArray(studySessions.id, studySessionIds));

    for (const row of sessionRows) {
      studyContextMap[row.sessionId] = {
        testDate: row.testDate,
        technique: row.technique,
        durationMin: row.durationMin,
        description: row.description,
        testTitle: row.testTitle,
        subjectName: row.subjectName,
      };
    }
  }

  const enrichedItems = items.map((item) => {
    if (item.studySessionId && studyContextMap[item.studySessionId]) {
      return { ...item, studyContext: studyContextMap[item.studySessionId] };
    }
    return item;
  });

  return NextResponse.json({
    items: enrichedItems,
    isSchoolDay: schoolDay,
    hasPlannerPhoto,
  });
}

// PATCH /api/checklist — complete or verify a checklist item
// Accepts JSON for simple complete/verify, or FormData for photo-required items
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";

  let itemId: number;
  let action: string;
  let notes: string | null = null;
  let photoFiles: File[] = [];

  if (contentType.includes("multipart/form-data")) {
    // FormData — used for photo uploads
    const formData = await req.formData();
    itemId = parseInt(formData.get("itemId") as string);
    action = formData.get("action") as string;
    notes = (formData.get("notes") as string) || null;
    photoFiles = formData.getAll("photos") as File[];
    // Also support single "photo" field for backwards compat
    const single = formData.get("photo") as File | null;
    if (single && photoFiles.length === 0) photoFiles = [single];
  } else {
    // JSON — used for simple complete/verify and reading notes
    const body = await req.json();
    itemId = body.itemId;
    action = body.action;
    notes = body.notes || null;
  }

  // Helper: save multiple photos, return array of paths
  async function savePhotos(files: File[], date: string, id: number): Promise<string[]> {
    const dir = getUploadDir("checklist");
    await mkdir(dir, { recursive: true });
    const paths: string[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop() || "jpg";
      const filename = `checklist-${date}-${id}-${randomUUID()}.${ext}`;
      const filepath = join(dir, filename);
      const bytes = await file.arrayBuffer();
      await writeFile(filepath, Buffer.from(bytes));
      paths.push(uploadUrl("checklist", filename));
    }
    return paths;
  }

  // Action: add_photos — upload photos to an item without marking it complete
  if (action === "add_photos") {
    const item = await db
      .select()
      .from(dailyChecklist)
      .where(eq(dailyChecklist.id, itemId))
      .then((rows) => rows[0]);

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (photoFiles.length === 0) {
      return NextResponse.json({ error: "No photos provided" }, { status: 400 });
    }

    const newPaths = await savePhotos(photoFiles, item.date, itemId);
    const existing = (item.photoPaths as string[] | null) || [];
    const allPaths = [...existing, ...newPaths];

    await db
      .update(dailyChecklist)
      .set({ photoPaths: allPaths })
      .where(eq(dailyChecklist.id, itemId));

    return NextResponse.json({ ok: true, photoPaths: allPaths });
  }

  if (action === "complete") {
    const item = await db
      .select()
      .from(dailyChecklist)
      .where(eq(dailyChecklist.id, itemId))
      .then((rows) => rows[0]);

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Gate: Organization requires planner photo
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

    // Homework completion is now driven by per-assignment photo uploads
    // No photo gate on the checklist item itself

    // Gate: Reading / Memory Work requires notes
    if (item.title === "Reading / Memory Work") {
      if (!notes || notes.trim().length < 10) {
        return NextResponse.json(
          { error: "Please describe what you read or practiced (at least a couple sentences)" },
          { status: 400 }
        );
      }
    }

    // Save any new photos
    const newPaths = photoFiles.length > 0
      ? await savePhotos(photoFiles, item.date, itemId)
      : [];
    const existingPaths = (item.photoPaths as string[] | null) || [];
    const allPaths = [...existingPaths, ...newPaths];

    await db
      .update(dailyChecklist)
      .set({
        completed: true,
        completedAt: new Date(),
        notes: notes || item.notes,
        photoPaths: allPaths.length > 0 ? allPaths : item.photoPaths,
      })
      .where(eq(dailyChecklist.id, itemId));

    // Sync study session completion if this checklist item is linked to one
    if (item.studySessionId) {
      await db
        .update(studySessions)
        .set({ completed: true, completedAt: new Date() })
        .where(eq(studySessions.id, item.studySessionId));
    }

    await logAction(session.userId, "complete", "checklist", itemId, null, {
      photoCount: allPaths.length,
      hasNotes: !!notes,
    });

    return NextResponse.json({ ok: true, photoPaths: allPaths });
  }

  // Action: confirm_complete — Jack confirms homework is done despite AI warning
  if (action === "confirm_complete") {
    const item = await db
      .select()
      .from(dailyChecklist)
      .where(eq(dailyChecklist.id, itemId))
      .then((rows) => rows[0]);

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await db
      .update(dailyChecklist)
      .set({
        completed: true,
        completedAt: new Date(),
        studentConfirmedComplete: true,
      })
      .where(eq(dailyChecklist.id, itemId));

    // Sync study session completion if linked
    if (item.studySessionId) {
      await db
        .update(studySessions)
        .set({ completed: true, completedAt: new Date() })
        .where(eq(studySessions.id, item.studySessionId));
    }

    await logAction(session.userId, "confirm_complete", "checklist", itemId, null, {
      overrodeAiWarning: true,
      aiHomeworkEval: item.aiHomeworkEval,
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "verify") {
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

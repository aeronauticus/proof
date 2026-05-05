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
  assignments,
  homeworkQuizzes,
} from "@/lib/schema";
import { eq, and, inArray, isNull, gte, lte } from "drizzle-orm";
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
/**
 * Compute "next school day" from a reference date — skipping weekends.
 * If the next calendar day is a weekday, return that. If it's a weekend,
 * skip to Monday.
 */
function nextSchoolDayAfter(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split("T")[0];
}

/**
 * Returns true if there's pending homework "imminent" relative to the
 * given date — meaning Jack needs to upload photos tonight. Rules:
 * - Regular HW: due today (not yet submitted), OR due the next school day
 * - Project: due in the next 7 days (gives Jack early visibility)
 */
async function hasUpcomingHomework(dateStr: string): Promise<boolean> {
  const nextSchool = nextSchoolDayAfter(dateStr);
  const itemDate = new Date(dateStr + "T00:00:00");
  const weekOut = new Date(itemDate);
  weekOut.setDate(weekOut.getDate() + 7);
  const weekOutStr = weekOut.toISOString().split("T")[0];

  const due = await db
    .select()
    .from(assignments)
    .where(
      and(
        eq(assignments.status, "pending"),
        gte(assignments.dueDate, dateStr),
        lte(assignments.dueDate, weekOutStr)
      )
    );

  return due.some((a) => {
    if (a.isProject) return true; // any pending project in the 7-day window
    return a.dueDate === dateStr || a.dueDate === nextSchool;
  });
}

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

    // Filter out subjects that don't require note review
    const excludeFromReview = ["Math", "Comp/Lit", "Latin"];
    reviewSubjects = todaySlots.filter((s) => !excludeFromReview.includes(s.subjectName));
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
    homeworkQuizId: number | null;
    orderIndex: number;
    requiresParent: boolean;
  }> = [];

  let orderIdx = 0;

  // Decide if Homework wrapper is needed based on actual upcoming work
  const needsHomework = await hasUpcomingHomework(dateStr);

  for (const template of applicableTemplates.sort(
    (a, b) => a.orderIndex - b.orderIndex
  )) {
    // Skip the Homework template if there's nothing due — prevents daily clutter
    if (template.title === "Homework" && !needsHomework) continue;

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
          homeworkQuizId: null,
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
        homeworkQuizId: null,
        orderIndex: orderIdx,
        requiresParent: template.requiresParent,
      });
    }
  }

  // Fallback: if homework is due tomorrow but the Homework template wasn't
  // applicable today (e.g. Sunday), add the wrapper anyway so Jack uploads
  // photos before bed.
  if (needsHomework && !items.some((i) => i.title === "Homework")) {
    const hwTemplate = templates.find((t) => t.title === "Homework");
    orderIdx++;
    items.push({
      templateId: hwTemplate?.id || null,
      date: dateStr,
      title: "Homework",
      subjectId: null,
      studySessionId: null,
      homeworkQuizId: null,
      orderIndex: orderIdx,
      requiresParent: hwTemplate?.requiresParent ?? false,
    });
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
      homeworkQuizId: null,
      orderIndex: orderIdx,
      requiresParent: false,
    });
  }

  // Add homework quizzes that haven't been passed yet
  const pendingQuizzes = await db
    .select({
      quizId: homeworkQuizzes.id,
      assignmentId: homeworkQuizzes.assignmentId,
      assignmentTitle: assignments.title,
      subjectId: assignments.subjectId,
      subjectName: subjects.name,
    })
    .from(homeworkQuizzes)
    .innerJoin(assignments, eq(homeworkQuizzes.assignmentId, assignments.id))
    .innerJoin(subjects, eq(assignments.subjectId, subjects.id))
    .where(isNull(homeworkQuizzes.passedAt));

  for (const quiz of pendingQuizzes) {
    orderIdx++;
    items.push({
      templateId: null,
      date: dateStr,
      title: `Homework Quiz: ${quiz.subjectName} — ${quiz.assignmentTitle}`,
      subjectId: quiz.subjectId,
      studySessionId: null,
      homeworkQuizId: quiz.quizId,
      orderIndex: orderIdx,
      requiresParent: false,
    });
  }

  // NOTE: Incomplete items from previous days are no longer duplicated here.
  // They are surfaced separately via GET /api/checklist/missing and shown
  // as "missing" on the dashboard until completed or waived by a parent.

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
  let items = await generateChecklist(dateStr, checklistDow);

  // Self-heal: keep the Homework wrapper in sync with actual pending work.
  // - If wrapper missing but homework is due → insert it.
  // - If wrapper completed but new pending work has appeared → reopen it.
  // - If wrapper open but no pending work needs photos → leave alone (Jack
  //   can click "No Homework Today" to clear it).
  {
    const needs = await hasUpcomingHomework(dateStr);
    const existing = items.find((i) => i.title === "Homework");

    if (needs && !existing) {
      const templates = await db.select().from(checklistTemplates);
      const hwTemplate = templates.find((t) => t.title === "Homework");
      const maxOrder = items.reduce((m, i) => Math.max(m, i.orderIndex), 0);
      await db.insert(dailyChecklist).values({
        templateId: hwTemplate?.id || null,
        date: dateStr,
        title: "Homework",
        subjectId: null,
        studySessionId: null,
        homeworkQuizId: null,
        orderIndex: maxOrder + 1,
        requiresParent: hwTemplate?.requiresParent ?? false,
      });
      items = await db
        .select()
        .from(dailyChecklist)
        .where(eq(dailyChecklist.date, dateStr))
        .orderBy(dailyChecklist.orderIndex);
    } else if (needs && existing && existing.completed) {
      // Reopen — new pending homework arrived after wrapper was checked off
      await db
        .update(dailyChecklist)
        .set({ completed: false, completedAt: null })
        .where(eq(dailyChecklist.id, existing.id));
      items = await db
        .select()
        .from(dailyChecklist)
        .where(eq(dailyChecklist.date, dateStr))
        .orderBy(dailyChecklist.orderIndex);
    }
  }

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
  let quizletConfirmed: boolean | string = false;

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
    quizletConfirmed = (formData.get("quizletConfirmed") as string) || false;
  } else {
    // JSON — used for simple complete/verify and reading notes
    const body = await req.json();
    itemId = body.itemId;
    action = body.action;
    notes = body.notes || null;
    quizletConfirmed = body.quizletConfirmed === true;
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

    // Gate: Homework wrapper — every imminent assignment (matching the
    // hasUpcomingHomework rules) must have at least one photo uploaded OR
    // be marked already_turned_in
    if (item.title === "Homework") {
      const nextSchool = nextSchoolDayAfter(item.date);
      const itemDate = new Date(item.date + "T00:00:00");
      const weekOut = new Date(itemDate);
      weekOut.setDate(weekOut.getDate() + 7);
      const weekOutStr = weekOut.toISOString().split("T")[0];

      const dueAssignments = await db
        .select()
        .from(assignments)
        .where(
          and(
            eq(assignments.status, "pending"),
            gte(assignments.dueDate, item.date),
            lte(assignments.dueDate, weekOutStr)
          )
        );

      // Match hasUpcomingHomework rules
      const requiringPhoto = dueAssignments.filter((a) => {
        if (a.isProject) return true;
        return a.dueDate === item.date || a.dueDate === nextSchool;
      });

      const missingPhoto = requiringPhoto.filter((a) => {
        const paths = (a.photoPaths as string[] | null) || [];
        return paths.length === 0 && !a.studentConfirmedComplete;
      });

      if (missingPhoto.length > 0) {
        const titles = missingPhoto.map((a) => a.title).join(", ");
        return NextResponse.json(
          {
            error: `Upload a photo of completed homework first: ${titles}`,
            missingAssignmentIds: missingPhoto.map((a) => a.id),
          },
          { status: 400 }
        );
      }
    }

    // Gate: Homework Quiz items can only be completed via /api/assignments/[id]/quiz
    // — they auto-complete when Jack scores >=90%. Block manual checking off.
    if (item.homeworkQuizId) {
      const quiz = await db
        .select()
        .from(homeworkQuizzes)
        .where(eq(homeworkQuizzes.id, item.homeworkQuizId))
        .then((rows) => rows[0]);

      if (!quiz || !quiz.passedAt) {
        return NextResponse.json(
          { error: "Open the quiz from the Homework page and score 90%+ to clear this." },
          { status: 400 }
        );
      }
    }

    // Gate: Reading / Memory Work requires notes
    if (item.title === "Reading / Memory Work") {
      if (!notes || notes.trim().length < 10) {
        return NextResponse.json(
          { error: "Please describe what you read or practiced (at least a couple sentences)" },
          { status: 400 }
        );
      }
    }

    // Gate: Review [Subject] Notes requires a note photo for that subject + date
    if (item.title.startsWith("Review ") && item.title.endsWith(" Notes") && item.subjectId) {
      const { dailyNotes } = await import("@/lib/schema");
      const note = await db
        .select()
        .from(dailyNotes)
        .where(
          and(
            eq(dailyNotes.date, item.date),
            eq(dailyNotes.subjectId, item.subjectId)
          )
        )
        .then((rows) => rows[0]);

      const hasPhoto = note && (
        (note.photoPath && note.photoPath.length > 0) ||
        (Array.isArray(note.photoPaths) && (note.photoPaths as string[]).length > 0)
      );
      const hasManualText = note && note.manualNotes && note.manualNotes.trim().length >= 20;

      if (!hasPhoto && !hasManualText) {
        return NextResponse.json(
          {
            error: "Upload a photo of today's notes for this subject (or type them in) before checking off.",
            requiresNotesUpload: true,
            subjectId: item.subjectId,
          },
          { status: 400 }
        );
      }
    }

    // Gate: Practice Latin on Quizlet requires a 15-minute confirmation
    if (item.title === "Practice Latin on Quizlet") {
      const confirmed = quizletConfirmed === true || quizletConfirmed === "true";
      if (!confirmed) {
        return NextResponse.json(
          {
            error: "Confirm you practiced Latin on Quizlet for at least 15 minutes.",
            requiresQuizletConfirmation: true,
          },
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

  if (action === "waive") {
    if (session.role !== "parent") {
      return NextResponse.json(
        { error: "Parent access required" },
        { status: 403 }
      );
    }

    await db
      .update(dailyChecklist)
      .set({ waivedBy: session.userId, waivedAt: new Date() })
      .where(eq(dailyChecklist.id, itemId));

    await logAction(session.userId, "waive", "checklist", itemId);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

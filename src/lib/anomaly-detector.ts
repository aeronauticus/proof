import { db } from "./db";
import {
  assignments,
  dailyChecklist,
  dailyNotes,
  scheduleSlots,
  tests,
  plannerPhotos,
  subjects,
} from "./schema";
import { eq, and, sql } from "drizzle-orm";
import { toISODate } from "./school-days";

export interface AnomalyFlag {
  type:
    | "no_planner_photo"
    | "empty_day"
    | "missing_subjects"
    | "late_test_entry"
    | "brief_summary"
    | "low_completion";
  severity: "warning" | "alert";
  message: string;
}

/**
 * Detect anomalies for a given date. Returns an array of flags.
 */
export async function detectAnomalies(dateStr: string): Promise<AnomalyFlag[]> {
  const flags: AnomalyFlag[] = [];

  // Determine day of week
  const date = new Date(dateStr + "T00:00:00");
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const dow = days[date.getDay()];
  if (dow === "sun" || dow === "sat") return flags; // not a school day

  // 1. No planner photo
  const photos = await db
    .select()
    .from(plannerPhotos)
    .where(eq(plannerPhotos.date, dateStr));
  if (photos.length === 0) {
    flags.push({
      type: "no_planner_photo",
      severity: "alert",
      message: "No planner photo uploaded today.",
    });
  }

  // 2. Get today's scheduled subjects (excluding Math for notes)
  const todaySlots = await db
    .select({ subjectId: scheduleSlots.subjectId })
    .from(scheduleSlots)
    .where(eq(scheduleSlots.dayOfWeek, dow));

  const scheduledSubjectIds = [...new Set(todaySlots.map((s) => s.subjectId))];

  // 3. Empty day — no assignments entered on a school day
  const todayAssignments = await db
    .select()
    .from(assignments)
    .where(eq(assignments.assignedDate, dateStr));
  if (todayAssignments.length === 0 && scheduledSubjectIds.length > 0) {
    flags.push({
      type: "empty_day",
      severity: "warning",
      message: `No assignments entered on a school day (${scheduledSubjectIds.length} classes today).`,
    });
  }

  // 4. Missing subjects — entered assignments for some subjects but not others
  if (todayAssignments.length > 0) {
    const enteredSubjectIds = new Set(todayAssignments.map((a) => a.subjectId));
    const missing = scheduledSubjectIds.filter((id) => !enteredSubjectIds.has(id));
    if (missing.length > 0) {
      // Look up subject names
      const allSubjects = await db.select().from(subjects);
      const subjectMap = new Map(allSubjects.map((s) => [s.id, s.name]));
      const missingNames = missing.map((id) => subjectMap.get(id) || "Unknown");
      flags.push({
        type: "missing_subjects",
        severity: "warning",
        message: `Missing assignments for: ${missingNames.join(", ")}`,
      });
    }
  }

  // 5. Late test entry — test entered within 1 day of test date
  const recentTests = await db
    .select()
    .from(tests)
    .where(eq(tests.testDate, dateStr));
  for (const test of recentTests) {
    const created = test.createdAt;
    const testDate = new Date(dateStr + "T00:00:00");
    const daysBefore = Math.floor(
      (testDate.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysBefore <= 1) {
      flags.push({
        type: "late_test_entry",
        severity: "alert",
        message: `"${test.title}" was entered only ${daysBefore <= 0 ? "today" : "1 day before"} the test date — possible last-minute entry.`,
      });
    }
  }

  // 6. Brief summaries — notes with too_brief evaluation
  const todayNotes = await db
    .select()
    .from(dailyNotes)
    .where(eq(dailyNotes.date, dateStr));
  const briefNotes = todayNotes.filter(
    (n) => n.summaryEvaluation === "too_brief"
  );
  if (briefNotes.length > 0) {
    flags.push({
      type: "brief_summary",
      severity: "warning",
      message: `${briefNotes.length} note summary${briefNotes.length > 1 ? "ies were" : " was"} flagged as too brief.`,
    });
  }

  // 7. Low checklist completion
  const checklistItems = await db
    .select()
    .from(dailyChecklist)
    .where(eq(dailyChecklist.date, dateStr));
  if (checklistItems.length > 0) {
    const done = checklistItems.filter((c) => c.completed).length;
    const pct = Math.round((done / checklistItems.length) * 100);
    if (pct < 50) {
      flags.push({
        type: "low_completion",
        severity: "alert",
        message: `Only ${pct}% of checklist items completed (${done}/${checklistItems.length}).`,
      });
    }
  }

  return flags;
}

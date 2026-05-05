import { db } from "./db";
import {
  dailyChecklist,
  dailyNotes,
  tests,
  plannerPhotos,
} from "./schema";
import { eq } from "drizzle-orm";
import { isBreakDay } from "./school-days";

export interface AnomalyFlag {
  type:
    | "no_planner_photo"
    | "late_test_entry"
    | "brief_summary"
    | "low_completion";
  severity: "warning" | "alert";
  message: string;
}

/**
 * Detect anomalies for a given date. Returns an array of flags meant to
 * surface things parents would actually want to know — not noisy heuristics.
 */
export async function detectAnomalies(dateStr: string): Promise<AnomalyFlag[]> {
  const flags: AnomalyFlag[] = [];

  // Skip non-school days (weekends + holidays/breaks) entirely
  const date = new Date(dateStr + "T00:00:00");
  const dayIdx = date.getDay();
  if (dayIdx === 0 || dayIdx === 6) return flags;
  if (await isBreakDay(dateStr)) return flags;

  // 1. No planner photo on a school day
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

  // 2. Late test entry — test entered within 1 day of test date
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

  // 3. Brief notes — only fires if the notes feature is active and Jack
  //    submitted summaries the AI flagged as too brief
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

  // 4. Low checklist completion — exclude homework quiz items, since those
  //    have their own deadline (next-day) and would otherwise inflate the
  //    denominator on graded-homework days. Threshold tightened to <40%.
  const checklistItems = await db
    .select()
    .from(dailyChecklist)
    .where(eq(dailyChecklist.date, dateStr));
  const gradedItems = checklistItems.filter((c) => !c.homeworkQuizId);
  if (gradedItems.length > 0) {
    const done = gradedItems.filter((c) => c.completed).length;
    const pct = Math.round((done / gradedItems.length) * 100);
    if (pct < 40) {
      flags.push({
        type: "low_completion",
        severity: "alert",
        message: `Only ${pct}% of checklist items completed (${done}/${gradedItems.length}).`,
      });
    }
  }

  return flags;
}

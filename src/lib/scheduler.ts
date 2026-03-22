import cron from "node-cron";
import { sendDailySummary } from "./email-summary";
import { isSchoolDay } from "./school-days";
import { toISODate } from "./school-days";

let scheduled = false;

/** Track dates we've already sent for (avoids double-sends within a process) */
const sentDates = new Set<string>();

async function trySendForDate(date: string, label: string) {
  if (sentDates.has(date)) {
    console.log(`[Scheduler] ${label}: already sent for ${date}, skipping.`);
    return;
  }

  const schoolDay = await isSchoolDay(date);
  if (!schoolDay) {
    console.log(`[Scheduler] ${label}: ${date} is not a school day — skipping.`);
    return;
  }

  console.log(`[Scheduler] ${label}: sending daily summary for ${date}...`);
  const result = await sendDailySummary(date);

  if (result.success) {
    sentDates.add(date);
    console.log(`[Scheduler] ${label}: sent to ${result.sentTo.join(", ")}`);
  } else {
    console.error(`[Scheduler] ${label}: failed — ${result.error}`);
  }
}

/**
 * Parse the cron hour/minute to check if we're past the scheduled time.
 * Only works for simple "M H * * D" expressions.
 */
function isPastScheduledTime(cronExpr: string, now: Date): boolean {
  const parts = cronExpr.split(" ");
  const minute = parseInt(parts[0]);
  const hour = parseInt(parts[1]);
  if (isNaN(minute) || isNaN(hour)) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const scheduledMinutes = hour * 60 + minute;
  return nowMinutes > scheduledMinutes;
}

/**
 * Start the daily email scheduler.
 * Sends at 6:30 PM PT every weekday (configurable via DAILY_EMAIL_CRON).
 * On startup, catches up if the scheduled time already passed today.
 */
export function startScheduler() {
  if (scheduled) return;
  scheduled = true;

  const tz = process.env.EMAIL_TIMEZONE || "America/Los_Angeles";
  // Default: 6:30 PM PT, Mon-Fri
  const cronExpr = process.env.DAILY_EMAIL_CRON || "30 18 * * 1-5";

  // Schedule the recurring cron
  cron.schedule(cronExpr, () => {
    const today = toISODate(new Date());
    trySendForDate(today, "Cron");
  }, { timezone: tz });

  console.log(`[Scheduler] Daily email scheduled: "${cronExpr}" (${tz})`);

  // Catch-up: if the server started after the scheduled time, send now
  const nowInTz = new Date(
    new Date().toLocaleString("en-US", { timeZone: tz })
  );
  if (isPastScheduledTime(cronExpr, nowInTz)) {
    const today = toISODate(new Date());
    console.log(`[Scheduler] Startup catch-up: past scheduled time, checking ${today}...`);
    trySendForDate(today, "Catch-up").catch((err) =>
      console.error("[Scheduler] Catch-up error:", err)
    );
  }
}

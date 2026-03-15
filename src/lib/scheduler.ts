import cron from "node-cron";
import { sendDailySummary } from "./email-summary";
import { isSchoolDay } from "./school-days";
import { toISODate } from "./school-days";

let scheduled = false;

/**
 * Start the daily email scheduler.
 * Sends at 6:30 PM ET every weekday (configurable via DAILY_EMAIL_TIME env).
 * Skips breaks automatically.
 */
export function startScheduler() {
  if (scheduled) return;
  scheduled = true;

  // Default: 6:30 PM ET = "30 18 * * 1-5" (Mon-Fri)
  // Configurable via DAILY_EMAIL_CRON env var
  const cronExpr = process.env.DAILY_EMAIL_CRON || "30 18 * * 1-5";

  cron.schedule(cronExpr, async () => {
    const today = toISODate(new Date());

    // Skip if it's a break day
    const schoolDay = await isSchoolDay(today);
    if (!schoolDay) {
      console.log(`[Scheduler] ${today} is not a school day — skipping email.`);
      return;
    }

    console.log(`[Scheduler] Sending daily summary for ${today}...`);
    const result = await sendDailySummary(today);

    if (result.success) {
      console.log(
        `[Scheduler] Daily summary sent to: ${result.sentTo.join(", ")}`
      );
    } else {
      console.error(`[Scheduler] Failed to send: ${result.error}`);
    }
  });

  console.log(
    `[Scheduler] Daily email scheduled: ${process.env.DAILY_EMAIL_CRON || "30 18 * * 1-5"}`
  );
}

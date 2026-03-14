import { db } from "./db";
import { schoolCalendar } from "./schema";
import { and, lte, gte } from "drizzle-orm";

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri";

export function getTodayDayOfWeek(): DayOfWeek | null {
  const day = DAY_NAMES[new Date().getDay()];
  if (day === "sun" || day === "sat") return null;
  return day as DayOfWeek;
}

export function getDateDayOfWeek(date: Date): DayOfWeek | null {
  const day = DAY_NAMES[date.getDay()];
  if (day === "sun" || day === "sat") return null;
  return day as DayOfWeek;
}

export function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function parseISODate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Check if a given date falls within a school break.
 */
export async function isBreakDay(dateStr: string): Promise<boolean> {
  const breaks = await db
    .select()
    .from(schoolCalendar)
    .where(and(lte(schoolCalendar.startDate, dateStr), gte(schoolCalendar.endDate, dateStr)));

  return breaks.length > 0;
}

/**
 * Check if a given date is a school day (weekday and not a break).
 */
export async function isSchoolDay(dateStr: string): Promise<boolean> {
  const date = parseISODate(dateStr);
  const dow = getDateDayOfWeek(date);
  if (!dow) return false; // weekend
  return !(await isBreakDay(dateStr));
}

/**
 * Add N school days to a date (skipping weekends and breaks).
 */
export async function addSchoolDays(
  startDate: string,
  days: number
): Promise<string> {
  const date = parseISODate(startDate);
  let remaining = days;

  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const dateStr = toISODate(date);
    if (await isSchoolDay(dateStr)) {
      remaining--;
    }
  }

  return toISODate(date);
}

/**
 * Count school days between two dates (exclusive of both endpoints).
 */
export async function countSchoolDaysBetween(
  startDate: string,
  endDate: string
): Promise<number> {
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  let count = 0;
  const current = new Date(start);

  while (current < end) {
    current.setDate(current.getDate() + 1);
    if (current >= end) break;
    const dateStr = toISODate(current);
    if (await isSchoolDay(dateStr)) {
      count++;
    }
  }

  return count;
}

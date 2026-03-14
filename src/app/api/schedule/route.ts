import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduleSlots, subjects } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { toISODate, getDateDayOfWeek } from "@/lib/school-days";
import type { DayOfWeek } from "@/lib/school-days";

// GET /api/schedule?date=2026-03-14
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateStr =
    req.nextUrl.searchParams.get("date") || toISODate(new Date());

  const date = new Date(dateStr + "T12:00:00");
  const dow = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
    date.getDay()
  ] as DayOfWeek;

  if (dow === ("sun" as DayOfWeek) || dow === ("sat" as DayOfWeek)) {
    return NextResponse.json({ slots: [] });
  }

  const slots = await db
    .select({
      subjectName: subjects.name,
      subjectColor: subjects.color,
      startTime: scheduleSlots.startTime,
      endTime: scheduleSlots.endTime,
    })
    .from(scheduleSlots)
    .innerJoin(subjects, eq(scheduleSlots.subjectId, subjects.id))
    .where(eq(scheduleSlots.dayOfWeek, dow))
    .orderBy(scheduleSlots.startTime);

  return NextResponse.json({ slots });
}

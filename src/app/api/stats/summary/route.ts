import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  dailyChecklist,
  dailyNotes,
  subjects,
  schoolCalendar,
} from "@/lib/schema";
import { eq, and, desc, lte, gte, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { toISODate, isSchoolDay } from "@/lib/school-days";

// GET /api/stats/summary — streak, recent notes quality
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Calculate streak: consecutive school days with >=90% checklist completion
  let streak = 0;
  const today = new Date();
  const current = new Date(today);

  for (let i = 0; i < 365; i++) {
    current.setDate(current.getDate() - (i === 0 ? 0 : 1));
    const dateStr = toISODate(current);

    const schoolDay = await isSchoolDay(dateStr);
    if (!schoolDay) continue; // skip weekends/breaks without breaking streak

    const items = await db
      .select()
      .from(dailyChecklist)
      .where(eq(dailyChecklist.date, dateStr));

    if (items.length === 0) break; // no data = streak broken

    const done = items.filter((c) => c.completed).length;
    const pct = done / items.length;
    if (pct >= 0.9) {
      streak++;
    } else {
      break;
    }
  }

  // Recent notes (last 30 days)
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = toISODate(thirtyDaysAgo);

  const recentNotes = await db
    .select({
      id: dailyNotes.id,
      date: dailyNotes.date,
      subjectName: subjects.name,
      summaryEvaluation: dailyNotes.summaryEvaluation,
      quizScore: dailyNotes.quizScore,
    })
    .from(dailyNotes)
    .innerJoin(subjects, eq(dailyNotes.subjectId, subjects.id))
    .where(gte(dailyNotes.date, thirtyDaysAgoStr))
    .orderBy(desc(dailyNotes.date));

  return NextResponse.json({ streak, recentNotes });
}

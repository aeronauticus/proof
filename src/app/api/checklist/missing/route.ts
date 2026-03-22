import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailyChecklist } from "@/lib/schema";
import { eq, and, lt, isNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { toISODate } from "@/lib/school-days";

/**
 * GET /api/checklist/missing
 *
 * Returns all incomplete, non-waived checklist items from previous days.
 * These are items Jack hasn't submitted yet — they roll forward until
 * completed or waived by a parent.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = toISODate(new Date());

  const items = await db
    .select()
    .from(dailyChecklist)
    .where(
      and(
        lt(dailyChecklist.date, today),
        eq(dailyChecklist.completed, false),
        isNull(dailyChecklist.waivedBy)
      )
    )
    .orderBy(dailyChecklist.date, dailyChecklist.orderIndex);

  return NextResponse.json({ items });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailyChecklist } from "@/lib/schema";
import { eq, and, lt, isNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";

/**
 * GET /api/checklist/missing?date=YYYY-MM-DD
 *
 * Returns all incomplete, non-waived checklist items from before the given date.
 * The date param should be the client's local "today" to avoid UTC/local mismatch
 * (e.g. Railway server in UTC vs user in PT).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = req.nextUrl.searchParams.get("date");
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return NextResponse.json({ error: "date query param required (YYYY-MM-DD)" }, { status: 400 });
  }

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

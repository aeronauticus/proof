import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { plannerPhotos } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { toISODate } from "@/lib/school-days";

/**
 * POST /api/planner/manual — create a planner record without a photo.
 * Used when Jack types assignments manually instead of uploading a photo.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { date } = await req.json();
  const dateStr = date || toISODate(new Date());

  // Check if planner already exists for this date
  const existing = await db
    .select()
    .from(plannerPhotos)
    .where(eq(plannerPhotos.date, dateStr))
    .then((rows) => rows[0]);

  if (existing) {
    return NextResponse.json({ ok: true, plannerPhoto: existing });
  }

  const [created] = await db
    .insert(plannerPhotos)
    .values({ date: dateStr, photoPath: null })
    .returning();

  await logAction(session.userId, "manual_entry", "planner_photo", created.id, null, {
    date: dateStr,
  });

  return NextResponse.json({ ok: true, plannerPhoto: created }, { status: 201 });
}

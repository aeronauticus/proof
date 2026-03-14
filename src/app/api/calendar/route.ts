import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { schoolCalendar } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession, requireParent } from "@/lib/auth";

// GET /api/calendar — list all breaks
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const breaks = await db
    .select()
    .from(schoolCalendar)
    .orderBy(schoolCalendar.startDate);

  return NextResponse.json({ breaks });
}

// POST /api/calendar — add break (parent only)
export async function POST(req: NextRequest) {
  const session = await getSession();
  try {
    requireParent(session);
  } catch {
    return NextResponse.json({ error: "Parent only" }, { status: 403 });
  }

  const { name, startDate, endDate, type } = await req.json();

  if (!name || !startDate || !endDate || !type) {
    return NextResponse.json(
      { error: "name, startDate, endDate, type required" },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(schoolCalendar)
    .values({ name, startDate, endDate, type })
    .returning();

  return NextResponse.json({ break: created }, { status: 201 });
}

// DELETE /api/calendar — remove break (parent only)
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  try {
    requireParent(session);
  } catch {
    return NextResponse.json({ error: "Parent only" }, { status: 403 });
  }

  const { id } = await req.json();
  await db.delete(schoolCalendar).where(eq(schoolCalendar.id, id));

  return NextResponse.json({ ok: true });
}

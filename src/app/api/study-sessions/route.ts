import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { studySessions, studyPlans } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

// GET /api/study-sessions?testId=1
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const testId = req.nextUrl.searchParams.get("testId");
  if (!testId) {
    return NextResponse.json({ error: "testId required" }, { status: 400 });
  }

  // Find the plan for this test
  const plan = await db
    .select()
    .from(studyPlans)
    .where(eq(studyPlans.testId, parseInt(testId)))
    .then((rows) => rows[0]);

  if (!plan) {
    return NextResponse.json({ sessions: [] });
  }

  const sessions = await db
    .select()
    .from(studySessions)
    .where(eq(studySessions.planId, plan.id))
    .orderBy(studySessions.sessionDate, studySessions.sessionOrder);

  return NextResponse.json({ sessions });
}

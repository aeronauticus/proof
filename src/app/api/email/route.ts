import { NextRequest, NextResponse } from "next/server";
import { getSession, requireParent } from "@/lib/auth";
import { sendDailySummary } from "@/lib/email-summary";
import { toISODate } from "@/lib/school-days";

// POST /api/email — manually trigger daily summary (parent only)
export async function POST(req: NextRequest) {
  const session = await getSession();
  try {
    requireParent(session);
  } catch {
    return NextResponse.json({ error: "Parent only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const date = body.date || toISODate(new Date());

  const result = await sendDailySummary(date);

  if (result.success) {
    return NextResponse.json({
      message: `Summary sent to ${result.sentTo.join(", ")}`,
      sentTo: result.sentTo,
    });
  } else {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
}

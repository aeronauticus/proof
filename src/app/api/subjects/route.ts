import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subjects } from "@/lib/schema";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allSubjects = await db.select().from(subjects);
  return NextResponse.json({ subjects: allSubjects });
}

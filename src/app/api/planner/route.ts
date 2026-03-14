import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { plannerPhotos } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { toISODate } from "@/lib/school-days";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

// POST /api/planner — upload planner photo
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("photo") as File | null;
  const date = (formData.get("date") as string) || toISODate(new Date());

  if (!file) {
    return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  }

  // Check if photo already exists for this date
  const existing = await db
    .select()
    .from(plannerPhotos)
    .where(eq(plannerPhotos.date, date))
    .then((rows) => rows[0]);

  if (existing) {
    return NextResponse.json(
      { error: "Planner photo already uploaded for this date" },
      { status: 400 }
    );
  }

  // Save file
  const ext = file.name.split(".").pop() || "jpg";
  const filename = `${date}-${randomUUID()}.${ext}`;
  const uploadDir = join(process.cwd(), "public", "uploads", "planner");
  await mkdir(uploadDir, { recursive: true });
  const filepath = join(uploadDir, filename);

  const bytes = await file.arrayBuffer();
  await writeFile(filepath, Buffer.from(bytes));

  const photoPath = `/uploads/planner/${filename}`;

  const [created] = await db
    .insert(plannerPhotos)
    .values({ date, photoPath })
    .returning();

  await logAction(session.userId, "upload", "planner_photo", created.id, null, {
    date,
    photoPath,
  });

  return NextResponse.json({ plannerPhoto: created }, { status: 201 });
}

// GET /api/planner?date=2026-03-14
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date =
    req.nextUrl.searchParams.get("date") || toISODate(new Date());

  const photo = await db
    .select()
    .from(plannerPhotos)
    .where(eq(plannerPhotos.date, date))
    .then((rows) => rows[0] || null);

  return NextResponse.json({ plannerPhoto: photo });
}

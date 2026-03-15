import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tests, studyMaterials, studyGuides, studyPlans, studySessions } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { uploadDir, uploadUrl } from "@/lib/uploads";
import {
  extractMaterialContent,
  generateStudyGuide,
  enhanceSessionDescriptions,
} from "@/lib/ai/material-analyzer";

type Params = { params: Promise<{ id: string }> };

async function getTestById(testId: number) {
  return db
    .select()
    .from(tests)
    .where(eq(tests.id, testId))
    .then((rows) => rows[0] || null);
}

async function getMaterials(testId: number) {
  return db
    .select()
    .from(studyMaterials)
    .where(eq(studyMaterials.testId, testId))
    .orderBy(studyMaterials.uploadedAt);
}

async function getGuide(testId: number) {
  return db
    .select()
    .from(studyGuides)
    .where(eq(studyGuides.testId, testId))
    .then((rows) => rows[0] || null);
}

async function regenerateGuide(
  testId: number,
  subjectName: string,
  testTopics: string | null,
  testTitle: string
) {
  const materials = await getMaterials(testId);
  const extractedContents = materials
    .map((m) => m.extractedContent)
    .filter((ec): ec is NonNullable<typeof ec> => ec !== null);

  if (extractedContents.length === 0) {
    // No materials left — delete guide
    await db.delete(studyGuides).where(eq(studyGuides.testId, testId));
    return null;
  }

  // Generate study guide from all extracted content
  const { content, practiceQuiz } = await generateStudyGuide(
    extractedContents,
    subjectName,
    testTopics,
    testTitle
  );

  // Upsert study guide
  const existing = await getGuide(testId);
  if (existing) {
    await db
      .update(studyGuides)
      .set({
        content,
        practiceQuiz,
        materialCount: materials.length,
        generatedAt: new Date(),
        // Preserve quiz attempts
      })
      .where(eq(studyGuides.id, existing.id));
  } else {
    await db.insert(studyGuides).values({
      testId,
      content,
      practiceQuiz,
      materialCount: materials.length,
    });
  }

  // Enhance study session descriptions
  const plan = await db
    .select()
    .from(studyPlans)
    .where(eq(studyPlans.testId, testId))
    .then((rows) => rows[0] || null);

  if (plan) {
    const sessions = await db
      .select({
        id: studySessions.id,
        technique: studySessions.technique,
        description: studySessions.description,
      })
      .from(studySessions)
      .where(eq(studySessions.planId, plan.id));

    const enhanced = enhanceSessionDescriptions(content, sessions);
    for (const s of enhanced) {
      await db
        .update(studySessions)
        .set({ description: s.description })
        .where(eq(studySessions.id, s.id));
    }
  }

  return await getGuide(testId);
}

// GET /api/tests/[id]/materials — fetch materials + study guide
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const testId = parseInt(id);

  const [materials, guide] = await Promise.all([
    getMaterials(testId),
    getGuide(testId),
  ]);

  return NextResponse.json({ materials, studyGuide: guide });
}

// POST /api/tests/[id]/materials — upload material photos
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const testId = parseInt(id);

  const test = await getTestById(testId);
  if (!test) {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }

  if (test.status !== "upcoming") {
    return NextResponse.json(
      { error: "Can only add study materials for upcoming tests" },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const photoFiles = formData.getAll("photos") as File[];
  const single = formData.get("photo") as File | null;
  const files = photoFiles.length > 0 ? photoFiles : single ? [single] : [];

  if (files.length === 0) {
    return NextResponse.json({ error: "No photos provided" }, { status: 400 });
  }

  // Get subject name for AI context
  const { subjects } = await import("@/lib/schema");
  const subject = await db
    .select()
    .from(subjects)
    .where(eq(subjects.id, test.subjectId))
    .then((rows) => rows[0]);
  const subjectName = subject?.name || "Unknown";

  // Save and process each photo
  const dir = uploadDir("study-materials");
  await mkdir(dir, { recursive: true });

  const newMaterials = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `material-${testId}-${randomUUID()}.${ext}`;
    const filepath = join(dir, filename);
    const bytes = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));

    const photoPath = uploadUrl("study-materials", filename);

    // Extract content from this photo using AI
    let extractedContent = null;
    try {
      extractedContent = await extractMaterialContent(
        photoPath,
        subjectName,
        test.topics
      );
    } catch (err) {
      console.error("Material extraction failed:", err);
    }

    const [inserted] = await db
      .insert(studyMaterials)
      .values({
        testId,
        photoPath,
        extractedContent,
      })
      .returning();

    newMaterials.push(inserted);

    await logAction(session.userId, "upload", "study_material", inserted.id, null, {
      testId,
      photoPath,
      sourceType: extractedContent?.sourceType,
    });
  }

  // Regenerate study guide from ALL materials
  let guide = null;
  try {
    guide = await regenerateGuide(testId, subjectName, test.topics, test.title);
  } catch (err) {
    console.error("Study guide generation failed:", err);
  }

  return NextResponse.json({
    ok: true,
    materials: newMaterials,
    studyGuide: guide,
  });
}

// DELETE /api/tests/[id]/materials — remove a material
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const testId = parseInt(id);

  const body = await req.json();
  const materialId = body.materialId;

  if (!materialId) {
    return NextResponse.json({ error: "materialId required" }, { status: 400 });
  }

  // Verify material belongs to this test
  const material = await db
    .select()
    .from(studyMaterials)
    .where(eq(studyMaterials.id, materialId))
    .then((rows) => rows[0]);

  if (!material || material.testId !== testId) {
    return NextResponse.json({ error: "Material not found" }, { status: 404 });
  }

  await db.delete(studyMaterials).where(eq(studyMaterials.id, materialId));

  await logAction(session.userId, "delete", "study_material", materialId, null, {
    testId,
  });

  // Get subject for regeneration
  const test = await getTestById(testId);
  if (!test) {
    return NextResponse.json({ ok: true, studyGuide: null });
  }

  const { subjects } = await import("@/lib/schema");
  const subject = await db
    .select()
    .from(subjects)
    .where(eq(subjects.id, test.subjectId))
    .then((rows) => rows[0]);

  let guide = null;
  try {
    guide = await regenerateGuide(
      testId,
      subject?.name || "Unknown",
      test.topics,
      test.title
    );
  } catch (err) {
    console.error("Study guide regeneration failed:", err);
  }

  return NextResponse.json({ ok: true, studyGuide: guide });
}

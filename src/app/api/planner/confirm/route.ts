import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assignments, tests, subjects } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { toISODate } from "@/lib/school-days";
import { generateStudyPlan } from "@/lib/study-plan-generator";

interface ConfirmAssignment {
  subject: string;
  title: string;
  dueDate: string;
}

interface ConfirmTest {
  subject: string;
  type: "test" | "quiz";
  title: string;
  testDate: string;
  topics: string | null;
}

/**
 * POST /api/planner/confirm — save AI-extracted planner items
 * Jack reviews the extracted items and confirms which ones to save.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const confirmedAssignments: ConfirmAssignment[] = body.assignments || [];
  const confirmedTests: ConfirmTest[] = body.tests || [];

  // Lookup all subjects to map names → IDs
  const allSubjects = await db.select().from(subjects);
  const subjectByName = new Map(allSubjects.map((s) => [s.name.toLowerCase(), s]));

  function findSubjectId(name: string): number | null {
    const lower = name.toLowerCase();
    const exact = subjectByName.get(lower);
    if (exact) return exact.id;
    // Fuzzy match
    for (const [key, val] of subjectByName) {
      if (key.includes(lower) || lower.includes(key)) return val.id;
    }
    return null;
  }

  const today = toISODate(new Date());
  const createdAssignments = [];
  const createdTests = [];

  // Create assignments
  for (const a of confirmedAssignments) {
    const subjectId = findSubjectId(a.subject);
    if (!subjectId) continue; // skip unmatched subjects

    const [created] = await db
      .insert(assignments)
      .values({
        subjectId,
        title: a.title,
        assignedDate: today,
        dueDate: a.dueDate,
      })
      .returning();

    await logAction(session.userId, "create", "assignment", created.id, null, {
      subjectId,
      title: a.title,
      dueDate: a.dueDate,
      source: "planner_ai",
    });

    createdAssignments.push(created);
  }

  // Create tests and generate study plans
  for (const t of confirmedTests) {
    const subjectId = findSubjectId(t.subject);
    if (!subjectId) continue;

    const [created] = await db
      .insert(tests)
      .values({
        subjectId,
        type: t.type,
        title: t.title,
        topics: t.topics,
        testDate: t.testDate,
      })
      .returning();

    await logAction(session.userId, "create", "test", created.id, null, {
      subjectId,
      type: t.type,
      title: t.title,
      testDate: t.testDate,
      source: "planner_ai",
    });

    // Generate study plan
    const subject = allSubjects.find((s) => s.id === subjectId);
    await generateStudyPlan(
      created.id,
      t.testDate,
      t.title,
      t.topics,
      subject?.name || ""
    );

    createdTests.push(created);
  }

  return NextResponse.json({
    ok: true,
    assignmentsCreated: createdAssignments.length,
    testsCreated: createdTests.length,
  });
}

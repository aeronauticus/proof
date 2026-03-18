import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subjects } from "@/lib/schema";
import { getSession } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { toISODate } from "@/lib/school-days";

const anthropic = new Anthropic();

// POST /api/planner/parse-manual — parse manually typed planner text into assignments/tests
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text } = await req.json();
  if (!text?.trim()) {
    return NextResponse.json({ error: "Text required" }, { status: 400 });
  }

  const allSubjects = await db.select().from(subjects);
  const subjectNames = allSubjects.map((s) => s.name);
  const todayDate = toISODate(new Date());

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `You are parsing a 6th grader's handwritten planner items that they typed in. Today's date is ${todayDate}.

The student's subjects are: ${subjectNames.join(", ")}

Here is what the student typed:
${text}

Extract assignments and tests/quizzes. For each item:
- Match the subject to the closest match from the list above
- Convert relative dates ("Wednesday", "Friday", "tomorrow") to YYYY-MM-DD based on today being ${todayDate}
- If no date is given, assume it's due tomorrow

Respond in this exact JSON format and nothing else:
{
  "assignments": [
    {"subject": "<exact subject name from list>", "title": "<description>", "dueDate": "<YYYY-MM-DD>"}
  ],
  "tests": [
    {"subject": "<exact subject name from list>", "type": "test" or "quiz", "title": "<description>", "testDate": "<YYYY-MM-DD>", "topics": null}
  ]
}`,
      },
    ],
  });

  const responseText =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return NextResponse.json({
        assignments: parsed.assignments || [],
        tests: parsed.tests || [],
      });
    }
  } catch {
    // Fall through
  }

  return NextResponse.json({ assignments: [], tests: [] });
}

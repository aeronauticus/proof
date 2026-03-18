import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { join } from "path";
import { UPLOAD_BASE } from "@/lib/uploads";

const anthropic = new Anthropic();

export interface PlannerAssignment {
  subject: string;
  title: string;
  dueDate: string; // ISO date
}

export interface PlannerTest {
  subject: string;
  type: "test" | "quiz";
  title: string;
  testDate: string; // ISO date
  topics: string | null;
}

export interface PlannerExtraction {
  assignments: PlannerAssignment[];
  tests: PlannerTest[];
  rawNotes: string; // what the AI read from the planner
}

/**
 * Use Claude Vision to read a student's planner photo and extract
 * assignments (with due dates) and upcoming tests/quizzes.
 */
export async function readPlannerPhoto(
  photoPath: string,
  todayDate: string,
  subjectNames: string[]
): Promise<PlannerExtraction> {
  const relativePath = photoPath.replace(/^\/uploads\//, "");
  const fullPath = join(UPLOAD_BASE, relativePath);
  const imageBuffer = await readFile(fullPath);
  const base64 = imageBuffer.toString("base64");

  const ext = photoPath.split(".").pop()?.toLowerCase();
  const mediaType =
    ext === "png"
      ? "image/png"
      : ext === "gif"
        ? "image/gif"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";

  const subjectList = subjectNames.join(", ");

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: "text",
            text: `You are reading a 6th grader's physical planner page. Today's date is ${todayDate}.

The student's subjects are: ${subjectList}

Please extract ALL assignments and upcoming tests/quizzes written in this planner. For each item, determine:
- Which subject it belongs to (must be one of the subjects listed above — use your best judgment to match, e.g. "Hist" = "History", "Lat" = "Latin", "Comp" = "Comp/Lit", "Gram" = "Grammar", etc.)
- The title/description of the work
- The due date (convert any relative dates like "Friday" or "tomorrow" to ISO format YYYY-MM-DD based on today being ${todayDate})

Also look for any tests or quizzes written in the planner. These are different from regular homework — they're usually marked with "TEST", "Quiz", or a test date.

IMPORTANT:
- Only extract items that are clearly written in the planner. Do not make up items.
- If you can't read something clearly, skip it rather than guessing.
- If a due date isn't specified, assume it's due tomorrow (the next school day).
- Match subjects as closely as possible to the list provided.

Respond in this exact JSON format and nothing else:
{
  "assignments": [
    {"subject": "<exact subject name from list>", "title": "<assignment description>", "dueDate": "<YYYY-MM-DD>"}
  ],
  "tests": [
    {"subject": "<exact subject name from list>", "type": "test" or "quiz", "title": "<test/quiz description>", "testDate": "<YYYY-MM-DD>", "topics": "<topics if mentioned, or null>"}
  ],
  "rawNotes": "<brief plain-text transcription of what you can read in the planner>"
}`,
          },
        ],
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        assignments: parsed.assignments || [],
        tests: parsed.tests || [],
        rawNotes: parsed.rawNotes || "",
      };
    }
  } catch {
    // Fall through
  }

  return {
    assignments: [],
    tests: [],
    rawNotes: "Could not read the planner photo. Please try a clearer photo.",
  };
}

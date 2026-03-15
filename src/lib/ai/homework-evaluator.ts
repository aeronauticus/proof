import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { join } from "path";
import { UPLOAD_BASE } from "@/lib/uploads";

const anthropic = new Anthropic();

export interface HomeworkEvaluation {
  looksLikeHomework: boolean;
  appearsComplete: boolean;
  missingAnswers: boolean;
  estimatedCompletionPct: number; // 0-100
  feedback: string; // brief description for Jack
  parentNote: string; // note for parent email/review
}

/**
 * Evaluate homework photos using Claude Vision.
 * Checks:
 * 1. Does this actually look like homework?
 * 2. Are all questions/items answered?
 * 3. Are there blank spots or missing answers?
 */
export async function evaluateHomeworkPhotos(
  photoPaths: string[]
): Promise<HomeworkEvaluation> {
  if (photoPaths.length === 0) {
    return {
      looksLikeHomework: false,
      appearsComplete: false,
      missingAnswers: true,
      estimatedCompletionPct: 0,
      feedback: "No photos uploaded.",
      parentNote: "No homework photos were submitted.",
    };
  }

  // Load all images
  const imageContents: Anthropic.ImageBlockParam[] = [];
  for (const photoPath of photoPaths) {
    // photoPath is like "/uploads/checklist/filename.jpg"
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

    imageContents.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: base64,
      },
    });
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: [
          ...imageContents,
          {
            type: "text",
            text: `You are reviewing photos of a 6th grader's homework. Look at all ${photoPaths.length} photo(s) and evaluate:

1. Does this actually look like completed homework (handwritten answers on a worksheet, notebook, or assignment)?
2. Are there any blank/unanswered questions, empty lines, or sections that were skipped?
3. What percentage of the visible work appears to be completed?

Be strict but fair. Look carefully for:
- Blank numbered questions
- Empty lines where answers should be
- Sections marked but not filled in
- "I don't know" or minimal-effort answers

Respond in this exact JSON format and nothing else:
{
  "looksLikeHomework": <true if this appears to be homework/schoolwork, false if it looks like something else>,
  "appearsComplete": <true if all visible questions/items appear answered, false if anything looks skipped>,
  "missingAnswers": <true if there are clearly blank or skipped questions, false otherwise>,
  "estimatedCompletionPct": <0-100, your best estimate of what % of the work is done>,
  "feedback": "<1-2 sentences for the student — if incomplete, tell them what looks missing. Be specific like 'Questions 5 and 8 appear blank.' If complete, say 'Looks good!'",
  "parentNote": "<1-2 sentences for the parent — objective summary of what you see. Note any concerns.>"
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
      return JSON.parse(jsonMatch[0]) as HomeworkEvaluation;
    }
  } catch {
    // Fall through
  }

  return {
    looksLikeHomework: true,
    appearsComplete: true,
    missingAnswers: false,
    estimatedCompletionPct: 100,
    feedback: "Could not analyze photos. Please have a parent verify.",
    parentNote: "AI could not analyze the homework photos — manual review needed.",
  };
}

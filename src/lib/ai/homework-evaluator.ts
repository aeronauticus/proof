import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { join } from "path";
import { UPLOAD_BASE } from "@/lib/uploads";

const anthropic = new Anthropic();

export interface HomeworkEvaluation {
  looksLikeHomework: boolean;
  appearsComplete: boolean;
  missingAnswers: boolean;
  underElaborated: boolean; // true if answers are short/surface-level when prose was expected
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
      underElaborated: false,
      estimatedCompletionPct: 0,
      feedback: "No photos uploaded.",
      parentNote: "No homework photos were submitted.",
    };
  }

  // Load all images
  const imageContents: Anthropic.ImageBlockParam[] = [];
  for (const photoPath of photoPaths) {
    // photoPath is like "/uploads/checklist/filename.jpg"
    const relativePath = photoPath.replace(/^\/(api\/)?uploads\//, "");
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
    model: "claude-opus-4-7",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: [
          ...imageContents,
          {
            type: "text",
            text: `You are reviewing photos of a 6th grader's homework. Look at all ${photoPaths.length} photo(s) and evaluate carefully. Jack tends to write short, surface-level answers — your job is to catch that and push him to elaborate.

Evaluate:

1. Does this actually look like completed homework (handwritten answers on a worksheet, notebook, or assignment)?
2. Are there any blank/unanswered questions, empty lines, or sections that were skipped?
3. For any question that asks for written explanation, analysis, opinion, or "why/how" — are Jack's answers thorough? Look for:
   - One-word or one-line answers where multiple sentences were clearly expected
   - Surface-level summaries that don't explain reasoning
   - Skipping the "why" or "because" part
   - Generic restatements of the question
   - Answers under-elaborated relative to the space provided
   For simple fill-in-the-blank, math problems, or vocabulary, do NOT flag — short answers are correct there. Only flag under-elaboration when the question genuinely calls for explanation.
4. What percentage of the visible work appears to be completed (not counting under-elaboration — that's separate)?

Also look carefully for:
- Blank numbered questions
- Empty lines where answers should be
- Sections marked but not filled in
- "I don't know" or obvious minimal-effort answers

Respond in this exact JSON format and nothing else:
{
  "looksLikeHomework": <true if this appears to be homework/schoolwork>,
  "appearsComplete": <true if all visible questions appear answered, false if anything looks skipped>,
  "missingAnswers": <true if there are clearly blank or skipped questions>,
  "underElaborated": <true if any prose/explanation questions got short or surface-level answers when a thorough response was expected, false otherwise>,
  "estimatedCompletionPct": <0-100, your best estimate of what % of the work is done>,
  "feedback": "<1-2 sentences for Jack. If under-elaborated, be specific about which questions need more detail and what's missing (e.g., 'Question 3 only has one sentence — add reasoning for why your answer is correct.'). If blanks, point them out. If genuinely complete and thorough, say 'Looks good!'>",
  "parentNote": "<1-2 sentences for the parent — objective summary including any under-elaboration concerns>"
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
    underElaborated: false,
    estimatedCompletionPct: 100,
    feedback: "Could not analyze photos. Please have a parent verify.",
    parentNote: "AI could not analyze the homework photos — manual review needed.",
  };
}

import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { join } from "path";
import { UPLOAD_BASE } from "@/lib/uploads";

const anthropic = new Anthropic();

interface ScoreResult {
  scoreRaw: number | null;
  scoreTotal: number | null;
  letterGrade: string | null;
  confidence: number;
  notes: string;
}

/**
 * Use Claude Vision to read the score from a graded test/quiz photo.
 */
export async function readScoreFromPhoto(
  photoPath: string
): Promise<ScoreResult> {
  const relativePath = photoPath.replace(/^\/(api\/)?uploads\//, "");
  const fullPath = join(UPLOAD_BASE, relativePath);
  const imageBuffer = await readFile(fullPath);
  const base64 = imageBuffer.toString("base64");

  // Determine media type from extension
  const ext = photoPath.split(".").pop()?.toLowerCase();
  const mediaType =
    ext === "png"
      ? "image/png"
      : ext === "gif"
        ? "image/gif"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
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
            text: `Look at this graded test or quiz paper. Extract the following information:

1. The raw score (points earned) — a number
2. The total possible points — a number
3. The letter grade (if visible) — like A, B+, C-, etc.

Respond in this exact JSON format and nothing else:
{
  "scoreRaw": <number or null if not visible>,
  "scoreTotal": <number or null if not visible>,
  "letterGrade": "<letter grade or null if not visible>",
  "confidence": <0.0 to 1.0 how confident you are in the reading>,
  "notes": "<brief description of what you see, any issues reading the score>"
}`,
          },
        ],
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ScoreResult;
    }
  } catch {
    // Fall through to default
  }

  return {
    scoreRaw: null,
    scoreTotal: null,
    letterGrade: null,
    confidence: 0,
    notes: "Could not read score from photo. Manual entry needed.",
  };
}

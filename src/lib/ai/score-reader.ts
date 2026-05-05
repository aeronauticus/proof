import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { join } from "path";
import { UPLOAD_BASE } from "@/lib/uploads";

const anthropic = new Anthropic();

export interface ScoreResult {
  scoreRaw: number | null;
  scoreTotal: number | null;
  letterGrade: string | null;
  confidence: number;
  notes: string;
}

function getMediaType(photoPath: string): "image/png" | "image/gif" | "image/webp" | "image/jpeg" {
  const ext = photoPath.split(".").pop()?.toLowerCase();
  return ext === "png"
    ? "image/png"
    : ext === "gif"
      ? "image/gif"
      : ext === "webp"
        ? "image/webp"
        : "image/jpeg";
}

async function loadImageBlock(photoPath: string): Promise<Anthropic.ImageBlockParam> {
  const relativePath = photoPath.replace(/^\/(api\/)?uploads\//, "");
  const fullPath = join(UPLOAD_BASE, relativePath);
  const imageBuffer = await readFile(fullPath);
  const base64 = imageBuffer.toString("base64");
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: getMediaType(photoPath),
      data: base64,
    },
  };
}

/**
 * Use Claude Vision to read the score from one or more graded test/quiz photos.
 * For multi-page tests (like math), it examines all pages to find the total score.
 */
export async function readScoreFromPhotos(
  photoPaths: string[]
): Promise<ScoreResult> {
  const imageBlocks: Anthropic.ContentBlockParam[] = [];

  for (const p of photoPaths) {
    imageBlocks.push(await loadImageBlock(p));
  }

  const photoCountNote = photoPaths.length > 1
    ? `You are looking at ${photoPaths.length} pages of the same graded test/quiz. Examine ALL pages. The total score may be on any page, or you may need to add up individual problem scores across pages.`
    : "Look at this graded test or quiz paper.";

  imageBlocks.push({
    type: "text",
    text: `${photoCountNote} Extract the following information:

1. The raw score (points earned) — a number. If only individual problem scores are visible across multiple pages, add them up.
2. The total possible points — a number. If only individual problem totals are visible, add them up.
3. The letter grade (if visible) — like A, B+, C-, etc.

Respond in this exact JSON format and nothing else:
{
  "scoreRaw": <number or null if not visible>,
  "scoreTotal": <number or null if not visible>,
  "letterGrade": "<letter grade or null if not visible>",
  "confidence": <0.0 to 1.0 how confident you are in the reading>,
  "notes": "<brief description of what you see, any issues reading the score>"
}`,
  });

  const response = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: imageBlocks,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
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

/** Backwards-compatible single-photo wrapper */
export async function readScoreFromPhoto(
  photoPath: string
): Promise<ScoreResult> {
  return readScoreFromPhotos([photoPath]);
}

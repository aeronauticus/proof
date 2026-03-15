import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { join } from "path";
import { UPLOAD_BASE } from "@/lib/uploads";

const anthropic = new Anthropic();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExtractedContent {
  rawText: string;
  highlightedText: string[];
  handwrittenNotes: string[];
  sourceType: "textbook" | "handout" | "notes" | "study_guide" | "other";
}

export interface StudyGuideContent {
  keyConcepts: Array<{ concept: string; explanation: string }>;
  vocabulary: Array<{ term: string; definition: string }>;
  importantFacts: string[];
  highlightedPriorities: string[];
  summary: string;
}

export interface PracticeQuizQuestion {
  question: string;
  choices?: string[];
  expectedAnswer: string;
  difficulty: "easy" | "medium" | "hard";
  sourceHint: string;
}

export interface PastPerformance {
  /** Past graded tests/quizzes in this subject with scores */
  pastTests: Array<{
    title: string;
    type: string;
    scoreRaw: number | null;
    scoreTotal: number | null;
    letterGrade: string | null;
    topics: string | null;
  }>;
  /** Wrong answers from past practice quizzes in this subject */
  wrongAnswers: Array<{
    testTitle: string;
    question: string;
    studentAnswer: string;
    expectedAnswer: string;
    feedback: string;
  }>;
  /** Wrong answers from daily notes quizzes in this subject */
  dailyNotesWrong: Array<{
    date: string;
    question: string;
    studentAnswer: string;
    feedback: string;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toImageBlock(base64: string, photoPath: string): Anthropic.ImageBlockParam {
  const ext = photoPath.split(".").pop()?.toLowerCase();
  const mediaType =
    ext === "png"
      ? "image/png"
      : ext === "gif"
        ? "image/gif"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";

  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data: base64 },
  };
}

async function loadImage(photoPath: string): Promise<{ base64: string; photoPath: string }> {
  const relativePath = photoPath.replace(/^\/uploads\//, "");
  const fullPath = join(UPLOAD_BASE, relativePath);
  const imageBuffer = await readFile(fullPath);
  return { base64: imageBuffer.toString("base64"), photoPath };
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as T;
  } catch { /* fall through */ }
  // Try matching a JSON array
  try {
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) return JSON.parse(arrMatch[0]) as T;
  } catch { /* fall through */ }
  return fallback;
}

// ── Function 1: Extract content from a single material photo ──────────────────

export async function extractMaterialContent(
  photoPath: string,
  subjectName: string,
  testTopics: string | null
): Promise<ExtractedContent> {
  const { base64 } = await loadImage(photoPath);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          toImageBlock(base64, photoPath),
          {
            type: "text",
            text: `You are helping a 6th grader study for a ${subjectName} test${testTopics ? ` on ${testTopics}` : ""}. This is a photo of study material (textbook page, handout, class notes, or study guide).

Please analyze this image carefully:

1. **OCR**: Read ALL text visible in the image. Include headings, body text, captions, labels.
2. **Highlighted text**: Identify any text that is highlighted, underlined, circled, starred, or otherwise marked as important. These are the student's priority items.
3. **Handwritten notes**: Identify any handwritten annotations, margin notes, or additions the student made.
4. **Source type**: What type of material is this?

Respond in this exact JSON format and nothing else:
{
  "rawText": "<full text content from the image, preserving structure with newlines>",
  "highlightedText": ["<highlighted/underlined/circled text 1>", "<text 2>", ...],
  "handwrittenNotes": ["<handwritten note 1>", "<note 2>", ...],
  "sourceType": "textbook" or "handout" or "notes" or "study_guide" or "other"
}`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  return parseJson<ExtractedContent>(text, {
    rawText: "Could not read this material. Try a clearer photo.",
    highlightedText: [],
    handwrittenNotes: [],
    sourceType: "other",
  });
}

// ── Helper: Condense a batch of materials into a summary ──────────────────────

/** Rough character count ≈ tokens * 4. Keep final prompt under ~150k chars
 *  to stay well within context limits with room for the system prompt. */
const MAX_DIRECT_CHARS = 80_000;

async function condenseBatch(
  batch: ExtractedContent[],
  batchIndex: number,
  subjectName: string,
  testTopics: string | null
): Promise<string> {
  const batchText = batch
    .map((ec, i) => {
      let s = `--- Page ${i + 1} ---\n${ec.rawText}`;
      if (ec.highlightedText.length > 0) s += `\nHIGHLIGHTED: ${ec.highlightedText.join("; ")}`;
      if (ec.handwrittenNotes.length > 0) s += `\nNOTES: ${ec.handwrittenNotes.join("; ")}`;
      return s;
    })
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `You are helping a 6th grader study for a ${subjectName} test${testTopics ? ` on ${testTopics}` : ""}.

Below is OCR text from ${batch.length} pages of study material. Condense this into a thorough summary that preserves:
1. ALL key facts, dates, names, definitions, and concepts
2. ALL highlighted text and student notes VERBATIM — these are the student's priorities
3. Any vocabulary terms with definitions
4. Important cause-and-effect relationships

Do NOT omit details. Be thorough but eliminate only redundancy and filler.

${batchText}

Write a structured summary (not JSON). Use headings, bullet points, and bold for key terms.`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return `=== Material batch ${batchIndex + 1} ===\n${text}`;
}

// ── Function 2: Generate study guide + practice quiz from all materials ───────

export async function generateStudyGuide(
  extractedContents: ExtractedContent[],
  subjectName: string,
  testTopics: string | null,
  testTitle: string,
  pastPerformance?: PastPerformance
): Promise<{ content: StudyGuideContent; practiceQuiz: PracticeQuizQuestion[] }> {
  // Collect all highlighted text and notes first — these are always included verbatim
  const allHighlights: string[] = [];
  const allNotes: string[] = [];
  for (const ec of extractedContents) {
    allHighlights.push(...ec.highlightedText);
    allNotes.push(...ec.handwrittenNotes);
  }

  // Build a combined text summary of all materials
  let materialsSummary: string;

  // Check total text size
  const fullText = extractedContents.map((ec) => ec.rawText).join("\n");
  const totalChars = fullText.length;

  if (totalChars <= MAX_DIRECT_CHARS) {
    // Small enough to send directly
    materialsSummary = extractedContents
      .map((ec, i) => {
        let section = `--- Material ${i + 1} (${ec.sourceType}) ---\n${ec.rawText}`;
        if (ec.highlightedText.length > 0) {
          section += `\n\nHIGHLIGHTED BY STUDENT: ${ec.highlightedText.join("; ")}`;
        }
        if (ec.handwrittenNotes.length > 0) {
          section += `\nSTUDENT'S NOTES: ${ec.handwrittenNotes.join("; ")}`;
        }
        return section;
      })
      .join("\n\n");
  } else {
    // Too large — condense in batches of 10 pages, then combine
    console.log(`Materials too large (${totalChars} chars / ${extractedContents.length} pages). Condensing in batches...`);
    const BATCH_SIZE = 10;
    const batches: ExtractedContent[][] = [];
    for (let i = 0; i < extractedContents.length; i += BATCH_SIZE) {
      batches.push(extractedContents.slice(i, i + BATCH_SIZE));
    }

    // Run batches in parallel (up to 3 concurrent) for speed
    const summaries: string[] = [];
    for (let i = 0; i < batches.length; i += 3) {
      const chunk = batches.slice(i, i + 3);
      const results = await Promise.all(
        chunk.map((batch, j) => condenseBatch(batch, i + j, subjectName, testTopics))
      );
      summaries.push(...results);
    }

    materialsSummary = summaries.join("\n\n");

    // Append all highlights and notes verbatim so the final pass always sees them
    if (allHighlights.length > 0) {
      materialsSummary += `\n\nALL STUDENT HIGHLIGHTS (verbatim from all pages):\n${allHighlights.map((h) => `  - ${h}`).join("\n")}`;
    }
    if (allNotes.length > 0) {
      materialsSummary += `\n\nALL STUDENT HANDWRITTEN NOTES (verbatim from all pages):\n${allNotes.map((n) => `  - ${n}`).join("\n")}`;
    }
  }

  // Build past performance context
  let performanceContext = "";
  if (pastPerformance) {
    const parts: string[] = [];

    if (pastPerformance.pastTests.length > 0) {
      parts.push("PAST TEST/QUIZ SCORES IN THIS SUBJECT:");
      for (const t of pastPerformance.pastTests) {
        const score = t.scoreRaw !== null && t.scoreTotal !== null
          ? `${t.scoreRaw}/${t.scoreTotal}${t.letterGrade ? ` (${t.letterGrade})` : ""}`
          : "no score";
        parts.push(`  - ${t.type}: "${t.title}" — ${score}${t.topics ? ` [topics: ${t.topics}]` : ""}`);
      }
    }

    if (pastPerformance.wrongAnswers.length > 0) {
      parts.push("\nQUESTIONS THE STUDENT GOT WRONG ON PAST PRACTICE QUIZZES:");
      for (const w of pastPerformance.wrongAnswers.slice(0, 15)) {
        parts.push(`  - [${w.testTitle}] Q: "${w.question}"`);
        parts.push(`    Student answered: "${w.studentAnswer}" — Expected: "${w.expectedAnswer}"`);
        if (w.feedback) parts.push(`    Feedback: ${w.feedback}`);
      }
    }

    if (pastPerformance.dailyNotesWrong.length > 0) {
      parts.push("\nQUESTIONS THE STUDENT GOT WRONG ON DAILY NOTES QUIZZES:");
      for (const w of pastPerformance.dailyNotesWrong.slice(0, 10)) {
        parts.push(`  - [${w.date}] Q: "${w.question}"`);
        parts.push(`    Student answered: "${w.studentAnswer}"`);
        if (w.feedback) parts.push(`    Feedback: ${w.feedback}`);
      }
    }

    if (parts.length > 0) {
      performanceContext = "\n\n" + parts.join("\n");
    }
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `You are creating a study guide for a 6th grader preparing for a ${subjectName} ${testTitle}${testTopics ? ` covering ${testTopics}` : ""}.

Here is ALL the material the student uploaded (OCR text from photos of textbooks, handouts, and notes):

${materialsSummary}
${performanceContext}

Based on this material, create a comprehensive but 6th-grade-friendly study guide. Pay EXTRA attention to:
1. Anything the student highlighted or wrote notes about — those are their priority areas.
2. **Topics and concepts the student has gotten WRONG on past quizzes and tests.** These are weak areas that need more coverage and clearer explanations. Make sure the study guide addresses these gaps head-on.
3. If past test scores in this subject were low, emphasize fundamentals.

When creating practice quiz questions, deliberately include MORE questions targeting areas where the student has struggled before. If the student got a question wrong about a specific concept, create a similar question so they can practice it again.

Also create 8-12 practice quiz questions that test real understanding (not just memorization). Mix multiple choice and free response. Include easy, medium, and hard questions.

Respond in this exact JSON format and nothing else:
{
  "content": {
    "keyConcepts": [
      {"concept": "<concept name>", "explanation": "<clear, simple explanation a 6th grader can understand>"},
      ...
    ],
    "vocabulary": [
      {"term": "<term>", "definition": "<simple definition>"},
      ...
    ],
    "importantFacts": ["<fact 1>", "<fact 2>", ...],
    "highlightedPriorities": ["<things the student highlighted or marked as important>", ...],
    "summary": "<2-4 paragraph summary of everything the student needs to know, written simply>"
  },
  "practiceQuiz": [
    {
      "question": "<question text>",
      "choices": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "expectedAnswer": "<correct answer — for MC include the letter, for free response write a good answer>",
      "difficulty": "easy" or "medium" or "hard",
      "sourceHint": "<where in the material this came from, e.g. 'From the section about photosynthesis'>"
    },
    {
      "question": "<free response question — no choices field>",
      "expectedAnswer": "<what a good answer includes>",
      "difficulty": "medium",
      "sourceHint": "<source hint>"
    },
    ...
  ]
}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  const result = parseJson<{
    content: StudyGuideContent;
    practiceQuiz: PracticeQuizQuestion[];
  }>(text, {
    content: {
      keyConcepts: [],
      vocabulary: [],
      importantFacts: [],
      highlightedPriorities: [],
      summary: "Could not generate study guide. Try uploading clearer photos.",
    },
    practiceQuiz: [],
  });

  return result;
}

// ── Function 3: Enhance study session descriptions with real content ──────────

export function enhanceSessionDescriptions(
  guideContent: StudyGuideContent,
  sessions: Array<{ id: number; technique: string; description: string | null }>
): Array<{ id: number; description: string }> {
  const concepts = guideContent.keyConcepts.map((c) => c.concept);
  const vocab = guideContent.vocabulary.map((v) => v.term);
  const facts = guideContent.importantFacts;
  const highlighted = guideContent.highlightedPriorities;

  const conceptList = concepts.slice(0, 5).join(", ") || "the key concepts";
  const vocabList = vocab.slice(0, 6).join(", ") || "vocabulary terms";
  const factList = facts.slice(0, 4).join("; ") || "important facts";
  const highlightList = highlighted.slice(0, 4).join("; ");

  return sessions.map((s) => {
    let desc: string;

    switch (s.technique) {
      case "review":
        desc = `Read through your study guide in the app. Focus on these key concepts: ${conceptList}. Make sure you understand these vocabulary terms: ${vocabList}.`;
        if (highlightList) desc += ` You highlighted these as important: ${highlightList}.`;
        break;

      case "active_recall":
        desc = `Close everything — no peeking! Write down everything you remember about: ${conceptList}. Then open your study guide and check what you missed. Key vocabulary to recall: ${vocabList}. Facts to remember: ${factList}.`;
        break;

      case "practice_test":
        desc = `Take the Practice Quiz in the app. Try to answer every question without looking at your study guide first. After you finish, review any questions you got wrong.`;
        break;

      case "spaced_review":
        desc = `Focus on what you found tricky. Review these concepts one more time: ${conceptList}. Quiz yourself on: ${vocabList}.`;
        if (highlightList) desc += ` Don't forget the items you highlighted: ${highlightList}.`;
        break;

      case "elaboration":
        desc = `For each of these concepts, explain WHY it works in your own words: ${conceptList}. Try to connect them to each other. How does ${vocab[0] || "the first term"} relate to ${vocab[1] || "the second term"}?`;
        break;

      case "interleaving":
        desc = `Mix it up! Don't study one topic at a time. Jump between different concepts: ${conceptList}. Try answering practice quiz questions from different sections back-to-back.`;
        break;

      default:
        desc = s.description || `Study the material using your study guide.`;
    }

    return { id: s.id, description: desc };
  });
}

// ── Function 4: Batch-evaluate practice quiz answers ──────────────────────────

export async function evaluatePracticeQuizAnswers(
  questions: PracticeQuizQuestion[],
  studentAnswers: string[],
  subjectName: string
): Promise<
  Array<{
    questionIndex: number;
    correct: boolean;
    feedback: string;
    score: number;
  }>
> {
  const results: Array<{
    questionIndex: number;
    correct: boolean;
    feedback: string;
    score: number;
  }> = [];

  // Separate MC (grade locally) from free response (batch AI eval)
  const freeResponseIndices: number[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const answer = (studentAnswers[i] || "").trim();

    if (q.choices && q.choices.length > 0) {
      // Multiple choice — grade locally
      const normalizedAnswer = answer.toLowerCase().replace(/[^a-z]/g, "");
      const normalizedExpected = q.expectedAnswer.toLowerCase().replace(/[^a-z]/g, "");
      // Check if the answer starts with the expected letter
      const correct =
        normalizedAnswer.charAt(0) === normalizedExpected.charAt(0) ||
        normalizedAnswer === normalizedExpected;

      results.push({
        questionIndex: i,
        correct,
        feedback: correct
          ? "Correct!"
          : `The correct answer is ${q.expectedAnswer}.`,
        score: correct ? 100 : 0,
      });
    } else {
      // Free response — collect for batch AI evaluation
      freeResponseIndices.push(i);
      // Placeholder — will be replaced
      results.push({
        questionIndex: i,
        correct: false,
        feedback: "",
        score: 0,
      });
    }
  }

  // Batch evaluate free response answers in a single AI call
  if (freeResponseIndices.length > 0) {
    const qaPairs = freeResponseIndices
      .map((idx) => {
        const q = questions[idx];
        const a = (studentAnswers[idx] || "").trim();
        return `Q${idx + 1}: ${q.question}\nExpected: ${q.expectedAnswer}\nStudent answered: ${a || "(no answer)"}`;
      })
      .join("\n\n");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `You are grading a 6th grader's practice quiz answers for ${subjectName}. Evaluate each answer. Be encouraging but honest. Give partial credit for partial understanding.

${qaPairs}

Respond in this exact JSON format and nothing else (an array with one object per question):
[
  {
    "questionNumber": <the Q number>,
    "correct": <true if mostly correct>,
    "feedback": "<brief encouraging feedback>",
    "score": <0-100>
  },
  ...
]`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const evals = parseJson<
      Array<{
        questionNumber: number;
        correct: boolean;
        feedback: string;
        score: number;
      }>
    >(text, []);

    // Map evaluations back to results
    for (const ev of evals) {
      // questionNumber is 1-based, convert to index
      const idx = ev.questionNumber - 1;
      if (idx >= 0 && idx < results.length && freeResponseIndices.includes(idx)) {
        results[idx] = {
          questionIndex: idx,
          correct: ev.correct,
          feedback: ev.feedback,
          score: ev.score,
        };
      }
    }

    // Fill in any free response that wasn't evaluated
    for (const idx of freeResponseIndices) {
      if (!results[idx].feedback) {
        const answer = (studentAnswers[idx] || "").trim();
        results[idx] = {
          questionIndex: idx,
          correct: false,
          feedback: answer ? "Could not evaluate this answer." : "No answer provided.",
          score: 0,
        };
      }
    }
  }

  return results;
}

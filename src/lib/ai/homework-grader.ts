import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { join } from "path";
import { UPLOAD_BASE } from "@/lib/uploads";

const anthropic = new Anthropic();

export interface GradedQuestion {
  questionText: string;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  teacherNote: string;
}

export interface HomeworkGrading {
  scoreRaw: number | null;
  scoreTotal: number | null;
  scorePct: number | null;
  letterGrade: string | null;
  questions: GradedQuestion[];
  summary: string;
}

export interface QuizQuestion {
  question: string;
  choices?: string[];
  expectedAnswer: string;
  sourceHint: string;
  fromWrongAnswer: boolean;
}

export interface QuizAnswerEval {
  questionIndex: number;
  studentAnswer: string;
  correct: boolean;
  feedback: string;
}

function getMediaType(p: string): "image/png" | "image/gif" | "image/webp" | "image/jpeg" {
  const ext = p.split(".").pop()?.toLowerCase();
  return ext === "png" ? "image/png"
    : ext === "gif" ? "image/gif"
      : ext === "webp" ? "image/webp"
        : "image/jpeg";
}

async function imageBlock(photoPath: string): Promise<Anthropic.ImageBlockParam> {
  const relative = photoPath.replace(/^\/(api\/)?uploads\//, "");
  const fullPath = join(UPLOAD_BASE, relative);
  const buf = await readFile(fullPath);
  return {
    type: "image",
    source: { type: "base64", media_type: getMediaType(photoPath), data: buf.toString("base64") },
  };
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
  } catch { /* fall through */ }
  return fallback;
}

// ── Grade returned homework ────────────────────────────────────────────────────

export async function gradeReturnedHomework(
  photoPaths: string[],
  subjectName: string,
  assignmentTitle: string,
  isProject: boolean
): Promise<HomeworkGrading> {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const p of photoPaths) {
    blocks.push(await imageBlock(p));
  }

  const photoNote = photoPaths.length > 1
    ? `You are looking at ${photoPaths.length} pages of the same ${isProject ? "project" : "homework assignment"}.`
    : `You are looking at a graded ${isProject ? "project" : "homework assignment"}.`;

  blocks.push({
    type: "text",
    text: `${photoNote} The teacher has marked it. Subject: ${subjectName}. Title: ${assignmentTitle}.

Carefully analyze each problem/question on the page(s):
1. Identify each individual question or problem
2. Read the student's written answer
3. Determine if the teacher marked it correct or incorrect (look for checks, X's, score notations, comments)
4. If incorrect, identify what the correct answer should be (from teacher annotations or from the question itself)
5. Capture any teacher note next to that question

Also extract:
- Total raw score (e.g., 18) and total possible (e.g., 20). If only individual problem scores are visible, sum them.
- Letter grade if visible (A, B+, etc.)

Respond with this exact JSON and nothing else:
{
  "scoreRaw": <number or null>,
  "scoreTotal": <number or null>,
  "scorePct": <number 0-100 or null>,
  "letterGrade": "<letter or null>",
  "questions": [
    {
      "questionText": "<the question or problem>",
      "studentAnswer": "<what Jack wrote>",
      "correctAnswer": "<what it should be>",
      "isCorrect": <true/false>,
      "teacherNote": "<any teacher comment, or empty string>"
    }
  ],
  "summary": "<1-2 sentence summary of how Jack did and what he missed>"
}`,
  });

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 3000,
    messages: [{ role: "user", content: blocks }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return parseJson<HomeworkGrading>(text, {
    scoreRaw: null,
    scoreTotal: null,
    scorePct: null,
    letterGrade: null,
    questions: [],
    summary: "Could not read the graded homework. Manual review needed.",
  });
}

// ── Generate quiz from grading ────────────────────────────────────────────────

export async function generateHomeworkQuiz(
  grading: HomeworkGrading,
  subjectName: string,
  assignmentTitle: string
): Promise<QuizQuestion[]> {
  const wrong = grading.questions.filter((q) => !q.isCorrect);
  const targetCount = wrong.length > 0 ? Math.min(Math.max(wrong.length, 5), 8) : 6;
  const focusOnWrong = wrong.length > 0;

  const sourceList = focusOnWrong
    ? wrong.map((q, i) =>
        `${i + 1}. Q: ${q.questionText}\n   Jack wrote: ${q.studentAnswer}\n   Correct: ${q.correctAnswer}`
      ).join("\n")
    : grading.questions.map((q, i) =>
        `${i + 1}. Q: ${q.questionText}\n   Correct: ${q.correctAnswer}`
      ).join("\n");

  const prompt = focusOnWrong
    ? `Jack got ${wrong.length} question${wrong.length !== 1 ? "s" : ""} wrong on his ${subjectName} ${assignmentTitle} homework. Generate ${targetCount} quiz questions that target what he didn't understand. Reuse the same concept but vary the wording — don't ask the exact same question.`
    : `Jack got every question right on his ${subjectName} ${assignmentTitle} homework. Generate ${targetCount} quiz questions covering the full assignment to confirm mastery.`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2500,
    messages: [{
      role: "user",
      content: `${prompt}

Source material:
${sourceList}

Each question should be answerable in 1 sentence or less. Mix free-response with multiple choice (4 choices each, only when it fits naturally). Difficulty should match a 6th grader.

Respond with this exact JSON and nothing else:
{
  "questions": [
    {
      "question": "<the question>",
      "choices": ["A", "B", "C", "D"] or null,
      "expectedAnswer": "<correct answer>",
      "sourceHint": "<which homework concept this targets>",
      "fromWrongAnswer": <true if directly from a wrong answer, false otherwise>
    }
  ]
}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = parseJson<{ questions: QuizQuestion[] }>(text, { questions: [] });
  return parsed.questions || [];
}

// ── Grade a quiz attempt ──────────────────────────────────────────────────────

export async function gradeQuizAttempt(
  questions: QuizQuestion[],
  studentAnswers: string[]
): Promise<QuizAnswerEval[]> {
  if (questions.length !== studentAnswers.length) {
    throw new Error("questions and answers length mismatch");
  }

  const grading = questions.map((q, i) => `Q${i + 1}: ${q.question}
Expected: ${q.expectedAnswer}
Jack's answer: ${studentAnswers[i] || "(blank)"}
`).join("\n");

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `Grade Jack's quiz answers. He's a 6th grader. Be lenient on phrasing, exact wording, and minor spelling — focus on whether he understands the concept. Mark correct if the meaning matches.

${grading}

Respond with this exact JSON and nothing else:
{
  "answers": [
    {
      "questionIndex": <0-based>,
      "studentAnswer": "<exactly what Jack wrote>",
      "correct": <true/false>,
      "feedback": "<1 sentence — for wrong answers, explain the correct answer; for correct, brief affirmation>"
    }
  ]
}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = parseJson<{ answers: QuizAnswerEval[] }>(text, { answers: [] });
  return parsed.answers || [];
}

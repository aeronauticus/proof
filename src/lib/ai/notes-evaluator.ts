import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { join } from "path";
import { UPLOAD_BASE } from "@/lib/uploads";

const anthropic = new Anthropic();

interface NotesEvaluation {
  summaryEvaluation: "adequate" | "unreadable";
  summaryWordCount: number;
  feedback: string;
  quizQuestions: Array<{ question: string; expectedAnswer: string }>;
}

/**
 * Use Claude Vision to evaluate a student's notes and generate quiz questions.
 * Checks:
 * 1. Is there a summary at the bottom?
 * 2. Is the summary detailed enough (2-3+ sentences)?
 * 3. Generates 2-3 quiz questions based on the notes content.
 */
export async function evaluateNotes(
  photoPath: string,
  subjectName: string
): Promise<NotesEvaluation> {
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

  const response = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1000,
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
            text: `You are reviewing a 6th grader's ${subjectName} class notes. Summaries are optional — do NOT grade or critique whether a summary is present or detailed. Just confirm the notes are readable and generate quiz questions.

1. Read and understand the notes content
2. Always set summaryEvaluation to "adequate" if the notes are legible, or "unreadable" if you genuinely can't read them
3. Generate 2-3 quiz questions that test understanding of the ${subjectName.toLowerCase()} concepts in the notes

Respond in this exact JSON format and nothing else:
{
  "summaryEvaluation": "adequate" or "unreadable",
  "summaryWordCount": 0,
  "feedback": "<brief, encouraging feedback about the notes content>",
  "quizQuestions": [
    {"question": "<question>", "expectedAnswer": "<what a good answer would include>"},
    {"question": "<question>", "expectedAnswer": "<what a good answer would include>"},
    {"question": "<question>", "expectedAnswer": "<what a good answer would include>"}
  ]
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
      return JSON.parse(jsonMatch[0]) as NotesEvaluation;
    }
  } catch {
    // Fall through
  }

  return {
    summaryEvaluation: "unreadable",
    summaryWordCount: 0,
    feedback: "Could not read the notes photo. Please try uploading a clearer photo.",
    quizQuestions: [],
  };
}

/**
 * Evaluate manually typed notes and generate quiz questions.
 * Used when photo upload fails or is unreadable.
 */
export async function evaluateManualNotes(
  notesText: string,
  subjectName: string
): Promise<NotesEvaluation> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `You are reviewing a 6th grader's ${subjectName} class notes that they typed in manually. Summaries are optional — do NOT grade or critique whether a summary is present.

Here are the notes:
${notesText}

Always set summaryEvaluation to "adequate" if the notes have content, or "unreadable" if the text is empty/garbled. Generate 2-3 quiz questions that test understanding of the ${subjectName.toLowerCase()} concepts.

Respond in this exact JSON format and nothing else:
{
  "summaryEvaluation": "adequate" or "unreadable",
  "summaryWordCount": 0,
  "feedback": "<brief, encouraging feedback about the notes content>",
  "quizQuestions": [
    {"question": "<question>", "expectedAnswer": "<what a good answer would include>"},
    {"question": "<question>", "expectedAnswer": "<what a good answer would include>"},
    {"question": "<question>", "expectedAnswer": "<what a good answer would include>"}
  ]
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as NotesEvaluation;
    }
  } catch {
    // Fall through
  }

  return {
    summaryEvaluation: "unreadable",
    summaryWordCount: 0,
    feedback: "Could not evaluate the notes. Please try adding more detail.",
    quizQuestions: [],
  };
}

interface AnswerEvaluation {
  correct: boolean;
  feedback: string;
  score: number; // 0-100
}

/**
 * Evaluate a student's quiz answer against the expected answer.
 */
export async function evaluateAnswer(
  question: string,
  expectedAnswer: string,
  studentAnswer: string,
  subjectName: string
): Promise<AnswerEvaluation> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are grading a 6th grader's answer on a ${subjectName} review quiz.

Question: ${question}
Expected answer should include: ${expectedAnswer}
Student's answer: ${studentAnswer}

Evaluate whether the student demonstrated understanding. Be encouraging but honest.
A partial answer that shows some understanding should get partial credit.

Respond in this exact JSON format and nothing else:
{
  "correct": <true if mostly correct, false if mostly wrong>,
  "feedback": "<brief, encouraging feedback — what was good, what was missing>",
  "score": <0-100 score>
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as AnswerEvaluation;
    }
  } catch {
    // Fall through
  }

  return { correct: false, feedback: "Could not evaluate answer.", score: 0 };
}

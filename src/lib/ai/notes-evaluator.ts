import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { join } from "path";
import { UPLOAD_BASE } from "@/lib/uploads";

const anthropic = new Anthropic();

interface NotesEvaluation {
  summaryEvaluation: "adequate" | "too_brief" | "unreadable";
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

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
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
            text: `You are reviewing a 6th grader's ${subjectName} class notes. Please:

1. Look for a summary at the bottom of the notes page
2. Evaluate whether the summary is detailed enough (it should be at least 2-3 sentences and capture the main ideas, not just surface details)
3. Count the approximate words in the summary
4. Generate 2-3 quiz questions that test understanding of the material in the notes (not just recall — test comprehension)

A good summary explains the MAIN IDEA and WHY IT MATTERS, not just lists facts.

Respond in this exact JSON format and nothing else:
{
  "summaryEvaluation": "adequate" or "too_brief" or "unreadable",
  "summaryWordCount": <approximate word count of summary>,
  "feedback": "<specific feedback for the student. If too brief, explain what's missing. If adequate, praise specifically what was good. Be encouraging but honest.>",
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
        content: `You are reviewing a 6th grader's ${subjectName} class notes that they typed in manually.

Here are the notes:
${notesText}

Please:
1. Check if there is a summary section (look for "summary" or the last paragraph that wraps up the material)
2. Evaluate whether the summary is detailed enough (2-3+ sentences capturing main ideas)
3. Count the approximate words in the summary portion
4. Generate 2-3 quiz questions that test understanding (not just recall)

A good summary explains the MAIN IDEA and WHY IT MATTERS, not just lists facts.

Respond in this exact JSON format and nothing else:
{
  "summaryEvaluation": "adequate" or "too_brief" or "unreadable",
  "summaryWordCount": <approximate word count of summary>,
  "feedback": "<specific feedback for the student>",
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

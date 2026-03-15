"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import AppShell from "@/components/ui/AppShell";

interface QuizQuestion {
  question: string;
  expectedAnswer: string;
}

interface QuizAnswer {
  answer: string;
  correct: boolean;
  feedback: string;
}

interface NoteData {
  id: number;
  subjectId: number;
  subjectName: string;
  subjectColor: string;
  photoPath: string;
  summaryEvaluation: string | null;
  summaryFeedback: string | null;
  summaryWordCount: number | null;
  quizQuestions: QuizQuestion[] | null;
  quizAnswers: QuizAnswer[] | null;
  quizScore: number | null;
  quizCompletedAt: string | null;
}

interface SubjectInfo {
  id: number;
  name: string;
  color: string;
}

function SubjectNotesContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const subjectName = decodeURIComponent(params.subject as string);
  const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

  const [subject, setSubject] = useState<SubjectInfo | null>(null);
  const [note, setNote] = useState<NoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<string[]>([]);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/subjects").then((r) => r.json()),
      fetch(`/api/notes?date=${date}`).then((r) => r.json()),
    ]).then(([subjectsData, notesData]) => {
      const sub = (subjectsData.subjects || []).find(
        (s: SubjectInfo) => s.name === subjectName
      );
      setSubject(sub || null);

      const existing = (notesData.notes || []).find(
        (n: NoteData) => n.subjectName === subjectName
      );
      setNote(existing || null);

      if (existing?.quizQuestions && !existing.quizCompletedAt) {
        setQuizAnswers(new Array(existing.quizQuestions.length).fill(""));
      }

      setLoading(false);
    });
  }, [subjectName, date]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !subject) return;

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("photo", file);
    formData.append("subjectId", subject.id.toString());
    formData.append("date", date);

    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Upload failed");
        setUploading(false);
        return;
      }

      const data = await res.json();
      setNote({
        ...data.note,
        quizQuestions: data.evaluation.quizQuestions,
      });

      if (data.evaluation.quizQuestions?.length > 0) {
        setQuizAnswers(
          new Array(data.evaluation.quizQuestions.length).fill("")
        );
      }
    } catch {
      setError("Upload failed. Try again.");
    }
    setUploading(false);
  }

  async function handleSubmitQuiz() {
    if (!note) return;
    setSubmittingQuiz(true);

    try {
      const res = await fetch("/api/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: note.id, answers: quizAnswers }),
      });

      if (res.ok) {
        const data = await res.json();
        setNote((prev) =>
          prev
            ? {
                ...prev,
                quizAnswers: data.answers,
                quizScore: data.score,
                quizCompletedAt: new Date().toISOString(),
              }
            : null
        );
      }
    } catch {
      setError("Quiz submission failed.");
    }
    setSubmittingQuiz(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Subject not found.</p>
        <button
          onClick={() => router.back()}
          className="mt-4 text-blue-600 text-sm"
        >
          Go back
        </button>
      </div>
    );
  }

  const hasUpload = !!note;
  const hasQuiz = !!note?.quizQuestions && note.quizQuestions.length > 0;
  const quizDone = !!note?.quizCompletedAt;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/notes")}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
          style={{ backgroundColor: subject.color }}
        >
          {subject.name[0]}
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">{subject.name}</h2>
          <p className="text-sm text-gray-500">
            {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Upload Notes Photo */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${hasUpload ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"}`}
            >
              {hasUpload ? "✓" : "1"}
            </span>
            <h3 className="font-semibold text-gray-800">Upload Notes Photo</h3>
          </div>
        </div>

        <div className="p-4">
          {!hasUpload ? (
            <div>
              <p className="text-sm text-gray-500 mb-3">
                Take a photo of your {subject.name} notes, including the summary
                at the bottom.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-5 w-5"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Uploading & analyzing...
                  </span>
                ) : (
                  "📷 Tap to upload photo"
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Photo preview */}
              <img
                src={note!.photoPath}
                alt="Notes"
                className="w-full rounded-lg border border-gray-200"
              />
            </div>
          )}
        </div>
      </div>

      {/* Step 2: AI Summary Evaluation */}
      {hasUpload && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  note!.summaryEvaluation === "adequate"
                    ? "bg-green-500 text-white"
                    : note!.summaryEvaluation === "too_brief"
                      ? "bg-yellow-500 text-white"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {note!.summaryEvaluation === "adequate" ? "✓" : "2"}
              </span>
              <h3 className="font-semibold text-gray-800">Summary Check</h3>
              {note!.summaryWordCount != null && (
                <span className="text-xs text-gray-400 ml-auto">
                  ~{note!.summaryWordCount} words
                </span>
              )}
            </div>
          </div>

          <div className="p-4">
            {note!.summaryEvaluation === "adequate" ? (
              <div className="flex items-start gap-2">
                <span className="text-green-500 text-lg">✓</span>
                <div>
                  <p className="text-sm font-medium text-green-700">
                    Good summary!
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {note!.summaryFeedback}
                  </p>
                </div>
              </div>
            ) : note!.summaryEvaluation === "too_brief" ? (
              <div className="flex items-start gap-2">
                <span className="text-yellow-500 text-lg">⚠</span>
                <div>
                  <p className="text-sm font-medium text-yellow-700">
                    Summary needs more detail
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {note!.summaryFeedback}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <span className="text-gray-400 text-lg">?</span>
                <p className="text-sm text-gray-500">
                  {note!.summaryFeedback || "Could not evaluate the summary."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Quiz */}
      {hasUpload && hasQuiz && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${quizDone ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"}`}
              >
                {quizDone ? "✓" : "3"}
              </span>
              <h3 className="font-semibold text-gray-800">Review Quiz</h3>
              {quizDone && note!.quizScore != null && (
                <span
                  className={`text-sm font-bold ml-auto ${
                    note!.quizScore >= 70
                      ? "text-green-600"
                      : note!.quizScore >= 40
                        ? "text-yellow-600"
                        : "text-red-600"
                  }`}
                >
                  {Math.round(note!.quizScore)}%
                </span>
              )}
            </div>
          </div>

          <div className="p-4 space-y-4">
            {!quizDone ? (
              <>
                <p className="text-sm text-gray-500">
                  Answer these questions about your notes to make sure you
                  understand the material.
                </p>
                {note!.quizQuestions!.map((q, i) => (
                  <div key={i} className="space-y-2">
                    <label className="text-sm font-medium text-gray-800">
                      {i + 1}. {q.question}
                    </label>
                    <textarea
                      value={quizAnswers[i] || ""}
                      onChange={(e) => {
                        const newAnswers = [...quizAnswers];
                        newAnswers[i] = e.target.value;
                        setQuizAnswers(newAnswers);
                      }}
                      rows={3}
                      className="w-full p-3 border border-gray-200 rounded-lg text-sm text-gray-800 resize-none focus:outline-none focus:border-blue-400"
                      placeholder="Type your answer..."
                    />
                  </div>
                ))}
                <button
                  onClick={handleSubmitQuiz}
                  disabled={
                    submittingQuiz ||
                    quizAnswers.some((a) => a.trim() === "")
                  }
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {submittingQuiz ? "Checking answers..." : "Submit Answers"}
                </button>
              </>
            ) : (
              <div className="space-y-4">
                {note!.quizQuestions!.map((q, i) => {
                  const answer = note!.quizAnswers?.[i];
                  return (
                    <div
                      key={i}
                      className={`p-3 rounded-lg ${
                        answer?.correct
                          ? "bg-green-50 border border-green-200"
                          : "bg-red-50 border border-red-200"
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-800 mb-1">
                        {i + 1}. {q.question}
                      </p>
                      <p className="text-sm text-gray-600 mb-2">
                        Your answer: {answer?.answer}
                      </p>
                      <p
                        className={`text-sm font-medium ${answer?.correct ? "text-green-700" : "text-red-700"}`}
                      >
                        {answer?.correct ? "✓ " : "✗ "}
                        {answer?.feedback}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Done state */}
      {quizDone && (
        <button
          onClick={() => router.push("/notes")}
          className="w-full py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
        >
          Back to Notes
        </button>
      )}
    </div>
  );
}

export default function SubjectNotesPage() {
  return (
    <AppShell>
      <SubjectNotesContent />
    </AppShell>
  );
}

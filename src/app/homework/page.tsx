"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import AppShell, { useSession } from "@/components/ui/AppShell";

interface Assignment {
  id: number;
  subjectId: number;
  subjectName: string;
  subjectColor: string;
  title: string;
  description: string | null;
  assignedDate: string;
  dueDate: string;
  status: string;
  isProject: boolean;
  submittedAt: string | null;
  expectedReturnDate: string | null;
  gradedPhotoPaths: string[] | null;
  gradedAt: string | null;
  aiGrading: {
    scoreRaw: number | null;
    scoreTotal: number | null;
    scorePct: number | null;
    letterGrade: string | null;
    questions: Array<{
      questionText: string;
      studentAnswer: string;
      correctAnswer: string;
      isCorrect: boolean;
      teacherNote: string;
    }>;
    summary: string;
  } | null;
  photoPaths: string[] | null;
}

interface Quiz {
  id: number;
  assignmentId: number;
  generatedAt: string;
  passedAt: string | null;
  bestScorePct: number | null;
  questions: Array<{
    question: string;
    choices?: string[];
    expectedAnswer: string;
    sourceHint: string;
    fromWrongAnswer: boolean;
  }>;
  attempts: Array<{
    submittedAt: string;
    answers: Array<{
      questionIndex: number;
      studentAnswer: string;
      correct: boolean;
      feedback: string;
    }>;
    scorePct: number;
  }>;
}

function HomeworkPageContent() {
  const session = useSession();
  const searchParams = useSearchParams();
  const focusQuizId = searchParams.get("quiz");

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<{ assignment: Assignment; quiz: Quiz } | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    scorePct: number;
    passed: boolean;
    evaluations: Array<{ questionIndex: number; correct: boolean; feedback: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Upload-graded modal state
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const gradedFileRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    const res = await fetch("/api/assignments");
    const data = await res.json();
    setAssignments(data.assignments || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // If a quiz query param is set, auto-open
  useEffect(() => {
    if (!focusQuizId || assignments.length === 0) return;
    (async () => {
      for (const a of assignments) {
        const r = await fetch(`/api/assignments/${a.id}/quiz`);
        const d = await r.json();
        if (d.quiz && String(d.quiz.id) === focusQuizId) {
          setActiveQuiz({ assignment: a, quiz: d.quiz });
          break;
        }
      }
    })();
  }, [focusQuizId, assignments]);

  async function openQuiz(assignment: Assignment) {
    const res = await fetch(`/api/assignments/${assignment.id}/quiz`);
    const data = await res.json();
    if (data.quiz) {
      setActiveQuiz({ assignment, quiz: data.quiz });
      setQuizAnswers({});
      setLastResult(null);
    }
  }

  async function submitQuiz() {
    if (!activeQuiz) return;
    setSubmitting(true);
    setLastResult(null);
    const answers = activeQuiz.quiz.questions.map((_, i) => quizAnswers[i] || "");
    try {
      const res = await fetch(`/api/assignments/${activeQuiz.assignment.id}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (data.ok) {
        setLastResult({
          scorePct: data.scorePct,
          passed: data.passed,
          evaluations: data.evaluations,
        });
        if (data.passed) {
          loadData();
        }
      }
    } catch (err) {
      console.error("Quiz submit failed:", err);
    }
    setSubmitting(false);
  }

  async function handleGradedUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || uploadingFor === null) return;
    setUploadProgress(true);
    const formData = new FormData();
    for (const f of Array.from(files)) {
      formData.append("photos", f);
    }
    try {
      await fetch(`/api/assignments/${uploadingFor}/grade`, {
        method: "POST",
        body: formData,
      });
    } catch (err) {
      console.error("Graded upload failed:", err);
    }
    setUploadProgress(false);
    setUploadingFor(null);
    if (gradedFileRef.current) gradedFileRef.current.value = "";
    loadData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Active quiz UI
  if (activeQuiz) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => { setActiveQuiz(null); setLastResult(null); setQuizAnswers({}); }}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            &larr; Back to homework
          </button>
        </div>

        <div>
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">
            Homework Quiz · {activeQuiz.assignment.subjectName}
          </div>
          <h2 className="text-xl font-bold text-gray-900">{activeQuiz.assignment.title}</h2>
          <p className="text-xs text-gray-500 mt-1">
            Score 90% or higher to pass. {activeQuiz.quiz.questions.length} questions.
          </p>
          {activeQuiz.quiz.bestScorePct !== null && !activeQuiz.quiz.passedAt && (
            <p className="text-xs text-amber-700 mt-1">Best so far: {activeQuiz.quiz.bestScorePct}%</p>
          )}
          {activeQuiz.quiz.passedAt && (
            <p className="text-xs text-green-700 mt-1">Passed — but feel free to retry.</p>
          )}
        </div>

        {lastResult && (
          <div className={`p-4 rounded-xl border-2 ${lastResult.passed ? "bg-green-50 border-green-300" : "bg-amber-50 border-amber-300"}`}>
            <div className="flex items-center justify-between">
              <div className="font-bold text-lg">{lastResult.passed ? "Passed!" : "Try Again"}</div>
              <div className={`text-2xl font-bold ${lastResult.passed ? "text-green-700" : "text-amber-700"}`}>
                {lastResult.scorePct}%
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {lastResult.passed
                ? "Quiz cleared from your checklist."
                : "Need 90% to pass. Review your answers and retry."}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {activeQuiz.quiz.questions.map((q, i) => {
            const eval_ = lastResult?.evaluations.find((e) => e.questionIndex === i);
            return (
              <div
                key={i}
                className={`bg-white rounded-xl p-4 border ${
                  eval_ ? (eval_.correct ? "border-green-300" : "border-red-300") : "border-gray-200"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm font-bold text-gray-500">{i + 1}.</span>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{q.question}</p>
                    {q.choices && q.choices.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {q.choices.map((c, ci) => (
                          <label key={ci} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="radio"
                              name={`q-${i}`}
                              checked={quizAnswers[i] === c}
                              onChange={() => setQuizAnswers({ ...quizAnswers, [i]: c })}
                              disabled={submitting}
                            />
                            <span>{c}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={quizAnswers[i] || ""}
                        onChange={(e) => setQuizAnswers({ ...quizAnswers, [i]: e.target.value })}
                        disabled={submitting}
                        placeholder="Your answer"
                        className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    )}
                    {eval_ && (
                      <div className={`mt-2 text-xs p-2 rounded ${
                        eval_.correct ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                      }`}>
                        <div className="font-semibold">{eval_.correct ? "Correct" : "Incorrect"}</div>
                        <p>{eval_.feedback}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={submitQuiz}
          disabled={submitting || activeQuiz.quiz.questions.some((_, i) => !quizAnswers[i])}
          className="w-full py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Grading..." : lastResult ? "Try Again" : "Submit Quiz"}
        </button>
      </div>
    );
  }

  // Buckets
  const dueSoon = assignments.filter((a) => a.status === "pending");
  const submitted = assignments.filter((a) => a.status === "submitted");
  const needsQuiz = assignments.filter((a) => a.status === "graded");
  const verified = assignments.filter((a) => a.status === "verified");

  const isParent = session?.role === "parent";

  function dateLabel(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-gray-900">Homework</h2>

      {/* Hidden file input for graded uploads */}
      <input
        ref={gradedFileRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleGradedUpload}
      />

      {needsQuiz.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
            Quizzes to take ({needsQuiz.length})
          </h3>
          <div className="space-y-2">
            {needsQuiz.map((a) => (
              <div
                key={a.id}
                className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.subjectColor }} />
                      <span>{a.subjectName}</span>
                    </div>
                    <div className="font-semibold text-gray-900">{a.title}</div>
                    {a.aiGrading && (
                      <div className="mt-1 text-xs text-gray-700">
                        Score: <strong>{a.aiGrading.scorePct ?? "—"}%</strong>
                        {a.aiGrading.questions.length > 0 && (
                          <span> · {a.aiGrading.questions.filter((q) => !q.isCorrect).length} wrong</span>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => openQuiz(a)}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex-shrink-0"
                  >
                    Take Quiz
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {dueSoon.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
            Open assignments ({dueSoon.length})
          </h3>
          <div className="space-y-2">
            {dueSoon.map((a) => (
              <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.subjectColor }} />
                  <span>{a.subjectName}</span>
                  {a.isProject && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">PROJECT</span>
                  )}
                </div>
                <div className="font-medium text-gray-900">{a.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">Due {dateLabel(a.dueDate)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {submitted.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
            Awaiting grading ({submitted.length})
          </h3>
          <div className="space-y-2">
            {submitted.map((a) => {
              const expected = a.expectedReturnDate;
              const isOverdue = expected && new Date(expected + "T00:00:00") < new Date(new Date().setHours(0, 0, 0, 0));
              return (
                <div
                  key={a.id}
                  className={`bg-white border rounded-xl p-3 ${isOverdue ? "border-amber-300 bg-amber-50/50" : "border-gray-200"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.subjectColor }} />
                        <span>{a.subjectName}</span>
                        {a.isProject && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">PROJECT</span>
                        )}
                      </div>
                      <div className="font-medium text-gray-900">{a.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Submitted{a.submittedAt ? ` ${new Date(a.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                        {expected && <span> · expected back {dateLabel(expected)}{isOverdue ? " (overdue)" : ""}</span>}
                      </div>
                    </div>
                    {isParent && (
                      <button
                        onClick={() => { setUploadingFor(a.id); gradedFileRef.current?.click(); }}
                        disabled={uploadProgress}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 flex-shrink-0 disabled:opacity-50"
                      >
                        {uploadProgress && uploadingFor === a.id ? "Grading..." : "Upload Graded"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {verified.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
            Completed ({verified.length})
          </h3>
          <div className="space-y-2">
            {verified.slice(0, 20).map((a) => (
              <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.subjectColor }} />
                  <span>{a.subjectName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-900">{a.title}</div>
                  {a.aiGrading?.scorePct != null && (
                    <span className="text-sm font-bold text-green-700">{a.aiGrading.scorePct}%</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {assignments.length === 0 && (
        <p className="text-sm text-gray-500">No homework yet.</p>
      )}
    </div>
  );
}

export default function HomeworkPage() {
  return (
    <AppShell>
      <HomeworkPageContent />
    </AppShell>
  );
}

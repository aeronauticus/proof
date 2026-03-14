"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell, { useSession } from "@/components/ui/AppShell";

interface Test {
  id: number;
  subjectName: string;
  subjectColor: string;
  type: string;
  title: string;
  topics: string | null;
  testDate: string;
  status: string;
  takenAt: string | null;
  expectedReturnDate: string | null;
  scoreRaw: number | null;
  scoreTotal: number | null;
  letterGrade: string | null;
  aiConfidence: number | null;
  photoPath: string | null;
  returnedAt: string | null;
  correctionStatus: string;
  studentProposedScoreRaw: number | null;
  studentProposedScoreTotal: number | null;
  studentProposedLetterGrade: string | null;
  correctionReason: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  parentNotes: string | null;
}

interface StudySession {
  id: number;
  sessionDate: string;
  title: string;
  technique: string;
  durationMin: number;
  description: string;
  completed: boolean;
}

function TestDetailContent() {
  const params = useParams();
  const router = useRouter();
  const session = useSession();
  const [test, setTest] = useState<Test | null>(null);
  const [studySessions, setStudySessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionRaw, setCorrectionRaw] = useState("");
  const [correctionTotal, setCorrectionTotal] = useState("");
  const [correctionGrade, setCorrectionGrade] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  useEffect(() => {
    loadTest();
  }, [params.id]);

  async function loadTest() {
    const res = await fetch(`/api/tests`);
    const data = await res.json();
    const found = (data.tests || []).find(
      (t: Test) => t.id === parseInt(params.id as string)
    );
    setTest(found || null);

    // Load study sessions
    const sessionsRes = await fetch(
      `/api/study-sessions?testId=${params.id}`
    );
    if (sessionsRes.ok) {
      const sessionsData = await sessionsRes.json();
      setStudySessions(sessionsData.sessions || []);
    }

    setLoading(false);
  }

  async function handleTake() {
    await fetch("/api/tests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: test!.id, action: "take" }),
    });
    loadTest();
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("photo", file);

    const res = await fetch(`/api/tests/${test!.id}/photo`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setUploading(false);
    loadTest();
  }

  async function handleSubmitCorrection() {
    await fetch("/api/tests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: test!.id,
        action: "submit_correction",
        scoreRaw: parseFloat(correctionRaw),
        scoreTotal: parseFloat(correctionTotal),
        letterGrade: correctionGrade,
        reason: correctionReason,
      }),
    });
    setShowCorrection(false);
    loadTest();
  }

  async function handleReview(approved?: boolean) {
    if (test!.correctionStatus === "pending" && approved !== undefined) {
      await fetch("/api/tests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: test!.id,
          action: "review_correction",
          approved,
        }),
      });
    }

    await fetch("/api/tests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: test!.id,
        action: "review",
        notes: reviewNotes,
      }),
    });
    loadTest();
  }

  async function handleExtendReturn() {
    await fetch("/api/tests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: test!.id, action: "extend_return" }),
    });
    loadTest();
  }

  if (loading) {
    return <div className="text-gray-400 text-center py-12">Loading...</div>;
  }

  if (!test) {
    return <div className="text-gray-400 text-center py-12">Test not found</div>;
  }

  const techniqueLabels: Record<string, string> = {
    review: "Initial Review",
    active_recall: "Active Recall",
    practice_test: "Practice Test",
    spaced_review: "Final Review",
    elaboration: "Deep Understanding",
    interleaving: "Mixed Practice",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          &larr;
        </button>
        <div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: test.subjectColor }} />
            <span className="text-sm text-gray-500">{test.subjectName} {test.type}</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{test.title}</h2>
        </div>
      </div>

      {/* Test Info */}
      <div className="bg-white rounded-xl p-4 border border-gray-200 space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-500">Date</span>
          <span className="font-medium">
            {new Date(test.testDate + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "short", month: "short", day: "numeric",
            })}
          </span>
        </div>
        {test.topics && (
          <div className="flex justify-between">
            <span className="text-gray-500">Topics</span>
            <span className="font-medium text-right max-w-[60%]">{test.topics}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-500">Status</span>
          <span className="font-medium capitalize">{test.status}</span>
        </div>
        {test.scoreRaw !== null && (
          <div className="flex justify-between">
            <span className="text-gray-500">Score</span>
            <span className="font-bold text-lg">
              {test.scoreRaw}/{test.scoreTotal}
              {test.letterGrade && ` (${test.letterGrade})`}
            </span>
          </div>
        )}
      </div>

      {/* Status-specific actions */}

      {/* UPCOMING: Show study plan + "Mark as Taken" */}
      {test.status === "upcoming" && (
        <>
          {studySessions.length > 0 && (
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-3">Study Plan</h3>
              <div className="space-y-3">
                {studySessions.map((s, i) => (
                  <div
                    key={s.id}
                    className={`p-3 rounded-lg border ${
                      s.completed ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-blue-600 uppercase">
                        {techniqueLabels[s.technique] || s.technique}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(s.sessionDate + "T00:00:00").toLocaleDateString("en-US", {
                          weekday: "short", month: "short", day: "numeric",
                        })}
                        {" · "}{s.durationMin} min
                      </span>
                    </div>
                    <div className="text-sm font-medium text-gray-800">{s.title}</div>
                    {s.description && (
                      <div className="text-sm text-gray-600 mt-1">{s.description}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleTake}
            className="w-full py-3 bg-amber-600 text-white font-medium rounded-xl hover:bg-amber-700"
          >
            Mark Test as Taken
          </button>
        </>
      )}

      {/* TAKEN: Show return tracker + photo upload */}
      {test.status === "taken" && (
        <>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <h3 className="font-semibold text-yellow-800 mb-1">Waiting for Grade</h3>
            <p className="text-yellow-700 text-sm">
              Expected back by{" "}
              {test.expectedReturnDate &&
                new Date(test.expectedReturnDate + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "short", month: "short", day: "numeric",
                })}
            </p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <h3 className="font-semibold text-gray-800 mb-3">
              Got your grade back? Upload the test.
            </h3>
            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
              <svg className="w-10 h-10 text-gray-400 mb-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm text-gray-600">
                {uploading ? "Uploading & reading score..." : "Tap to take a photo of your graded test"}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoUpload}
                disabled={uploading}
              />
            </label>
          </div>

          {session?.role === "parent" && (
            <button
              onClick={handleExtendReturn}
              className="w-full py-2 text-gray-500 text-sm underline"
            >
              Teacher is slow — extend deadline by 5 days
            </button>
          )}
        </>
      )}

      {/* RETURNED: Show AI-read score, photo, correction option, parent review */}
      {test.status === "returned" && (
        <>
          {test.photoPath && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <img
                src={test.photoPath}
                alt="Graded test"
                className="w-full"
              />
            </div>
          )}

          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <h3 className="font-semibold text-gray-800 mb-2">AI-Read Score</h3>
            <div className="text-3xl font-bold text-center my-4">
              {test.scoreRaw !== null
                ? `${test.scoreRaw}/${test.scoreTotal}`
                : "Could not read"}
              {test.letterGrade && (
                <span className="text-lg text-gray-500 ml-2">
                  ({test.letterGrade})
                </span>
              )}
            </div>
            {test.aiConfidence !== null && (
              <div className="text-center text-sm text-gray-500 mb-4">
                AI confidence: {Math.round(test.aiConfidence * 100)}%
              </div>
            )}

            {/* Student can dispute */}
            {session?.role === "student" && test.correctionStatus === "none" && (
              <>
                {!showCorrection ? (
                  <button
                    onClick={() => setShowCorrection(true)}
                    className="w-full py-2 text-amber-600 text-sm font-medium border border-amber-200 rounded-lg hover:bg-amber-50"
                  >
                    Score is wrong? Request correction
                  </button>
                ) : (
                  <div className="space-y-3 p-3 bg-amber-50 rounded-lg">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        placeholder="Score"
                        value={correctionRaw}
                        onChange={(e) => setCorrectionRaw(e.target.value)}
                        className="p-2 border rounded-lg text-gray-800"
                      />
                      <input
                        type="number"
                        placeholder="Total"
                        value={correctionTotal}
                        onChange={(e) => setCorrectionTotal(e.target.value)}
                        className="p-2 border rounded-lg text-gray-800"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Letter grade"
                      value={correctionGrade}
                      onChange={(e) => setCorrectionGrade(e.target.value)}
                      className="w-full p-2 border rounded-lg text-gray-800"
                    />
                    <textarea
                      placeholder="Why is this wrong?"
                      value={correctionReason}
                      onChange={(e) => setCorrectionReason(e.target.value)}
                      className="w-full p-2 border rounded-lg text-gray-800"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowCorrection(false)}
                        className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSubmitCorrection}
                        className="flex-1 py-2 bg-amber-600 text-white rounded-lg"
                      >
                        Submit
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {test.correctionStatus === "pending" && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mt-3">
                <div className="text-sm font-medium text-amber-800">
                  Correction requested: {test.studentProposedScoreRaw}/{test.studentProposedScoreTotal}
                  {test.studentProposedLetterGrade && ` (${test.studentProposedLetterGrade})`}
                </div>
                {session?.role === "parent" && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleReview(true)}
                      className="flex-1 py-1.5 bg-green-600 text-white text-sm rounded-lg"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReview(false)}
                      className="flex-1 py-1.5 bg-red-600 text-white text-sm rounded-lg"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Parent review */}
          {session?.role === "parent" && (
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-3">Parent Review</h3>
              <textarea
                placeholder="Notes for Jack (e.g., 'Let's review question 7 together')"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full p-3 border rounded-xl text-gray-800 mb-3"
                rows={3}
              />
              <button
                onClick={() => handleReview()}
                className="w-full py-3 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700"
              >
                Mark as Reviewed
              </button>
            </div>
          )}
        </>
      )}

      {/* REVIEWED: Show final state */}
      {test.status === "reviewed" && (
        <>
          {test.photoPath && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <img src={test.photoPath} alt="Graded test" className="w-full" />
            </div>
          )}
          {test.parentNotes && (
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <h3 className="font-semibold text-blue-800 text-sm mb-1">Parent Notes</h3>
              <p className="text-blue-700">{test.parentNotes}</p>
            </div>
          )}
          <div className="text-center text-green-600 font-medium py-4">
            This test has been reviewed.
          </div>
        </>
      )}
    </div>
  );
}

export default function TestDetailPage() {
  return (
    <AppShell>
      <TestDetailContent />
    </AppShell>
  );
}

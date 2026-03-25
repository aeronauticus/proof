"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell, { useSession } from "@/components/ui/AppShell";
import Lightbox from "@/components/ui/Lightbox";

interface Subject {
  id: number;
  name: string;
  color: string;
}

interface Test {
  id: number;
  subjectId: number;
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

interface StudyMaterial {
  id: number;
  testId: number;
  photoPath: string | null;
  uploadedAt: string;
  extractedContent: {
    rawText: string;
    highlightedText: string[];
    handwrittenNotes: string[];
    sourceType: string;
  } | null;
}

interface StudyGuideContent {
  keyConcepts: Array<{ concept: string; explanation: string }>;
  vocabulary: Array<{ term: string; definition: string }>;
  importantFacts: string[];
  highlightedPriorities: string[];
  summary: string;
}

interface PracticeQuizQuestion {
  question: string;
  choices?: string[];
  expectedAnswer: string;
  difficulty: "easy" | "medium" | "hard";
  sourceHint: string;
}

interface QuizAttempt {
  attemptDate: string;
  answers: Array<{
    questionIndex: number;
    studentAnswer: string;
    correct: boolean;
    feedback: string;
    score: number;
  }>;
  overallScore: number;
}

interface StudyGuide {
  id: number;
  testId: number;
  content: StudyGuideContent;
  practiceQuiz: PracticeQuizQuestion[];
  quizAttempts: QuizAttempt[] | null;
  materialCount: number;
  generatedAt: string;
}

/** Downsample an image file so AI can still read text but uploads are fast.
 *  Target: longest edge ≤ 1600px, JPEG quality 0.7 — keeps text legible. */
async function downsampleImage(file: File): Promise<File> {
  const MAX_DIM = 1600;
  const QUALITY = 0.7;

  // Only process images
  if (!file.type.startsWith("image/")) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // Skip if already small enough
      if (width <= MAX_DIM && height <= MAX_DIM) {
        resolve(file);
        return;
      }

      // Scale down keeping aspect ratio
      if (width > height) {
        height = Math.round(height * (MAX_DIM / width));
        width = MAX_DIM;
      } else {
        width = Math.round(width * (MAX_DIM / height));
        height = MAX_DIM;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const name = file.name.replace(/\.\w+$/, ".jpg");
            resolve(new File([blob], name, { type: "image/jpeg" }));
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

function TestDetailContent() {
  const params = useParams();
  const router = useRouter();
  const session = useSession();
  const [test, setTest] = useState<Test | null>(null);
  const [studySessions, setStudySessions] = useState<StudySession[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [studyGuide, setStudyGuide] = useState<StudyGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionRaw, setCorrectionRaw] = useState("");
  const [correctionTotal, setCorrectionTotal] = useState("");
  const [correctionGrade, setCorrectionGrade] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [generatingGuide, setGeneratingGuide] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [previewMaterial, setPreviewMaterial] = useState<StudyMaterial | null>(null);
  const [guideError, setGuideError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editType, setEditType] = useState("");
  const [editSubjectId, setEditSubjectId] = useState<number>(0);
  const [editTopics, setEditTopics] = useState("");
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [saving, setSaving] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualText, setManualText] = useState("");
  const [submittingManual, setSubmittingManual] = useState(false);
  const materialFileRef = useRef<HTMLInputElement>(null);

  const loadTest = useCallback(async () => {
    try {
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

      // Load materials + study guide
      const materialsRes = await fetch(
        `/api/tests/${params.id}/materials`
      );
      if (materialsRes.ok) {
        const materialsData = await materialsRes.json();
        setMaterials(materialsData.materials || []);
        setStudyGuide(materialsData.studyGuide || null);
      }
    } catch (err) {
      console.error("Failed to load test:", err);
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    loadTest();
  }, [loadTest]);

  async function handleTake() {
    await fetch("/api/tests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: test!.id, action: "take" }),
    });
    loadTest();
  }

  async function startEditing() {
    if (!test) return;
    setEditTitle(test.title);
    setEditDate(test.testDate);
    setEditType(test.type);
    setEditSubjectId(test.subjectId);
    setEditTopics(test.topics || "");
    if (allSubjects.length === 0) {
      const res = await fetch("/api/subjects");
      const data = await res.json();
      setAllSubjects(data.subjects || []);
    }
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!test) return;
    setSaving(true);
    await fetch("/api/tests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: test.id,
        action: "edit",
        title: editTitle,
        testDate: editDate,
        type: editType,
        subjectId: editSubjectId,
        topics: editTopics,
      }),
    });
    setSaving(false);
    setEditing(false);
    loadTest();
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("photo", file);

    await fetch(`/api/tests/${test!.id}/photo`, {
      method: "POST",
      body: formData,
    });

    setUploading(false);
    loadTest();
  }

  async function handleMaterialUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingMaterial(true);

    const total = files.length;
    let failed = 0;
    setUploadProgress({ done: 0, total, failed: 0 });

    // Upload one at a time so we get immediate per-photo feedback
    for (let i = 0; i < total; i++) {
      const downsampled = await downsampleImage(files[i]);
      const formData = new FormData();
      formData.append("photos", downsampled);

      try {
        const res = await fetch(`/api/tests/${test!.id}/materials`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.ok && data.materials) {
          const newMat = data.materials[0] as StudyMaterial;
          // Add to local state immediately so user sees each photo appear
          setMaterials((prev) => [...prev, newMat]);
          if (!newMat.extractedContent) failed++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }

      setUploadProgress({ done: i + 1, total, failed });
    }

    setUploadingMaterial(false);
    setUploadProgress(null);
    if (materialFileRef.current) materialFileRef.current.value = "";
    loadTest();
  }

  async function handleManualSubmit() {
    if (!test || manualText.trim().length < 10) return;
    setSubmittingManual(true);
    try {
      const res = await fetch(`/api/tests/${test.id}/materials`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: manualText }),
      });
      const data = await res.json();
      if (data.ok && data.materials) {
        setMaterials((prev) => [...prev, ...data.materials]);
        setManualText("");
        setShowManualEntry(false);
      }
    } catch (err) {
      console.error("Manual material submission failed:", err);
    }
    setSubmittingManual(false);
    loadTest();
  }

  async function handleGenerateGuide() {
    setGeneratingGuide(true);
    setGuideError(null);

    try {
      // Kick off background generation
      const kickoff = await fetch(`/api/tests/${test!.id}/materials`, {
        method: "PATCH",
      });
      const kickoffData = await kickoff.json();

      if (!kickoff.ok && kickoffData.error) {
        setGuideError(kickoffData.error);
        setGeneratingGuide(false);
        return;
      }

      // Poll for completion
      let attempts = 0;
      const MAX_ATTEMPTS = 120; // 10 minutes max (5s intervals)
      while (attempts < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 5000)); // 5 second intervals
        attempts++;

        try {
          const poll = await fetch(`/api/tests/${test!.id}/materials`, {
            method: "PUT",
          });
          const data = await poll.json();

          if (data.status === "done") {
            await loadTest();
            setShowGuide(true);
            setGeneratingGuide(false);
            return;
          }

          if (data.status === "error") {
            setGuideError(data.error || "Generation failed");
            setGeneratingGuide(false);
            return;
          }

          if (data.status === "idle") {
            // Generation finished between kicks — reload
            await loadTest();
            setShowGuide(true);
            setGeneratingGuide(false);
            return;
          }

          // Still generating — continue polling
        } catch {
          // Network blip — keep polling
        }
      }

      setGuideError("Taking too long. Check back in a minute.");
    } catch (err) {
      setGuideError(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
      console.error("Guide generation failed:", err);
    }
    setGeneratingGuide(false);
  }

  async function handleDeleteMaterial(materialId: number) {
    await fetch(`/api/tests/${test!.id}/materials`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId }),
    });
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

  const lastAttempt = studyGuide?.quizAttempts?.length
    ? studyGuide.quizAttempts[studyGuide.quizAttempts.length - 1]
    : null;

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
      {editing ? (
        <div className="bg-white rounded-xl p-4 border-2 border-blue-300 space-y-3">
          <h3 className="font-semibold text-gray-800 text-sm">Edit Test</h3>
          <div>
            <label className="text-xs text-gray-500">Title</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full p-2 border rounded-lg text-gray-800 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Date</label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full p-2 border rounded-lg text-gray-800 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Type</label>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                className="w-full p-2 border rounded-lg text-gray-800 text-sm"
              >
                <option value="test">Test</option>
                <option value="quiz">Quiz</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Subject</label>
            <select
              value={editSubjectId}
              onChange={(e) => setEditSubjectId(parseInt(e.target.value))}
              className="w-full p-2 border rounded-lg text-gray-800 text-sm"
            >
              {allSubjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Topics</label>
            <input
              type="text"
              value={editTopics}
              onChange={(e) => setEditTopics(e.target.value)}
              placeholder="Optional"
              className="w-full p-2 border rounded-lg text-gray-800 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={saving || !editTitle.trim() || !editDate}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : (
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
          {session?.role === "parent" && (
            <button
              onClick={startEditing}
              className="w-full mt-2 py-2 text-sm text-blue-600 font-medium hover:bg-blue-50 rounded-lg"
            >
              Edit
            </button>
          )}
        </div>
      )}

      {/* UPCOMING: Study materials, guide, quiz, study plan, "Mark as Taken" */}
      {test.status === "upcoming" && (
        <>
          {/* Study Materials Upload */}
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">
                Study Materials
                {materials.length > 0 && (
                  <span className="ml-2 text-xs font-normal px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                    {materials.length} item{materials.length !== 1 ? "s" : ""}
                  </span>
                )}
              </h3>
            </div>

            {materials.length === 0 && !uploadingMaterial && !showManualEntry && (
              <p className="text-sm text-gray-500 mb-3">
                Upload photos of your textbook pages, handouts, or notes — or type them in manually.
              </p>
            )}

            {/* Summary: X of Y read successfully */}
            {materials.length > 0 && (() => {
              const photos = materials.filter((m) => m.photoPath);
              const manual = materials.filter((m) => !m.photoPath);
              const readOk = photos.filter((m) => m.extractedContent).length;
              const readFail = photos.length - readOk;
              return (
                <div className="flex items-center gap-2 mb-2 text-sm flex-wrap">
                  {photos.length > 0 && <span className="text-green-700 font-medium">{readOk} photo{readOk !== 1 ? "s" : ""} read OK</span>}
                  {readFail > 0 && (
                    <span className="text-red-600 font-medium">{readFail} couldn&apos;t read</span>
                  )}
                  {manual.length > 0 && <span className="text-blue-700 font-medium">{manual.length} typed</span>}
                </div>
              );
            })()}

            {/* Material thumbnails */}
            {materials.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
                {materials.map((m, idx) => {
                  const ok = !!m.extractedContent;
                  const isManual = !m.photoPath;
                  return (
                    <div key={m.id} className="relative flex-shrink-0">
                      {isManual ? (
                        <button
                          type="button"
                          onClick={() => setPreviewMaterial(previewMaterial?.id === m.id ? null : m)}
                          className="h-20 w-20 rounded-lg border-2 border-blue-400 bg-blue-50 flex flex-col items-center justify-center gap-1"
                        >
                          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span className="text-[9px] text-blue-600 font-medium">typed</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(idx)}
                          className="block"
                        >
                          <img
                            src={m.photoPath!}
                            alt="Study material"
                            className={`h-20 w-20 object-cover rounded-lg border-2 ${
                              ok ? "border-green-400" : "border-red-400"
                            }`}
                          />
                        </button>
                      )}
                      {/* Delete button */}
                      <button
                        onClick={() => handleDeleteMaterial(m.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                      >
                        &times;
                      </button>
                      {/* Info button — shows extracted text preview */}
                      {!isManual && (
                        <button
                          onClick={() => setPreviewMaterial(previewMaterial?.id === m.id ? null : m)}
                          className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            ok ? "bg-green-600 text-white" : "bg-red-600 text-white"
                          }`}
                        >
                          {ok ? "i" : "!"}
                        </button>
                      )}
                      {/* Status badge */}
                      {!isManual && <span className={`absolute bottom-0.5 left-0.5 text-[9px] px-1 py-0.5 rounded ${
                        ok ? "bg-green-600/80 text-white" : "bg-red-600/80 text-white"
                      }`}>
                        {ok ? (m.extractedContent?.sourceType || "OK") : "failed"}
                      </span>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Lightbox */}
            {lightboxIndex !== null && materials.length > 0 && (
              <Lightbox
                photos={materials.filter((m) => m.photoPath).map((m) => m.photoPath!)}
                initialIndex={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
              />
            )}

            {/* Preview panel for tapped thumbnail */}
            {previewMaterial && (
              <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-700">
                    {previewMaterial.extractedContent
                      ? `Extracted text (${previewMaterial.extractedContent.sourceType})`
                      : "Could not read this photo"}
                  </span>
                  <button
                    onClick={() => setPreviewMaterial(null)}
                    className="text-gray-400 hover:text-gray-600 text-xs"
                  >
                    Close
                  </button>
                </div>
                {previewMaterial.extractedContent ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    <p className="text-gray-600 whitespace-pre-line text-xs leading-relaxed">
                      {previewMaterial.extractedContent.rawText.slice(0, 500)}
                      {previewMaterial.extractedContent.rawText.length > 500 && "..."}
                    </p>
                    {previewMaterial.extractedContent.highlightedText.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-amber-700 uppercase">Highlighted:</span>
                        <p className="text-xs text-amber-800 bg-yellow-100 rounded px-1.5 py-1 mt-0.5">
                          {previewMaterial.extractedContent.highlightedText.join("; ")}
                        </p>
                      </div>
                    )}
                    {previewMaterial.extractedContent.handwrittenNotes.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-blue-700 uppercase">Your notes:</span>
                        <p className="text-xs text-blue-800 bg-blue-50 rounded px-1.5 py-1 mt-0.5">
                          {previewMaterial.extractedContent.handwrittenNotes.join("; ")}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-red-600 text-xs">
                    The AI couldn&apos;t read this photo. Try deleting it and retaking with better lighting or a clearer angle.
                  </p>
                )}
              </div>
            )}

            {/* Upload button */}
            <input
              ref={materialFileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handleMaterialUpload}
              disabled={uploadingMaterial}
            />
            <button
              onClick={() => materialFileRef.current?.click()}
              disabled={uploadingMaterial || generatingGuide}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {uploadingMaterial && uploadProgress
                ? `Reading photo ${uploadProgress.done}/${uploadProgress.total}${uploadProgress.failed > 0 ? ` (${uploadProgress.failed} failed)` : ""}...`
                : uploadingMaterial
                  ? "Reading your materials..."
                  : materials.length > 0
                    ? "Add More Photos"
                    : "Upload Study Materials"}
            </button>

            {/* Manual text entry */}
            {!showManualEntry ? (
              <button
                onClick={() => setShowManualEntry(true)}
                disabled={uploadingMaterial || generatingGuide}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Type Study Notes Manually
              </button>
            ) : (
              <div className="mt-2 border border-blue-200 rounded-xl p-3 bg-blue-50/50">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type or paste your study material
                </label>
                <textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="Type key terms, definitions, facts, concepts, or paste text from your notes..."
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleManualSubmit}
                    disabled={submittingManual || manualText.trim().length < 10}
                    className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {submittingManual ? "Saving..." : "Add Material"}
                  </button>
                  <button
                    onClick={() => { setShowManualEntry(false); setManualText(""); }}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Generate / update study guide */}
            {materials.length > 0 && !uploadingMaterial && (() => {
              const readableCount = materials.filter((m) => m.extractedContent).length;
              return (
                <>
                  {readableCount === 0 && !generatingGuide && (
                    <p className="mt-2 text-sm text-red-600 font-medium text-center">
                      None of your photos could be read. Try retaking them with better lighting.
                    </p>
                  )}
                  <button
                    onClick={handleGenerateGuide}
                    disabled={generatingGuide || readableCount === 0}
                    className="w-full mt-2 py-3 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {generatingGuide
                      ? "Generating... (this runs in the background)"
                      : studyGuide
                        ? `Update Study Guide & Quiz (${readableCount} item${readableCount !== 1 ? "s" : ""})`
                        : `Generate Study Guide & Quiz (${readableCount} item${readableCount !== 1 ? "s" : ""})`}
                  </button>
                  {generatingGuide && (
                    <p className="mt-1 text-xs text-gray-500 text-center animate-pulse">
                      Working on it — you can leave this page and come back
                    </p>
                  )}
                  {guideError && (
                    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700 font-medium">Failed to generate study guide</p>
                      <p className="text-xs text-red-600 mt-1 break-words">{guideError}</p>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Study Guide */}
          {studyGuide && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setShowGuide(!showGuide)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">📖</span>
                  <h3 className="font-semibold text-gray-800">Your Study Guide</h3>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${showGuide ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showGuide && (
                <div className="px-4 pb-4 space-y-4">
                  {/* Summary */}
                  <div>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-1">Summary</h4>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                      {studyGuide.content.summary}
                    </p>
                  </div>

                  {/* Key Concepts */}
                  {studyGuide.content.keyConcepts.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Key Concepts</h4>
                      <div className="space-y-2">
                        {studyGuide.content.keyConcepts.map((kc, i) => (
                          <div key={i} className="bg-blue-50 rounded-lg p-3">
                            <div className="text-sm font-semibold text-blue-900">{kc.concept}</div>
                            <div className="text-sm text-blue-800 mt-0.5">{kc.explanation}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Vocabulary */}
                  {studyGuide.content.vocabulary.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Vocabulary</h4>
                      <div className="space-y-2">
                        {studyGuide.content.vocabulary.map((v, i) => (
                          <div key={i} className="bg-gray-50 rounded-lg px-3 py-2">
                            <div className="text-sm font-semibold text-gray-900">{v.term}</div>
                            <div className="text-sm text-gray-600 mt-0.5">{v.definition}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Important Facts */}
                  {studyGuide.content.importantFacts.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Important Facts</h4>
                      <ul className="space-y-1">
                        {studyGuide.content.importantFacts.map((f, i) => (
                          <li key={i} className="text-sm text-gray-700 flex gap-2">
                            <span className="text-blue-500 flex-shrink-0">•</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Highlighted Priorities */}
                  {studyGuide.content.highlightedPriorities.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
                        You Highlighted These
                      </h4>
                      <div className="space-y-1">
                        {studyGuide.content.highlightedPriorities.map((h, i) => (
                          <div
                            key={i}
                            className="text-sm text-amber-900 bg-yellow-100 rounded px-2.5 py-1.5"
                          >
                            {h}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Practice Quiz Button */}
          {studyGuide && studyGuide.practiceQuiz && studyGuide.practiceQuiz.length > 0 && !showQuiz && (
            <button
              onClick={() => setShowQuiz(true)}
              className="w-full bg-purple-600 text-white rounded-xl p-4 hover:bg-purple-700 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">
                    Practice Quiz ({studyGuide.practiceQuiz.length} questions)
                  </div>
                  {lastAttempt && (
                    <div className="text-purple-200 text-sm mt-0.5">
                      Last score: {lastAttempt.overallScore}%
                      {studyGuide.quizAttempts && studyGuide.quizAttempts.length > 1 && (
                        <span> · {studyGuide.quizAttempts.length} attempts</span>
                      )}
                    </div>
                  )}
                  {!lastAttempt && (
                    <div className="text-purple-200 text-sm mt-0.5">
                      Test yourself on the material
                    </div>
                  )}
                </div>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </div>
            </button>
          )}

          {/* Practice Quiz UI */}
          {showQuiz && studyGuide && studyGuide.practiceQuiz && studyGuide.practiceQuiz.length > 0 && (
            <PracticeQuiz
              testId={test.id}
              questions={studyGuide.practiceQuiz}
              onClose={() => { setShowQuiz(false); loadTest(); }}
            />
          )}

          {/* Study Plan */}
          {studySessions.length > 0 && (
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-3">Study Plan</h3>
              <div className="space-y-3">
                {studySessions.map((s) => (
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
                    {/* Link to quiz for practice_test sessions */}
                    {s.technique === "practice_test" && (studyGuide?.practiceQuiz?.length ?? 0) > 0 && !s.completed && (
                      <button
                        onClick={() => setShowQuiz(true)}
                        className="mt-2 text-xs text-purple-600 font-medium hover:text-purple-700"
                      >
                        Start Practice Quiz →
                      </button>
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

// ── Practice Quiz Component ─────────────────────────────────────────────────

function PracticeQuiz({
  testId,
  questions,
  onClose,
}: {
  testId: number;
  questions: PracticeQuizQuestion[];
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(new Array(questions.length).fill(""));
  const [checkedIndex, setCheckedIndex] = useState(-1);
  const [feedback, setFeedback] = useState<{ correct: boolean; feedback: string; score: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Array<{
    questionIndex: number;
    correct: boolean;
    feedback: string;
    score: number;
  }> | null>(null);
  const [overallScore, setOverallScore] = useState(0);
  const [hasMorePractice, setHasMorePractice] = useState(false);

  const q = questions[currentIndex] || null;
  const isLast = currentIndex === questions.length - 1;
  const isMC = !!(q?.choices && q.choices.length > 0);
  const progress = questions.length > 0
    ? Math.round(((checkedIndex + 1) / questions.length) * 100)
    : 0;

  if (!q) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
        <p className="text-gray-500">No quiz questions available.</p>
        <button onClick={onClose} className="mt-3 text-sm text-purple-600 font-medium">Close</button>
      </div>
    );
  }

  async function handleCheckAnswer() {
    const answer = answers[currentIndex];
    if (!answer.trim()) return;

    if (isMC) {
      // Grade locally for MC
      const normalizedAnswer = answer.toLowerCase().replace(/[^a-z]/g, "");
      const normalizedExpected = q.expectedAnswer.toLowerCase().replace(/[^a-z]/g, "");
      const correct = normalizedAnswer.charAt(0) === normalizedExpected.charAt(0);
      setFeedback({
        correct,
        feedback: correct ? "Correct!" : `The correct answer is ${q.expectedAnswer}.`,
        score: correct ? 100 : 0,
      });
    } else {
      // For free response, just show a placeholder — full evaluation happens at submit
      setFeedback({
        correct: true,
        feedback: "Answer recorded. You'll see your full score when you finish the quiz.",
        score: 0,
      });
    }
    setCheckedIndex(currentIndex);
  }

  function handleNext() {
    setFeedback(null);
    if (isLast) {
      handleSubmitQuiz();
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  }

  async function handleSubmitQuiz() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tests/${testId}/practice-quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (data.ok) {
        setResults(data.results);
        setOverallScore(data.overallScore);
        setHasMorePractice(!!data.hasMorePracticeSessions);
      }
    } catch (err) {
      console.error("Quiz submission failed:", err);
    }
    setSubmitting(false);
  }

  // Results view
  if (results) {
    const correctCount = results.filter((r) => r.correct).length;
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800">Quiz Results</h3>
            <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">Done</button>
          </div>
        </div>

        {/* Score summary */}
        <div className="p-6 text-center border-b border-gray-100">
          <div className={`text-5xl font-bold ${overallScore >= 80 ? "text-green-600" : overallScore >= 60 ? "text-amber-600" : "text-red-600"}`}>
            {overallScore}%
          </div>
          <div className="text-gray-500 mt-1">
            {correctCount} of {questions.length} correct
          </div>
          {overallScore >= 80 && (
            <p className="text-green-600 text-sm font-medium mt-2">Great job! You know this material well.</p>
          )}
          {overallScore >= 60 && overallScore < 80 && (
            <p className="text-amber-600 text-sm font-medium mt-2">Getting there! Review the ones you missed.</p>
          )}
          {overallScore < 60 && (
            <p className="text-red-600 text-sm font-medium mt-2">Keep studying! Check the hints below to focus your review.</p>
          )}
        </div>

        {/* Question-by-question results */}
        <div className="divide-y divide-gray-100">
          {results.map((r, i) => {
            const rq = questions[i];
            return (
              <div key={i} className={`p-3 ${r.correct ? "bg-green-50/50" : "bg-red-50/50"}`}>
                <div className="flex items-start gap-2">
                  <span className={`flex-shrink-0 text-sm ${r.correct ? "text-green-600" : "text-red-600"}`}>
                    {r.correct ? "✓" : "✗"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800">{rq?.question || `Question ${i + 1}`}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Your answer: {answers[i] || "(blank)"}
                    </div>
                    {!r.correct && rq && (
                      <>
                        <div className="text-xs text-green-700 mt-0.5">
                          Correct: {rq.expectedAnswer}
                        </div>
                        {rq.sourceHint && (
                          <div className="text-xs text-gray-500 mt-0.5 italic">
                            Hint: {rq.sourceHint}
                          </div>
                        )}
                      </>
                    )}
                    {r.feedback && r.feedback !== "Correct!" && r.feedback !== `The correct answer is ${rq?.expectedAnswer}.` && (
                      <div className="text-xs text-gray-600 mt-0.5">{r.feedback}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 space-y-2">
          {hasMorePractice && (
            <button
              onClick={onClose}
              className="w-full py-3 bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-700"
            >
              Take Next Practice Quiz
            </button>
          )}
          <button
            onClick={onClose}
            className={`w-full py-3 font-medium rounded-xl ${
              hasMorePractice
                ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                : "bg-purple-600 text-white hover:bg-purple-700"
            }`}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Quiz in progress
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">
            Exit Quiz
          </button>
        </div>
        <div className="bg-gray-200 rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full bg-purple-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="p-4 space-y-4">
        {q.difficulty && (
          <div className="flex items-start gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              q.difficulty === "easy"
                ? "bg-green-100 text-green-700"
                : q.difficulty === "medium"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700"
            }`}>
              {q.difficulty}
            </span>
          </div>
        )}

        <p className="text-gray-800 font-medium">{q.question || "Question"}</p>

        {/* Multiple choice options */}
        {isMC && q.choices && (
          <div className="space-y-2">
            {q.choices.map((choice, i) => {
              const letter = choice.charAt(0).toLowerCase();
              const selected = answers[currentIndex].toLowerCase().startsWith(letter);
              return (
                <button
                  key={i}
                  onClick={() => {
                    if (feedback) return;
                    const updated = [...answers];
                    updated[currentIndex] = choice.charAt(0);
                    setAnswers(updated);
                  }}
                  disabled={!!feedback}
                  className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${
                    selected
                      ? feedback
                        ? feedback.correct
                          ? "border-green-500 bg-green-50"
                          : "border-red-500 bg-red-50"
                        : "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  } ${feedback ? "cursor-default" : ""}`}
                >
                  {choice}
                </button>
              );
            })}
          </div>
        )}

        {/* Free response */}
        {!isMC && (
          <textarea
            value={answers[currentIndex]}
            onChange={(e) => {
              if (feedback) return;
              const updated = [...answers];
              updated[currentIndex] = e.target.value;
              setAnswers(updated);
            }}
            disabled={!!feedback}
            rows={3}
            placeholder="Type your answer..."
            className="w-full p-3 border border-gray-200 rounded-lg text-sm text-gray-800 resize-none focus:outline-none focus:border-purple-400"
          />
        )}

        {/* Feedback */}
        {feedback && (
          <div className={`p-3 rounded-lg ${
            feedback.correct ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
          }`}>
            <p className={`text-sm font-medium ${feedback.correct ? "text-green-800" : "text-red-800"}`}>
              {feedback.feedback}
            </p>
          </div>
        )}

        {/* Action buttons */}
        {!feedback ? (
          <button
            onClick={handleCheckAnswer}
            disabled={!answers[currentIndex].trim()}
            className="w-full py-3 bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-700 disabled:opacity-50"
          >
            Check Answer
          </button>
        ) : (
          <button
            onClick={handleNext}
            disabled={submitting}
            className="w-full py-3 bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-700 disabled:opacity-50"
          >
            {submitting ? "Scoring..." : isLast ? "See Results" : "Next Question"}
          </button>
        )}
      </div>
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

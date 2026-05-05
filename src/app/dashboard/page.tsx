"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import AppShell, { useSession } from "@/components/ui/AppShell";
import Lightbox from "@/components/ui/Lightbox";
import CelebrationOverlay from "@/components/ui/CelebrationOverlay";
import { toLocalISODate } from "@/lib/date-utils";

interface PlannerAssignment {
  subject: string;
  title: string;
  dueDate: string;
}

interface PlannerTest {
  subject: string;
  type: "test" | "quiz";
  title: string;
  testDate: string;
  topics: string | null;
}

interface PlannerExtraction {
  assignments: PlannerAssignment[];
  tests: PlannerTest[];
  rawNotes: string;
}

interface AiHomeworkEval {
  looksLikeHomework: boolean;
  appearsComplete: boolean;
  missingAnswers: boolean;
  estimatedCompletionPct: number;
  feedback: string;
  parentNote: string;
}

interface StudyContext {
  testDate: string;
  technique: string;
  durationMin: number;
  description: string | null;
  testTitle: string;
  subjectName: string;
}

interface ChecklistItem {
  id: number;
  title: string;
  completed: boolean;
  completedAt: string | null;
  verifiedBy: number | null;
  verifiedAt: string | null;
  requiresParent: boolean;
  subjectId: number | null;
  studySessionId: number | null;
  homeworkQuizId: number | null;
  orderIndex: number;
  notes: string | null;
  photoPaths: string[] | null;
  aiHomeworkEval: AiHomeworkEval | null;
  studentConfirmedComplete: boolean;
  studyContext?: StudyContext;
  date?: string;
  waivedBy?: number | null;
  waivedAt?: string | null;
}

interface StudyProgressTest {
  testId: number;
  testTitle: string;
  testDate: string;
  testType: string;
  testStatus: string;
  subjectName: string;
  subjectColor: string;
  totalSessions: number;
  completedSessions: number;
  materialCount: number;
  nextSession: {
    id: number;
    sessionDate: string;
    title: string;
    technique: string;
    durationMin: number;
    description: string | null;
    completed: boolean;
  } | null;
}

interface ScheduleSlot {
  subjectName: string;
  subjectColor: string;
  startTime: string;
  endTime: string;
}

interface Assignment {
  id: number;
  subjectName: string;
  subjectColor: string;
  title: string;
  description: string | null;
  dueDate: string;
  status: string;
  photoPaths: string[] | null;
  aiHomeworkEval: AiHomeworkEval | null;
  studentConfirmedComplete: boolean;
  isProject?: boolean;
  submittedAt?: string | null;
  expectedReturnDate?: string | null;
}

interface Book {
  id: number;
  title: string;
  author: string | null;
  dueDate: string;
  startedAt: string;
  status: string;
  testScore: number | null;
  completedAt: string | null;
  notes: string | null;
}

interface Test {
  id: number;
  subjectName: string;
  subjectColor: string;
  type: string;
  title: string;
  testDate: string;
  status: string;
  expectedReturnDate: string | null;
  scoreRaw: number | null;
  scoreTotal: number | null;
  letterGrade: string | null;
  correctionStatus: string;
  correctionReason: string | null;
  studentProposedScoreRaw: number | null;
  studentProposedScoreTotal: number | null;
  studentProposedLetterGrade: string | null;
  photoPath: string | null;
  photoPaths: string[] | null;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function daysSince(dateStr: string): number {
  return -daysUntil(dateStr);
}

/** Clickable photo thumbnails that open a lightbox */
function PhotoThumbnails({
  photos,
  size = "h-24 w-24",
  className = "",
}: {
  photos: string[];
  size?: string;
  className?: string;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  if (!photos || photos.length === 0) return null;

  return (
    <>
      <div className={`flex gap-2 overflow-x-auto ${className}`}>
        {photos.map((path, i) => (
          <img
            key={i}
            src={path}
            alt={`Photo ${i + 1}`}
            className={`rounded-lg border border-gray-200 ${size} object-cover flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity`}
            onClick={() => { setLightboxIndex(i); setLightboxOpen(true); }}
          />
        ))}
      </div>
      {lightboxOpen && (
        <Lightbox
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

/** Per-assignment homework upload flow within the Homework checklist item */
function HomeworkSection({
  assignments,
  checklistItemId,
  onReload,
}: {
  assignments: Assignment[];
  checklistItemId: number;
  onReload: () => void;
}) {
  const [activeAssignment, setActiveAssignment] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [aiWarnings, setAiWarnings] = useState<Record<number, AiHomeworkEval>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const today = toLocalISODate(new Date());

  async function handleAddPhoto(assignmentId: number, file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append("id", assignmentId.toString());
    formData.append("action", "add_photos");
    formData.append("photos", file);
    await fetch("/api/assignments", { method: "PATCH", body: formData });
    setUploading(false);
    onReload();
  }

  async function handleSubmit(assignmentId: number) {
    setSubmitting(assignmentId);
    const res = await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: assignmentId, action: "complete" }),
    });
    const data = await res.json();
    setSubmitting(null);

    if (data.needsConfirmation) {
      setAiWarnings((prev) => ({ ...prev, [assignmentId]: data.aiHomeworkEval }));
    }
    onReload();

    // Check if all assignments are now complete → auto-complete checklist item
    const updatedRes = await fetch(`/api/assignments?status=pending&to=${(() => { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })()}`);
    const updatedData = await updatedRes.json();
    const stillPending = (updatedData.assignments || []).length;
    if (stillPending === 0) {
      await fetch("/api/checklist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: checklistItemId, action: "complete" }),
      });
      onReload();
    }
  }

  async function handleConfirm(assignmentId: number) {
    await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: assignmentId, action: "confirm_complete" }),
    });
    setAiWarnings((prev) => {
      const next = { ...prev };
      delete next[assignmentId];
      return next;
    });
    onReload();

    // Check if all done
    const updatedRes = await fetch(`/api/assignments?status=pending&to=${(() => { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })()}`);
    const updatedData = await updatedRes.json();
    if ((updatedData.assignments || []).length === 0) {
      await fetch("/api/checklist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: checklistItemId, action: "complete" }),
      });
      onReload();
    }
  }

  if (assignments.length === 0) {
    return (
      <div className="ml-8 space-y-2">
        <p className="text-xs text-gray-500">No pending homework due tomorrow.</p>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/assignments/new")}
            className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
          >
            + Add Assignment
          </button>
          <button
            onClick={async () => {
              await fetch("/api/checklist", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ itemId: checklistItemId, action: "complete" }),
              });
              onReload();
            }}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            No Homework Today
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ml-8 space-y-2">
      <p className="text-xs text-gray-500 mb-1">
        Upload photos for each assignment:
      </p>
      {assignments.map((a) => {
        const photos = a.photoPaths || [];
        const isActive = activeAssignment === a.id;
        const warning = aiWarnings[a.id] || (
          a.aiHomeworkEval && (a.aiHomeworkEval.missingAnswers || !a.aiHomeworkEval.appearsComplete || !a.aiHomeworkEval.looksLikeHomework)
            ? a.aiHomeworkEval
            : null
        );
        const isOverdue = a.dueDate < today;

        return (
          <div
            key={a.id}
            className={`border rounded-lg overflow-hidden ${
              a.status !== "pending"
                ? "border-green-200 bg-green-50/50"
                : warning
                  ? "border-amber-200 bg-amber-50/30"
                  : "border-gray-200"
            }`}
          >
            {/* Assignment header */}
            <button
              onClick={() => setActiveAssignment(isActive ? null : a.id)}
              className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-gray-50/50"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: a.subjectColor }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 leading-snug">{a.title}</div>
                <div className="text-[11px] text-gray-400">
                  {a.subjectName}
                  {(() => {
                    if (isOverdue) return <span className="text-red-500 ml-1">(overdue)</span>;
                    if (a.dueDate === today) return <span className="text-amber-600 ml-1">(due today)</span>;
                    const d = new Date(a.dueDate + "T00:00:00");
                    const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                    return <span className="ml-1">(due {label})</span>;
                  })()}
                  {a.isProject && <span className="ml-1 text-purple-600">· project</span>}
                </div>
              </div>
              {a.status !== "pending" ? (
                <span className="text-xs text-green-600 font-medium flex-shrink-0">Submitted</span>
              ) : photos.length > 0 ? (
                <span className="text-[11px] text-blue-500 flex-shrink-0">{photos.length} photo{photos.length > 1 ? "s" : ""}</span>
              ) : (
                <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isActive ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>

            {/* Expanded: photo upload area */}
            {isActive && a.status === "pending" && (
              <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
                {a.description && (
                  <p className="text-xs text-gray-500 mt-2">{a.description}</p>
                )}

                <PhotoThumbnails photos={photos} size="h-16 w-16" className="mt-2" />

                {/* AI warning */}
                {warning && (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-900 font-medium">
                      {!warning.looksLikeHomework
                        ? "This doesn't look like homework."
                        : warning.missingAnswers
                          ? "Some answers might be missing."
                          : "This may not be fully complete."}
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">{warning.feedback}</p>
                  </div>
                )}

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    await handleAddPhoto(a.id, file);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                />

                <div className="flex gap-2 mt-2 flex-wrap">
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium disabled:opacity-50 hover:bg-gray-200"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {uploading ? "..." : photos.length > 0 ? "Add Photo" : "Take Photo"}
                  </button>

                  {photos.length === 0 && !warning && (
                    <button
                      onClick={async () => {
                        setSubmitting(a.id);
                        await fetch("/api/assignments", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: a.id, action: "already_turned_in" }),
                        });
                        setSubmitting(null);
                        onReload();
                        // Auto-complete checklist if no more pending
                        const updatedRes = await fetch(`/api/assignments?status=pending&to=${(() => { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })()}`);
                        const updatedData = await updatedRes.json();
                        if ((updatedData.assignments || []).length === 0) {
                          await fetch("/api/checklist", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ itemId: checklistItemId, action: "complete" }),
                          });
                          onReload();
                        }
                      }}
                      disabled={submitting === a.id}
                      className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200 disabled:opacity-50"
                    >
                      Already Turned In
                    </button>
                  )}

                  {photos.length > 0 && !warning && (
                    <button
                      onClick={() => handleSubmit(a.id)}
                      disabled={submitting === a.id}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {submitting === a.id ? "Checking..." : "Submit"}
                    </button>
                  )}

                  {warning && (
                    <>
                      <button
                        onClick={() => handleSubmit(a.id)}
                        disabled={submitting === a.id}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 disabled:opacity-50"
                      >
                        Resubmit
                      </button>
                      <button
                        onClick={() => handleConfirm(a.id)}
                        className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700"
                      >
                        It&apos;s Done
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Submitted assignment - show photos inline */}
            {a.status !== "pending" && photos.length > 0 && (
              <div className="px-3 pb-2 border-t border-green-100">
                <PhotoThumbnails photos={photos} size="h-12 w-12" className="mt-2" />
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={() => router.push("/assignments/new")}
        className="text-xs text-blue-600 font-medium hover:text-blue-700 mt-1"
      >
        + Add another assignment
      </button>
    </div>
  );
}

function ChecklistRow({
  item,
  hasPlannerPhoto,
  homeworkAssignments,
  onToggle,
  onAddPhoto,
  onCompleteHomework,
  onConfirmComplete,
  onReadingNotes,
  onReload,
}: {
  item: ChecklistItem;
  hasPlannerPhoto: boolean;
  homeworkAssignments: Assignment[];
  onToggle: (id: number) => void;
  onAddPhoto: (id: number, file: File) => Promise<void>;
  onCompleteHomework: (id: number) => Promise<{ needsConfirmation?: boolean; aiHomeworkEval?: AiHomeworkEval } | null>;
  onConfirmComplete: (id: number) => void;
  onReadingNotes: (id: number, notes: string) => void;
  onReload: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [readingText, setReadingText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiWarning, setAiWarning] = useState<AiHomeworkEval | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isHomework = item.title === "Homework";
  const isReading = item.title === "Reading / Memory Work";
  const isBlocked = item.title === "Organization" && !hasPlannerPhoto;
  const isHomeworkQuiz = !!item.homeworkQuizId;

  // Completed items — show proof if it exists
  if (item.completed) {
    return (
      <div className={`px-4 py-3 ${item.verifiedBy ? "bg-green-50/50" : ""}`}>
        <div className="flex items-center gap-3">
          <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center animate-checkmark-pop ${
            item.verifiedBy ? "border-green-500 bg-green-500" : "border-blue-500 bg-blue-500"
          }`}>
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="flex-1 text-sm text-gray-400 line-through">{item.title}</span>
          {item.requiresParent && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              item.verifiedBy ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
            }`}>
              {item.verifiedBy ? "Verified" : "Pending"}
            </span>
          )}
        </div>
        {/* Show proof inline */}
        <PhotoThumbnails photos={item.photoPaths || []} className="mt-2" />
        {/* AI warning badge if student confirmed despite warning */}
        {item.studentConfirmedComplete && item.aiHomeworkEval && (
          <p className="mt-1 text-[11px] text-amber-600 bg-amber-50 rounded px-2 py-1">
            AI flagged: {item.aiHomeworkEval.feedback}
          </p>
        )}
        {item.notes && isReading && (
          <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">{item.notes}</p>
        )}
      </div>
    );
  }

  // Homework items — delegate to HomeworkSection
  // Homework Quiz item — links to /homework?quiz=X
  if (isHomeworkQuiz && !item.completed) {
    return (
      <a
        href={`/homework?quiz=${item.homeworkQuizId}`}
        className="w-full flex items-center gap-3 px-4 py-3 transition-colors hover:bg-blue-50 cursor-pointer active:bg-blue-100"
      >
        <div className="w-5 h-5 rounded-full border-2 border-blue-300 flex-shrink-0" />
        <span className="flex-1 text-sm text-gray-800">{item.title}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">QUIZ</span>
      </a>
    );
  }

  if (isHomework && !item.completed) {
    return (
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
          <span className="flex-1 text-sm font-medium text-gray-800">{item.title}</span>
        </div>
        <HomeworkSection
          assignments={homeworkAssignments}
          checklistItemId={item.id}
          onReload={onReload}
        />
      </div>
    );
  }

  // Not completed — handle reading/memory work
  if (isReading && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 cursor-pointer active:bg-gray-100"
      >
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
        <span className="flex-1 text-sm text-gray-800">{item.title}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">Write</span>
      </button>
    );
  }

  if (isReading && expanded) {
    return (
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
          <span className="flex-1 text-sm font-medium text-gray-800">{item.title}</span>
          <button onClick={() => setExpanded(false)} className="text-xs text-gray-400">Cancel</button>
        </div>
        <p className="text-xs text-gray-500 ml-8">What did you read? What memory work did you practice?</p>
        <textarea
          value={readingText}
          onChange={(e) => setReadingText(e.target.value)}
          rows={3}
          className="w-full ml-8 mr-4 p-2 border border-gray-200 rounded-lg text-sm text-gray-800 resize-none focus:outline-none focus:border-blue-400"
          style={{ width: "calc(100% - 2rem)" }}
          placeholder="e.g., Read chapter 5 of History textbook and practiced Latin vocabulary list 3 aloud twice..."
        />
        <button
          onClick={async () => {
            setSubmitting(true);
            await onReadingNotes(item.id, readingText);
            setSubmitting(false);
            setExpanded(false);
          }}
          disabled={submitting || readingText.trim().length < 10}
          className="ml-8 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Done"}
        </button>
      </div>
    );
  }

  // Study session items — show expanded context
  if (item.studyContext) {
    const ctx = item.studyContext;
    const days = daysUntil(ctx.testDate);
    const techniqueLabels: Record<string, string> = {
      review: "Review",
      active_recall: "Active Recall",
      practice_test: "Practice Test",
      spaced_review: "Spaced Review",
      elaboration: "Elaboration",
      interleaving: "Interleaving",
    };
    return (
      <div className="px-4 py-3 space-y-1.5">
        <button
          onClick={() => onToggle(item.id)}
          className="w-full flex items-start gap-3 text-left hover:bg-gray-50 rounded-lg transition-colors cursor-pointer active:bg-gray-100 -mx-1 px-1"
        >
          <div className="w-5 h-5 rounded-full border-2 border-purple-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800">{item.title}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                days <= 1 ? "bg-red-100 text-red-700" : days <= 3 ? "bg-amber-100 text-amber-700" : "bg-purple-100 text-purple-700"
              }`}>
                {days === 0 ? "TEST TODAY" : days === 1 ? "Test tmrw" : `${days}d to test`}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-medium">
                {techniqueLabels[ctx.technique] || ctx.technique}
              </span>
              <span className="text-[11px] text-gray-400">{ctx.durationMin} min</span>
            </div>
            {ctx.description && (
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{ctx.description}</p>
            )}
          </div>
        </button>
      </div>
    );
  }

  // Default: simple toggle items
  return (
    <button
      onClick={() => !isBlocked && onToggle(item.id)}
      disabled={isBlocked}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
        isBlocked ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50 cursor-pointer active:bg-gray-100"
      }`}
    >
      <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
      <span className="flex-1 text-sm text-gray-800">{item.title}</span>
      {item.requiresParent && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">P</span>
      )}
      {isBlocked && (
        <span className="text-[10px] text-yellow-600 font-medium">Planner first</span>
      )}
    </button>
  );
}

/** Review AI-extracted planner items before saving */
function PlannerReview({
  extraction,
  onConfirm,
  onDismiss,
}: {
  extraction: PlannerExtraction;
  onConfirm: (assignments: PlannerAssignment[], tests: PlannerTest[]) => void;
  onDismiss: () => void;
}) {
  const [assignments, setAssignments] = useState(
    extraction.assignments.map((a) => ({ ...a, included: true }))
  );
  const [plannerTests, setPlannerTests] = useState(
    extraction.tests.map((t) => ({ ...t, included: true }))
  );
  const [saving, setSaving] = useState(false);

  const totalItems = assignments.length + plannerTests.length;

  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualText, setManualText] = useState("");
  const [parsingManual, setParsingManual] = useState(false);

  async function handleManualSubmit() {
    if (!manualText.trim()) return;
    setParsingManual(true);
    try {
      const res = await fetch("/api/planner/parse-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: manualText }),
      });
      const data = await res.json();
      if (data.assignments?.length || data.tests?.length) {
        // Replace current extraction with manual parse results
        setAssignments(
          (data.assignments || []).map((a: PlannerAssignment) => ({ ...a, included: true }))
        );
        setPlannerTests(
          (data.tests || []).map((t: PlannerTest) => ({ ...t, included: true }))
        );
        setShowManualEntry(false);
      }
    } catch {
      // Ignore
    }
    setParsingManual(false);
  }

  if (totalItems === 0 && !showManualEntry) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-semibold text-blue-800 text-sm mb-1">Planner Read</h3>
        <p className="text-sm text-blue-700">
          {extraction.rawNotes
            ? "AI couldn't find any assignments or tests in your planner today."
            : "Couldn't read the planner photo. Make sure it's clear and well-lit."}
        </p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={onDismiss}
            className="text-xs text-blue-600 font-medium"
          >
            OK, No Homework
          </button>
          <button
            onClick={() => setShowManualEntry(true)}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            Type Items Manually
          </button>
        </div>
      </div>
    );
  }

  if (showManualEntry) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-blue-800 text-sm">Type Planner Items</h3>
        <p className="text-xs text-blue-600">
          Type what&apos;s in your planner — one item per line. Include the subject and due date if you can.
        </p>
        <textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          rows={5}
          placeholder={"History worksheet p.45 due Wednesday\nLatin vocab quiz Friday\nScience read ch.6"}
          className="w-full p-3 border border-blue-200 rounded-lg text-sm text-gray-800 resize-none focus:outline-none focus:border-blue-400"
        />
        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowManualEntry(false);
              onDismiss();
            }}
            className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleManualSubmit}
            disabled={!manualText.trim() || parsingManual}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {parsingManual ? "Parsing..." : "Parse Items"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-blue-800">
          AI found {totalItems} item{totalItems !== 1 ? "s" : ""} in your planner
        </h3>
        <button onClick={onDismiss} className="text-xs text-gray-400">Skip</button>
      </div>
      <p className="text-xs text-blue-600">Uncheck anything that&apos;s wrong, then tap Save.</p>

      {/* Assignments */}
      {assignments.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Assignments</p>
          {assignments.map((a, i) => (
            <label key={i} className="flex items-start gap-2 py-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={a.included}
                onChange={() => {
                  const next = [...assignments];
                  next[i] = { ...next[i], included: !next[i].included };
                  setAssignments(next);
                }}
                className="mt-0.5 rounded"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800">{a.title}</div>
                <div className="text-xs text-gray-500">{a.subject} — due {a.dueDate}</div>
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Tests */}
      {plannerTests.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Tests / Quizzes</p>
          {plannerTests.map((t, i) => (
            <label key={i} className="flex items-start gap-2 py-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={t.included}
                onChange={() => {
                  const next = [...plannerTests];
                  next[i] = { ...next[i], included: !next[i].included };
                  setPlannerTests(next);
                }}
                className="mt-0.5 rounded"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800">
                  <span className="uppercase text-[10px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 mr-1">{t.type}</span>
                  {t.title}
                </div>
                <div className="text-xs text-gray-500">
                  {t.subject} — {t.testDate}
                  {t.topics && ` — ${t.topics}`}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}

      <button
        onClick={async () => {
          setSaving(true);
          const selectedAssignments = assignments
            .filter((a) => a.included)
            .map(({ included, ...rest }) => rest);
          const selectedTests = plannerTests
            .filter((t) => t.included)
            .map(({ included, ...rest }) => rest);
          await onConfirm(selectedAssignments, selectedTests);
          setSaving(false);
        }}
        disabled={saving}
        className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : `Save ${assignments.filter((a) => a.included).length + plannerTests.filter((t) => t.included).length} Items`}
      </button>
    </div>
  );
}

function DashboardContent() {
  const session = useSession();
  const router = useRouter();
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
  const [assignmentsDue, setAssignmentsDue] = useState<Assignment[]>([]);
  const [upcomingTests, setUpcomingTests] = useState<Test[]>([]);
  const [overdueTests, setOverdueTests] = useState<Test[]>([]);
  const [pendingCorrections, setPendingCorrections] = useState<Test[]>([]);
  const [expandedCorrection, setExpandedCorrection] = useState<number | null>(null);
  const [overdueHomeworkReturns, setOverdueHomeworkReturns] = useState<Assignment[]>([]);
  const [failedQuizzes, setFailedQuizzes] = useState<Assignment[]>([]);
  const [pendingVerification, setPendingVerification] = useState<ChecklistItem[]>([]);
  const [hasPlannerPhoto, setHasPlannerPhoto] = useState(false);
  const [isSchoolDay, setIsSchoolDay] = useState(true);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [plannerExtraction, setPlannerExtraction] = useState<PlannerExtraction | null>(null);
  const [studyProgress, setStudyProgress] = useState<StudyProgressTest[]>([]);
  const [homeworkAssignments, setHomeworkAssignments] = useState<Assignment[]>([]);
  const [missingItems, setMissingItems] = useState<ChecklistItem[]>([]);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [showAddBook, setShowAddBook] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState("");
  const [newBookAuthor, setNewBookAuthor] = useState("");
  const [newBookDueDate, setNewBookDueDate] = useState("");
  const [savingBook, setSavingBook] = useState(false);
  const [bookScoreInputs, setBookScoreInputs] = useState<Record<number, string>>({});
  const [showCelebration, setShowCelebration] = useState(false);
  const prevCompletionRef = useRef(0);

  const today = toLocalISODate(new Date());

  const loadData = useCallback(async () => {
    try {
      const [checklistRes, scheduleRes, assignmentsRes, homeworkRes, testsRes, studyProgressRes, missingRes, booksRes, allAssignmentsRes] =
        await Promise.all([
          fetch(`/api/checklist?date=${today}`),
          fetch(`/api/schedule?date=${today}`),
          fetch(`/api/assignments?status=pending&from=${today}&to=${today}`),
          fetch(`/api/assignments?status=pending&to=${(() => { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })()}`), // pending homework in 7-day window
          fetch(`/api/tests`),
          fetch(`/api/study-progress`),
          fetch(`/api/checklist/missing?date=${today}`),
          fetch(`/api/books`),
          fetch(`/api/assignments`), // all assignments (for graded-return tracking)
        ]);

      const checklistData = await checklistRes.json();
      const scheduleData = await scheduleRes.json();
      const assignmentsData = await assignmentsRes.json();
      const homeworkData = await homeworkRes.json();
      const testsData = await testsRes.json();
      const studyProgressData = await studyProgressRes.json();
      const missingData = await missingRes.json();
      const booksData = await booksRes.json();
      const allAssignmentsData = await allAssignmentsRes.json();
      setActiveBook(booksData.active || null);

      const allAssignments: Assignment[] = allAssignmentsData.assignments || [];
      const todayMs = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
      setOverdueHomeworkReturns(
        allAssignments.filter((a) =>
          a.status === "submitted" &&
          a.expectedReturnDate &&
          new Date(a.expectedReturnDate + "T00:00:00").getTime() < todayMs
        )
      );
      // Failed quizzes — graded assignments still without a verified state
      setFailedQuizzes(allAssignments.filter((a) => a.status === "graded"));

      setChecklist(checklistData.items || []);
      setIsSchoolDay(checklistData.isSchoolDay);
      setHasPlannerPhoto(checklistData.hasPlannerPhoto);
      setSchedule(scheduleData.slots || []);
      setAssignmentsDue(assignmentsData.assignments || []);
      // Filter to assignments matching the Homework wrapper rules
      const allHw: Assignment[] = homeworkData.assignments || [];
      const todayDate = new Date(today + "T00:00:00");
      let nextSchool = new Date(todayDate);
      nextSchool.setDate(nextSchool.getDate() + 1);
      while (nextSchool.getDay() === 0 || nextSchool.getDay() === 6) {
        nextSchool.setDate(nextSchool.getDate() + 1);
      }
      const nextSchoolStr = nextSchool.toISOString().split("T")[0];
      setHomeworkAssignments(
        allHw.filter((a) => {
          if (a.isProject) return true; // any pending project in window
          return a.dueDate === today || a.dueDate === nextSchoolStr;
        })
      );
      setMissingItems(missingData.items || []);
      setStudyProgress(
        (studyProgressData.tests || []).filter(
          (t: StudyProgressTest) =>
            (t.testStatus === "upcoming" || t.testStatus === "taken") &&
            daysUntil(t.testDate) >= 0
        )
      );

      const allTests = testsData.tests || [];
      setUpcomingTests(
        allTests.filter(
          (t: Test) => t.status === "upcoming" && daysUntil(t.testDate) <= 7 && daysUntil(t.testDate) >= 0
        )
      );
      setOverdueTests(
        allTests.filter(
          (t: Test) =>
            t.status === "taken" &&
            t.expectedReturnDate &&
            daysSince(t.expectedReturnDate) > 0
        )
      );
      setPendingCorrections(
        allTests.filter((t: Test) => t.correctionStatus === "pending")
      );
      setPendingVerification(
        (checklistData.items || []).filter(
          (item: ChecklistItem) =>
            item.completed && item.requiresParent && !item.verifiedBy
        )
      );
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleAddBook() {
    if (!newBookTitle.trim() || !newBookDueDate) return;
    setSavingBook(true);
    try {
      await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newBookTitle.trim(),
          author: newBookAuthor.trim() || null,
          dueDate: newBookDueDate,
        }),
      });
      setNewBookTitle("");
      setNewBookAuthor("");
      setNewBookDueDate("");
      setShowAddBook(false);
    } catch (err) {
      console.error("Failed to add book:", err);
    }
    setSavingBook(false);
    loadData();
  }

  async function handleRecordBookScore(bookId: number) {
    const scoreStr = bookScoreInputs[bookId];
    if (!scoreStr) return;
    const score = Number(scoreStr);
    if (isNaN(score) || score < 0 || score > 100) return;
    await fetch("/api/books", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bookId, action: "record_score", testScore: score }),
    });
    setBookScoreInputs((prev) => {
      const next = { ...prev };
      delete next[bookId];
      return next;
    });
    loadData();
  }

  async function handleChecklistToggle(itemId: number) {
    await fetch("/api/checklist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, action: "complete" }),
    });
    loadData();
  }

  async function handleAddPhoto(itemId: number, file: File) {
    const formData = new FormData();
    formData.append("itemId", itemId.toString());
    formData.append("action", "add_photos");
    formData.append("photos", file);
    await fetch("/api/checklist", { method: "PATCH", body: formData });
    await loadData();
  }

  async function handleCompleteHomework(itemId: number) {
    const res = await fetch("/api/checklist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, action: "complete" }),
    });
    const data = await res.json();
    await loadData();
    if (data.needsConfirmation) {
      return { needsConfirmation: true, aiHomeworkEval: data.aiHomeworkEval };
    }
    return null;
  }

  async function handleConfirmComplete(itemId: number) {
    await fetch("/api/checklist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, action: "confirm_complete" }),
    });
    loadData();
  }

  async function handleReadingNotes(itemId: number, notes: string) {
    await fetch("/api/checklist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, action: "complete", notes }),
    });
    loadData();
  }

  async function handleVerify(itemId: number) {
    await fetch("/api/checklist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, action: "verify" }),
    });
    loadData();
  }

  async function handlePlannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("photo", file);
    formData.append("date", today);

    const res = await fetch("/api/planner", { method: "POST", body: formData });
    const data = await res.json();
    setUploading(false);
    await loadData();

    // Show extraction review if AI found items
    if (data.extraction) {
      setPlannerExtraction(data.extraction);
    }
  }

  async function handlePlannerConfirm(assignments: PlannerAssignment[], tests: PlannerTest[]) {
    await fetch("/api/planner/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments, tests }),
    });
    setPlannerExtraction(null);
    loadData(); // reload to show new assignments/tests
  }

  async function handleManualPlannerEntry() {
    // Create a planner record without a photo so hasPlannerPhoto becomes true
    await fetch("/api/planner/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today }),
    });
    await loadData();
    // Show manual entry form via PlannerReview with empty extraction
    setPlannerExtraction({ assignments: [], tests: [], rawNotes: "" });
  }

  // Compute these before any early returns so hooks are always called
  const completedCount = checklist.filter((i) => i.completed).length;
  const totalCount = checklist.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const hasChecklist = totalCount > 0;

  useEffect(() => {
    if (
      completionPct === 100 &&
      prevCompletionRef.current < 100 &&
      totalCount > 0 &&
      !loading &&
      session?.role === "student"
    ) {
      setShowCelebration(true);
    }
    prevCompletionRef.current = completionPct;
  }, [completionPct, totalCount, loading, session?.role]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  // ── Parent View ──────────────────────────────────────────────────────────
  if (session?.role === "parent") {
    // Build unified action items
    const actionItems: Array<{ type: string; priority: number; node: React.ReactNode }> = [];

    // Overdue test returns (highest priority)
    for (const test of overdueTests) {
      actionItems.push({
        type: "overdue",
        priority: 0,
        node: (
          <div key={`overdue-${test.id}`} className="p-3 bg-red-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: test.subjectColor }} />
                <div className="min-w-0">
                  <span className="text-sm font-medium text-red-900">{test.subjectName} {test.type}</span>
                  <span className="text-xs text-red-600 ml-2">— {daysSince(test.expectedReturnDate!)}d overdue</span>
                </div>
              </div>
              <span className="text-[10px] px-2 py-1 bg-red-100 text-red-700 rounded-full font-bold flex-shrink-0">OVERDUE</span>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={async () => {
                  await fetch("/api/tests", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: test.id }),
                  });
                  loadData();
                }}
                className="text-xs px-3 py-1.5 bg-white text-red-600 border border-red-200 rounded-lg font-medium hover:bg-red-50"
              >
                Delete — won&apos;t come in
              </button>
            </div>
          </div>
        ),
      });
    }

    // AI-flagged homework items
    const aiFlagged = checklist.filter(
      (i) => i.aiHomeworkEval && (i.aiHomeworkEval.missingAnswers || !i.aiHomeworkEval.appearsComplete)
    );
    for (const item of aiFlagged) {
      actionItems.push({
        type: "ai_flag",
        priority: 1,
        node: (
          <div key={`ai-${item.id}`} className="p-3 bg-amber-50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-amber-900">{item.title}</span>
              <span className="text-[10px] px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-bold">AI FLAG</span>
            </div>
            <p className="text-xs text-amber-700 mt-1">{item.aiHomeworkEval!.parentNote}</p>
            {item.studentConfirmedComplete && (
              <p className="text-[11px] text-amber-600 mt-1 font-medium">Jack confirmed complete despite warning</p>
            )}
          </div>
        ),
      });
    }

    // Homework awaiting graded return past expected date
    for (const a of overdueHomeworkReturns) {
      const expected = a.expectedReturnDate!;
      const daysOverdue = Math.floor((new Date(new Date().setHours(0, 0, 0, 0)).getTime() - new Date(expected + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24));
      actionItems.push({
        type: "hw_return_overdue",
        priority: 0,
        node: (
          <div key={`hw-overdue-${a.id}`} className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.subjectColor }} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-amber-900 truncate">
                    {a.subjectName}: {a.title}
                  </div>
                  <div className="text-xs text-amber-700">
                    Graded homework {daysOverdue}d past return date
                  </div>
                </div>
              </div>
              <span className="text-[10px] px-2 py-1 bg-amber-100 text-amber-800 rounded-full font-bold flex-shrink-0">LATE BACK</span>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => router.push("/homework")}
                className="text-xs px-3 py-1.5 bg-white text-amber-700 border border-amber-300 rounded-lg font-medium hover:bg-amber-100"
              >
                Upload Graded Version
              </button>
            </div>
          </div>
        ),
      });
    }

    // Failed (or unattempted) homework quizzes
    for (const a of failedQuizzes) {
      actionItems.push({
        type: "hw_quiz_pending",
        priority: 1,
        node: (
          <div key={`hw-quiz-${a.id}`} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.subjectColor }} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-blue-900 truncate">
                    Quiz pending: {a.subjectName} — {a.title}
                  </div>
                  <div className="text-xs text-blue-700">
                    Jack must score 90%+ on the homework quiz to clear his checklist.
                  </div>
                </div>
              </div>
            </div>
          </div>
        ),
      });
    }

    // Score correction requests (high priority — parent action required)
    for (const test of pendingCorrections) {
      const photos = (test.photoPaths && test.photoPaths.length > 0)
        ? test.photoPaths
        : test.photoPath ? [test.photoPath] : [];
      const isExpanded = expandedCorrection === test.id;
      actionItems.push({
        type: "correction",
        priority: 1,
        node: (
          <div key={`correction-${test.id}`} className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: test.subjectColor }} />
                <span className="text-sm font-medium text-amber-900 truncate">
                  {test.subjectName}: {test.title}
                </span>
              </div>
              <span className="text-[10px] px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-bold flex-shrink-0 ml-2">SCORE REVIEW</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white rounded px-2 py-1.5 border border-amber-200">
                <div className="text-[10px] text-gray-500 uppercase">AI read</div>
                <div className="font-semibold text-gray-800">
                  {test.scoreRaw ?? "?"}/{test.scoreTotal ?? "?"}
                  {test.letterGrade && ` (${test.letterGrade})`}
                </div>
              </div>
              <div className="bg-white rounded px-2 py-1.5 border border-amber-300">
                <div className="text-[10px] text-amber-700 uppercase">Jack says</div>
                <div className="font-semibold text-amber-900">
                  {test.studentProposedScoreRaw ?? "?"}/{test.studentProposedScoreTotal ?? "?"}
                  {test.studentProposedLetterGrade && ` (${test.studentProposedLetterGrade})`}
                </div>
              </div>
            </div>
            {test.correctionReason && (
              <p className="text-xs text-amber-800 mt-2 italic">&ldquo;{test.correctionReason}&rdquo;</p>
            )}
            {photos.length > 0 && (
              <button
                onClick={() => setExpandedCorrection(isExpanded ? null : test.id)}
                className="mt-2 text-xs text-amber-700 font-medium hover:text-amber-900 underline"
              >
                {isExpanded ? "Hide photos" : `View photos (${photos.length})`}
              </button>
            )}
            {isExpanded && photos.length > 0 && (
              <div className="mt-2 space-y-2">
                {photos.map((p, i) => (
                  <img
                    key={i}
                    src={p}
                    alt={`Graded test page ${i + 1}`}
                    className="w-full rounded border border-amber-200"
                  />
                ))}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={async () => {
                  await fetch("/api/tests", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: test.id, action: "review_correction", approved: true }),
                  });
                  loadData();
                }}
                className="flex-1 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
              >
                Approve Jack&apos;s Score
              </button>
              <button
                onClick={async () => {
                  await fetch("/api/tests", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: test.id, action: "review_correction", approved: false }),
                  });
                  loadData();
                }}
                className="flex-1 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
              >
                Keep AI Score
              </button>
            </div>
          </div>
        ),
      });
    }

    // Book test due (parent needs to give the test and enter a score)
    if (activeBook) {
      const due = new Date(activeBook.dueDate + "T00:00:00");
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const isDue = due.getTime() <= now.getTime();
      if (isDue) {
        const diffDays = Math.ceil((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        const scoreInput = bookScoreInputs[activeBook.id] || "";
        actionItems.push({
          type: "book_test",
          priority: 1,
          node: (
            <div key={`book-${activeBook.id}`} className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-indigo-900 truncate">
                    Book Test: {activeBook.title}
                  </div>
                  {activeBook.author && (
                    <div className="text-xs text-indigo-700 truncate">by {activeBook.author}</div>
                  )}
                </div>
                <span className="text-[10px] px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full font-bold flex-shrink-0 ml-2">
                  {diffDays === 0 ? "DUE TODAY" : `${diffDays}D OVERDUE`}
                </span>
              </div>
              <p className="text-xs text-indigo-700 mt-1">
                Give Jack a reading comprehension test, then enter his score.
              </p>
              <div className="mt-3 flex gap-2 items-center">
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Score"
                    value={scoreInput}
                    onChange={(e) =>
                      setBookScoreInputs((prev) => ({ ...prev, [activeBook.id]: e.target.value }))
                    }
                    className="w-20 px-2 py-1.5 border border-indigo-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <span className="text-sm text-indigo-700">%</span>
                </div>
                <button
                  onClick={() => handleRecordBookScore(activeBook.id)}
                  disabled={!scoreInput || isNaN(Number(scoreInput)) || Number(scoreInput) < 0 || Number(scoreInput) > 100}
                  className="flex-1 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save Score
                </button>
              </div>
              <p className="text-[10px] text-indigo-600 mt-1">70% or higher passes.</p>
            </div>
          ),
        });
      }
    }

    // Verification queue
    for (const item of pendingVerification) {
      actionItems.push({
        type: "verify",
        priority: 2,
        node: (
          <div key={`verify-${item.id}`} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <div className="flex-1 min-w-0">
              <span className="text-sm text-gray-800">{item.title}</span>
              <PhotoThumbnails photos={item.photoPaths || []} size="h-12 w-12" className="mt-1.5" />
            </div>
            <button
              onClick={() => handleVerify(item.id)}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex-shrink-0 ml-3"
            >
              Verify
            </button>
          </div>
        ),
      });
    }

    // Missing items from previous days (parent can waive)
    for (const item of missingItems) {
      const dateLabel = item.date
        ? new Date(item.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
        : "";
      actionItems.push({
        type: "missing",
        priority: 1,
        node: (
          <div key={`missing-${item.id}`} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-red-900">{item.title}</span>
              <span className="text-[11px] text-red-500 ml-2">{dateLabel}</span>
            </div>
            <button
              onClick={async () => {
                await fetch("/api/checklist", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ itemId: item.id, action: "waive" }),
                });
                loadData();
              }}
              className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 flex-shrink-0 ml-2"
            >
              Waive
            </button>
          </div>
        ),
      });
    }

    actionItems.sort((a, b) => a.priority - b.priority);
    const hasActions = actionItems.length > 0;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Parent Dashboard</h2>
            <p className="text-gray-500 text-sm">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          </div>
          {/* Progress ring */}
          {hasChecklist && (
            <div className="relative w-14 h-14">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#E5E7EB" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={completionPct >= 90 ? "#22C55E" : completionPct >= 50 ? "#EAB308" : "#EF4444"} strokeWidth="3" strokeDasharray={`${completionPct}, 100`} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold">{completionPct}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Planner Photo status */}
        {isSchoolDay && (
          <div className={`rounded-xl px-4 py-3 border ${hasPlannerPhoto ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-300"}`}>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${hasPlannerPhoto ? "text-green-700" : "text-yellow-700 font-medium"}`}>
                {hasPlannerPhoto ? "Planner photo uploaded" : "Planner photo not yet uploaded"}
              </span>
            </div>
          </div>
        )}

        {/* Unified Action Required */}
        {hasActions && (
          <div className="bg-white rounded-xl p-4 border-2 border-orange-200">
            <h3 className="font-bold text-gray-800 mb-3">
              Action Required ({actionItems.length})
            </h3>
            <div className="space-y-2">
              {actionItems.map((item, i) => (
                <div key={i}>{item.node}</div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Tests with Study Progress (parent view) */}
        {studyProgress.length > 0 && (
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">
              Test Prep Progress
            </h3>
            <div className="space-y-3">
              {studyProgress.map((test) => {
                const days = daysUntil(test.testDate);
                const pct = test.totalSessions > 0
                  ? Math.round((test.completedSessions / test.totalSessions) * 100)
                  : 0;
                return (
                  <div key={test.testId} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: test.subjectColor }} />
                        <span className="text-sm font-medium text-gray-800">{test.subjectName} {test.testType}</span>
                      </div>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        days <= 1 ? "bg-red-100 text-red-700" : days <= 3 ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                      }`}>
                        {days === 0 ? "TODAY" : days === 1 ? "Tomorrow" : `${days}d`}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 ml-4.5">
                      {test.testTitle} — {new Date(test.testDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </div>
                    {test.totalSessions > 0 && (
                      <div className="flex items-center gap-2 ml-4.5">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: pct >= 80 ? "#22C55E" : pct >= 40 ? "#EAB308" : "#EF4444",
                            }}
                          />
                        </div>
                        <span className="text-[11px] text-gray-400">{test.completedSessions}/{test.totalSessions}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Full Checklist View */}
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-3">Full Checklist</h3>
          <div className="space-y-2">
            {checklist.map((item) => (
              <div
                key={item.id}
                className={`p-2 rounded-lg ${
                  item.verifiedBy
                    ? "bg-green-50"
                    : item.completed
                      ? "bg-blue-50"
                      : "bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      item.verifiedBy
                        ? "border-green-500 bg-green-500"
                        : item.completed
                          ? "border-blue-500 bg-blue-500"
                          : "border-gray-300"
                    }`}
                  >
                    {(item.completed || item.verifiedBy) && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={`flex-1 text-sm ${item.completed ? "text-gray-500" : "text-gray-800"}`}>
                    {item.title}
                  </span>
                  {item.requiresParent && !item.verifiedBy && item.completed && (
                    <button
                      onClick={() => handleVerify(item.id)}
                      className="text-xs px-2 py-1 bg-blue-600 text-white rounded"
                    >
                      Verify
                    </button>
                  )}
                  {item.verifiedBy && (
                    <span className="text-xs text-green-600 font-medium">Verified</span>
                  )}
                </div>
                {/* Show proof submitted by Jack */}
                <PhotoThumbnails photos={item.photoPaths || []} size="h-28 w-28" className="mt-2 ml-8" />
                {/* AI homework evaluation alert for parent */}
                {item.aiHomeworkEval && (item.aiHomeworkEval.missingAnswers || !item.aiHomeworkEval.appearsComplete) && (
                  <div className="mt-2 ml-8 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs font-medium text-amber-800">AI Review:</p>
                    <p className="text-xs text-amber-700">{item.aiHomeworkEval.parentNote}</p>
                    {item.studentConfirmedComplete && (
                      <p className="text-xs text-amber-600 mt-1 font-medium">Jack confirmed this was complete despite the warning.</p>
                    )}
                  </div>
                )}
                {item.notes && item.title === "Reading / Memory Work" && (
                  <p className="mt-1 ml-8 text-xs text-gray-600 bg-white/50 rounded p-2">{item.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Student View ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {showCelebration && (
        <CelebrationOverlay onDismiss={() => setShowCelebration(false)} />
      )}

      {/* Header with date and progress ring */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Hey, Jack</h2>
          <p className="text-gray-500 text-sm">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
        {hasChecklist && (
          <div className="relative w-14 h-14">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#E5E7EB"
                strokeWidth="3"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke={completionPct >= 90 ? "#22C55E" : completionPct >= 50 ? "#EAB308" : "#EF4444"}
                strokeWidth="3"
                strokeDasharray={`${completionPct}, 100`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold">{completionPct}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Overdue Tests Alert */}
      {overdueTests.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3">
          <h3 className="font-bold text-red-800 text-sm mb-1">
            Missing Graded Work
          </h3>
          {overdueTests.map((test) => (
            <div key={test.id} className="text-red-700 text-sm py-0.5">
              <span className="font-medium">{test.subjectName} {test.type}</span>
              {" "}— {daysSince(test.testDate)} days ago, grade not submitted
            </div>
          ))}
        </div>
      )}

      {/* Step 1: Planner Photo (school days + Saturday for late Friday uploads) */}
      {(isSchoolDay || new Date().getDay() === 6) && (
      <div className={`rounded-xl p-4 border-2 ${
        hasPlannerPhoto
          ? "bg-green-50 border-green-200"
          : "bg-yellow-50 border-yellow-300 border-dashed"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            hasPlannerPhoto ? "bg-green-500 text-white" : "bg-yellow-500 text-white"
          }`}>
            {hasPlannerPhoto ? "✓" : "1"}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-800">Planner Photo</h3>
            <p className="text-sm text-gray-500">
              {hasPlannerPhoto ? "Uploaded — nice job!" : "Snap a photo of today's planner page"}
            </p>
          </div>
          {!hasPlannerPhoto && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 px-3 py-2 bg-yellow-600 text-white rounded-lg cursor-pointer hover:bg-yellow-700 transition-colors text-sm font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {uploading ? "..." : "Photo"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePlannerUpload}
                  disabled={uploading}
                />
              </label>
              <button
                onClick={handleManualPlannerEntry}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Type Instead
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Planner AI extraction review */}
      {plannerExtraction && (
        <PlannerReview
          extraction={plannerExtraction}
          onConfirm={handlePlannerConfirm}
          onDismiss={() => setPlannerExtraction(null)}
        />
      )}

      {/* Active book / add book prompt */}
      {activeBook ? (() => {
        const due = new Date(activeBook.dueDate + "T00:00:00");
        const now = new Date();
        const diffDays = Math.ceil((due.getTime() - now.setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
        const isPastDue = diffDays < 0;
        const isDueSoon = diffDays >= 0 && diffDays <= 3;
        return (
          <div className={`rounded-xl border-2 overflow-hidden ${
            isPastDue ? "bg-amber-50 border-amber-300" : isDueSoon ? "bg-yellow-50 border-yellow-300" : "bg-indigo-50 border-indigo-200"
          }`}>
            <div className="px-4 py-3 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                isPastDue ? "bg-amber-200" : isDueSoon ? "bg-yellow-200" : "bg-indigo-200"
              }`}>
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Currently Reading</div>
                <div className="font-semibold text-gray-900 truncate">{activeBook.title}</div>
                {activeBook.author && (
                  <div className="text-xs text-gray-600 truncate">by {activeBook.author}</div>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[10px] text-gray-500 uppercase">Test by</div>
                <div className={`text-sm font-bold ${
                  isPastDue ? "text-amber-700" : isDueSoon ? "text-yellow-700" : "text-indigo-700"
                }`}>
                  {new Date(activeBook.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
                <div className="text-[10px] text-gray-500">
                  {isPastDue ? `${Math.abs(diffDays)}d overdue` : diffDays === 0 ? "today" : `${diffDays}d left`}
                </div>
              </div>
            </div>
            {isPastDue && session?.role === "student" && (
              <div className="px-4 py-2 bg-amber-100 border-t border-amber-200 text-xs text-amber-800">
                Your book test is due — ask a parent to give you the test.
              </div>
            )}
          </div>
        );
      })() : session?.role === "student" && (
        <div className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 overflow-hidden">
          {!showAddBook ? (
            <button
              onClick={() => setShowAddBook(true)}
              className="w-full px-4 py-4 flex items-center gap-3 hover:bg-indigo-100 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-200 flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="font-semibold text-indigo-900">Pick your next book</div>
                <div className="text-xs text-indigo-700">What are you reading this quarter?</div>
              </div>
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          ) : (
            <div className="p-4 space-y-3">
              <h3 className="font-semibold text-indigo-900">Add your next book</h3>
              <input
                type="text"
                placeholder="Book title"
                value={newBookTitle}
                onChange={(e) => setNewBookTitle(e.target.value)}
                className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                autoFocus
              />
              <input
                type="text"
                placeholder="Author (optional)"
                value={newBookAuthor}
                onChange={(e) => setNewBookAuthor(e.target.value)}
                className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <div>
                <label className="block text-xs font-medium text-indigo-700 mb-1">Test by</label>
                <input
                  type="date"
                  value={newBookDueDate}
                  onChange={(e) => setNewBookDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddBook}
                  disabled={savingBook || !newBookTitle.trim() || !newBookDueDate}
                  className="flex-1 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingBook ? "Adding..." : "Start Reading"}
                </button>
                <button
                  onClick={() => { setShowAddBook(false); setNewBookTitle(""); setNewBookAuthor(""); setNewBookDueDate(""); }}
                  className="px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-100 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Missing items from previous days — uses full ChecklistRow so all gates apply */}
      {missingItems.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-red-200">
            <h3 className="font-bold text-red-800 text-sm">
              Missing from Previous Days ({missingItems.length})
            </h3>
            <p className="text-xs text-red-600 mt-0.5">
              These items still need to be completed and verified by a parent.
            </p>
          </div>
          <div className="divide-y divide-red-100">
            {(() => {
              // Group missing items by date for visual clarity
              let lastDate = "";
              return missingItems.map((item) => {
                const showDateHeader = item.date !== lastDate;
                lastDate = item.date || "";
                const dateLabel = item.date
                  ? new Date(item.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
                  : "";
                return (
                  <div key={item.id}>
                    {showDateHeader && (
                      <div className="px-4 pt-3 pb-1">
                        <span className="text-[11px] font-bold text-red-400 uppercase tracking-wide">{dateLabel}</span>
                      </div>
                    )}
                    <ChecklistRow
                      item={item}
                      hasPlannerPhoto={false}
                      homeworkAssignments={homeworkAssignments}
                      onToggle={handleChecklistToggle}
                      onAddPhoto={handleAddPhoto}
                      onCompleteHomework={handleCompleteHomework}
                      onConfirmComplete={handleConfirmComplete}
                      onReadingNotes={handleReadingNotes}
                      onReload={loadData}
                    />
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Step 2: Daily Quests */}
      {hasChecklist && (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            completionPct === 100 ? "bg-green-500 text-white" : "bg-blue-500 text-white"
          }`}>
            {completionPct === 100 ? "✓" : "2"}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-800">
              {completionPct === 100
                ? "All Quests Complete!"
                : isSchoolDay
                  ? "Daily Quests"
                  : "Weekend Quests"}
            </h3>
            <p className="text-xs text-gray-500">
              {completedCount} of {totalCount} {completionPct === 100 ? "done" : "remaining"}
            </p>
          </div>
          {/* HP-style progress bar */}
          <div className="w-20">
            <div className="bg-gray-200 rounded-sm h-2.5 border border-gray-300 overflow-hidden">
              <div
                className={`h-full rounded-sm transition-all ${completionPct === 100 ? "progress-bar-shine" : ""}`}
                style={{
                  width: `${completionPct}%`,
                  backgroundColor: completionPct >= 90 ? "#22C55E" : completionPct >= 50 ? "#EAB308" : "#EF4444",
                }}
              />
            </div>
            <div className="text-[9px] text-gray-400 text-right mt-0.5" style={{ fontFamily: "var(--font-pixel), monospace" }}>
              {completedCount}/{totalCount}
            </div>
          </div>
        </div>
        <div className="divide-y divide-gray-50">
          {checklist.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              hasPlannerPhoto={hasPlannerPhoto}
              homeworkAssignments={homeworkAssignments}
              onToggle={handleChecklistToggle}
              onAddPhoto={handleAddPhoto}
              onCompleteHomework={handleCompleteHomework}
              onConfirmComplete={handleConfirmComplete}
              onReadingNotes={handleReadingNotes}
              onReload={loadData}
            />
          ))}
        </div>
      </div>
      )}

      {/* Upcoming Tests with Study Plan */}
      {studyProgress.length > 0 && (
        <div className="space-y-3">
          {studyProgress.map((test) => {
            const days = daysUntil(test.testDate);
            const pct = test.totalSessions > 0
              ? Math.round((test.completedSessions / test.totalSessions) * 100)
              : 0;
            const techniqueLabels: Record<string, string> = {
              review: "Review Notes",
              active_recall: "Active Recall",
              practice_test: "Practice Test",
              spaced_review: "Final Review",
              elaboration: "Deep Dive",
              interleaving: "Mixed Practice",
            };
            const isToday = test.nextSession?.sessionDate === today;
            const sessionDay = test.nextSession
              ? new Date(test.nextSession.sessionDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })
              : null;

            return (
              <div key={test.testId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: test.subjectColor }}
                    />
                    <span className="text-sm text-gray-800 font-medium">{test.subjectName} {test.testType}</span>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      days <= 1
                        ? "bg-red-100 text-red-700"
                        : days <= 3
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {days === 0 ? "TODAY" : days === 1 ? "Tomorrow" : `${days} days`}
                  </span>
                </div>

                {/* Test title + date */}
                <div className="px-4 -mt-1 pb-2">
                  <p className="text-xs text-gray-500">
                    {test.testTitle} — {new Date(test.testDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                </div>

                {/* Study progress bar */}
                {test.totalSessions > 0 && (
                  <div className="px-4 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: pct >= 80 ? "#22C55E" : pct >= 40 ? "#EAB308" : "#8B5CF6",
                          }}
                        />
                      </div>
                      <span className="text-[11px] text-gray-400 flex-shrink-0">
                        {test.completedSessions}/{test.totalSessions} studied
                      </span>
                    </div>
                  </div>
                )}

                {/* Study materials prompt — always show for upcoming tests */}
                {test.testStatus === "upcoming" && (
                  <button
                    onClick={() => router.push(`/tests/${test.testId}`)}
                    className={`w-full px-4 py-2.5 border-t flex items-center gap-2 text-left transition-colors ${
                      test.materialCount === 0
                        ? "border-amber-100 bg-amber-50 hover:bg-amber-100"
                        : "border-green-100 bg-green-50/50 hover:bg-green-50"
                    }`}
                  >
                    <svg className={`w-4 h-4 flex-shrink-0 ${test.materialCount === 0 ? "text-amber-600" : "text-green-600"}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className={`text-xs font-medium ${test.materialCount === 0 ? "text-amber-800" : "text-green-700"}`}>
                      {test.materialCount === 0
                        ? "Upload study materials to get an AI study guide"
                        : `${test.materialCount} photo${test.materialCount !== 1 ? "s" : ""} uploaded — tap to add more`}
                    </span>
                    <svg className={`w-3.5 h-3.5 flex-shrink-0 ml-auto ${test.materialCount === 0 ? "text-amber-400" : "text-green-400"}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}

                {/* Next study session — always show if one exists */}
                {test.nextSession && (
                  <div className={`px-4 py-3 border-t ${isToday ? "bg-purple-50 border-purple-100" : "bg-gray-50 border-gray-100"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isToday ? "bg-purple-200 text-purple-800" : "bg-gray-200 text-gray-600"
                      }`}>
                        {isToday ? "STUDY TODAY" : `STUDY ${sessionDay?.toUpperCase()}`}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        isToday ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {techniqueLabels[test.nextSession.technique] || test.nextSession.technique}
                      </span>
                      <span className="text-[10px] text-gray-400">{test.nextSession.durationMin} min</span>
                    </div>
                    <p className={`text-sm font-medium ${isToday ? "text-purple-900" : "text-gray-700"}`}>
                      {test.nextSession.title}
                    </p>
                    {test.nextSession.description && (
                      <p className={`text-xs mt-1 leading-relaxed ${isToday ? "text-purple-700" : "text-gray-500"}`}>
                        {test.nextSession.description}
                      </p>
                    )}
                  </div>
                )}

                {/* All done */}
                {test.totalSessions > 0 && !test.nextSession && (
                  <div className="px-4 py-2 border-t border-green-100 bg-green-50">
                    <p className="text-xs text-green-700 font-medium">All study sessions complete!</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
}

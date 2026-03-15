"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import AppShell, { useSession } from "@/components/ui/AppShell";
import Lightbox from "@/components/ui/Lightbox";
import CelebrationOverlay from "@/components/ui/CelebrationOverlay";

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
  orderIndex: number;
  notes: string | null;
  photoPaths: string[] | null;
  aiHomeworkEval: AiHomeworkEval | null;
  studentConfirmedComplete: boolean;
  studyContext?: StudyContext;
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
  dueDate: string;
  status: string;
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
  photoPath: string | null;
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

function ChecklistRow({
  item,
  hasPlannerPhoto,
  onToggle,
  onAddPhoto,
  onCompleteHomework,
  onConfirmComplete,
  onReadingNotes,
}: {
  item: ChecklistItem;
  hasPlannerPhoto: boolean;
  onToggle: (id: number) => void;
  onAddPhoto: (id: number, file: File) => Promise<void>;
  onCompleteHomework: (id: number) => Promise<{ needsConfirmation?: boolean; aiHomeworkEval?: AiHomeworkEval } | null>;
  onConfirmComplete: (id: number) => void;
  onReadingNotes: (id: number, notes: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [readingText, setReadingText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiWarning, setAiWarning] = useState<AiHomeworkEval | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isHomework = item.title === "Homework";
  const isReading = item.title === "Reading / Memory Work";
  const needsProof = isHomework || isReading;
  const isBlocked = item.title === "Organization" && !hasPlannerPhoto;

  // Show AI warning state (photos uploaded but AI flagged issues, not yet completed)
  const hasPendingAiWarning = isHomework && !item.completed && item.aiHomeworkEval &&
    (item.aiHomeworkEval.missingAnswers || !item.aiHomeworkEval.appearsComplete || !item.aiHomeworkEval.looksLikeHomework);

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

  // Not completed — handle different item types
  if (needsProof && !expanded && !hasPendingAiWarning) {
    return (
      <button
        onClick={() => setExpanded(true)}
        disabled={isBlocked}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          isBlocked ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50 cursor-pointer active:bg-gray-100"
        }`}
      >
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
        <span className="flex-1 text-sm text-gray-800">{item.title}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">
          {isHomework
            ? (item.photoPaths?.length ? `${item.photoPaths.length} photo${item.photoPaths.length > 1 ? "s" : ""}` : "Photo")
            : "Write"}
        </span>
      </button>
    );
  }

  // AI Warning state — show warning and confirm button
  if (hasPendingAiWarning) {
    const eval_ = item.aiHomeworkEval!;
    return (
      <div className="px-4 py-3 space-y-2 bg-amber-50/50">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-amber-400 flex-shrink-0 flex items-center justify-center">
            <span className="text-amber-500 text-xs font-bold">!</span>
          </div>
          <span className="flex-1 text-sm font-medium text-gray-800">{item.title}</span>
        </div>
        <div className="ml-8 p-3 bg-amber-100 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-900 font-medium mb-1">
            {!eval_.looksLikeHomework
              ? "This doesn't look like homework."
              : eval_.missingAnswers
                ? "It looks like some answers might be missing."
                : "The homework may not be fully complete."}
          </p>
          <p className="text-xs text-amber-800">{eval_.feedback}</p>
          <p className="text-xs text-amber-700 mt-1">
            Estimated completion: {eval_.estimatedCompletionPct}%
          </p>
        </div>
        <PhotoThumbnails photos={item.photoPaths || []} size="h-16 w-16" className="ml-8" />
        <div className="ml-8 flex gap-2">
          <button
            onClick={() => setExpanded(true)}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
          >
            Add More Photos
          </button>
          <button
            onClick={() => {
              onConfirmComplete(item.id);
            }}
            className="px-3 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
          >
            I Finished Everything
          </button>
        </div>
      </div>
    );
  }

  if (isHomework && expanded) {
    const photos = item.photoPaths || [];
    return (
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
          <span className="flex-1 text-sm font-medium text-gray-800">{item.title}</span>
          <button onClick={() => setExpanded(false)} className="text-xs text-gray-400">Cancel</button>
        </div>
        <p className="text-xs text-gray-500 ml-8">
          {photos.length === 0
            ? "Take a photo of your completed homework."
            : `${photos.length} photo${photos.length > 1 ? "s" : ""} uploaded. Add more or tap Done.`}
        </p>
        {/* Thumbnails of uploaded photos */}
        <PhotoThumbnails photos={photos} size="h-20 w-20" className="ml-8" />
        {/* AI warning from a previous attempt */}
        {aiWarning && (
          <div className="ml-8 p-2 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800 font-medium">{aiWarning.feedback}</p>
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
            setUploading(true);
            await onAddPhoto(item.id, file);
            setUploading(false);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
        <div className="ml-8 flex gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {uploading ? "Uploading..." : photos.length > 0 ? "Add Photo" : "Take Photo"}
          </button>
          {photos.length > 0 && (
            <button
              onClick={async () => {
                setSubmitting(true);
                const result = await onCompleteHomework(item.id);
                setSubmitting(false);
                if (result?.needsConfirmation && result.aiHomeworkEval) {
                  setAiWarning(result.aiHomeworkEval);
                  // Don't collapse — the parent will re-render with hasPendingAiWarning
                } else {
                  setExpanded(false);
                }
              }}
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Checking..." : "Done"}
            </button>
          )}
        </div>
      </div>
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

  if (totalItems === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-semibold text-blue-800 text-sm mb-1">Planner Read</h3>
        <p className="text-sm text-blue-700">
          {extraction.rawNotes
            ? "AI couldn't find any assignments or tests in your planner today."
            : "Couldn't read the planner photo. Make sure it's clear and well-lit."}
        </p>
        <button
          onClick={onDismiss}
          className="mt-2 text-xs text-blue-600 font-medium"
        >
          OK
        </button>
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
  const [pendingVerification, setPendingVerification] = useState<ChecklistItem[]>([]);
  const [hasPlannerPhoto, setHasPlannerPhoto] = useState(false);
  const [isSchoolDay, setIsSchoolDay] = useState(true);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [plannerExtraction, setPlannerExtraction] = useState<PlannerExtraction | null>(null);
  const [studyProgress, setStudyProgress] = useState<StudyProgressTest[]>([]);
  const [showCelebration, setShowCelebration] = useState(false);
  const prevCompletionRef = useRef(0);

  const today = new Date().toISOString().split("T")[0];

  const loadData = useCallback(async () => {
    try {
      const [checklistRes, scheduleRes, assignmentsRes, testsRes, studyProgressRes] =
        await Promise.all([
          fetch(`/api/checklist?date=${today}`),
          fetch(`/api/schedule?date=${today}`),
          fetch(`/api/assignments?status=pending&from=${today}&to=${today}`),
          fetch(`/api/tests`),
          fetch(`/api/study-progress`),
        ]);

      const checklistData = await checklistRes.json();
      const scheduleData = await scheduleRes.json();
      const assignmentsData = await assignmentsRes.json();
      const testsData = await testsRes.json();
      const studyProgressData = await studyProgressRes.json();

      setChecklist(checklistData.items || []);
      setIsSchoolDay(checklistData.isSchoolDay);
      setHasPlannerPhoto(checklistData.hasPlannerPhoto);
      setSchedule(scheduleData.slots || []);
      setAssignmentsDue(assignmentsData.assignments || []);
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

  // Compute these before any early returns so hooks are always called
  const completedCount = checklist.filter((i) => i.completed).length;
  const totalCount = checklist.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const hasChecklist = totalCount > 0;

  // Trigger celebration when all items completed
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
          <div key={`overdue-${test.id}`} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: test.subjectColor }} />
              <div>
                <span className="text-sm font-medium text-red-900">{test.subjectName} {test.type}</span>
                <span className="text-xs text-red-600 ml-2">— {daysSince(test.expectedReturnDate!)}d overdue</span>
              </div>
            </div>
            <span className="text-[10px] px-2 py-1 bg-red-100 text-red-700 rounded-full font-bold">OVERDUE</span>
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
                    <div className="text-xs text-gray-500 ml-4.5">{test.testTitle}</div>
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
      {/* Celebration overlay */}
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
          <div className={`relative w-14 h-14 ${completionPct === 100 ? "animate-pixel-bounce" : ""}`}>
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
              {completionPct === 100 ? (
                <span className="text-lg" role="img" aria-label="star">&#11088;</span>
              ) : (
                <span className="text-xs font-bold">{completionPct}%</span>
              )}
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
              onToggle={handleChecklistToggle}
              onAddPhoto={handleAddPhoto}
              onCompleteHomework={handleCompleteHomework}
              onConfirmComplete={handleConfirmComplete}
              onReadingNotes={handleReadingNotes}
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

                {/* Test title */}
                <div className="px-4 -mt-1 pb-2">
                  <p className="text-xs text-gray-500">{test.testTitle}</p>
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

      {/* Assignments Due Today */}
      {assignmentsDue.length > 0 && (
        <button
          onClick={() => router.push("/assignments")}
          className="w-full bg-white rounded-xl p-4 border border-gray-200 text-left"
        >
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-2">
            Due Today
          </h3>
          <div className="space-y-2">
            {assignmentsDue.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: a.subjectColor }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">{a.title}</div>
                  <div className="text-xs text-gray-500">{a.subjectName}</div>
                </div>
                {a.status === "pending" && (
                  <span className="text-xs text-blue-600 font-medium flex-shrink-0">To do</span>
                )}
                {a.status === "completed" && (
                  <span className="text-xs text-blue-500 flex-shrink-0">Done</span>
                )}
                {a.status === "verified" && (
                  <span className="text-xs text-green-600 font-medium flex-shrink-0">Verified</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-blue-600 font-medium mt-2 text-center">View all assignments →</p>
        </button>
      )}

      {/* Today's Schedule */}
      {schedule.length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-2">
            Today&apos;s Classes
          </h3>
          <div className="space-y-1.5">
            {schedule.map((slot, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="w-1 h-6 rounded-full"
                  style={{ backgroundColor: slot.subjectColor }}
                />
                <span className="flex-1 text-sm text-gray-700">{slot.subjectName}</span>
                <span className="text-xs text-gray-400">
                  {formatTime(slot.startTime)}-{formatTime(slot.endTime)}
                </span>
              </div>
            ))}
          </div>
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

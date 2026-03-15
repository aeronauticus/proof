"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import AppShell, { useSession } from "@/components/ui/AppShell";

interface ChecklistItem {
  id: number;
  title: string;
  completed: boolean;
  completedAt: string | null;
  verifiedBy: number | null;
  verifiedAt: string | null;
  requiresParent: boolean;
  subjectId: number | null;
  orderIndex: number;
  notes: string | null;
  photoPath: string | null;
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

function ChecklistRow({
  item,
  hasPlannerPhoto,
  onToggle,
  onHomeworkPhoto,
  onReadingNotes,
}: {
  item: ChecklistItem;
  hasPlannerPhoto: boolean;
  onToggle: (id: number) => void;
  onHomeworkPhoto: (id: number, file: File) => void;
  onReadingNotes: (id: number, notes: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [readingText, setReadingText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isHomework = item.title === "Homework";
  const isReading = item.title === "Reading / Memory Work";
  const needsProof = isHomework || isReading;
  const isBlocked = item.title === "Organization" && !hasPlannerPhoto;

  // Completed items — show proof if it exists
  if (item.completed) {
    return (
      <div className={`px-4 py-3 ${item.verifiedBy ? "bg-green-50/50" : ""}`}>
        <div className="flex items-center gap-3">
          <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
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
        {item.photoPath && (
          <img src={item.photoPath} alt="Homework" className="mt-2 rounded-lg border border-gray-200 max-h-32 object-cover" />
        )}
        {item.notes && isReading && (
          <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">{item.notes}</p>
        )}
      </div>
    );
  }

  // Not completed — handle different item types
  if (needsProof && !expanded) {
    // Show as tappable row that expands
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
          {isHomework ? "Photo" : "Write"}
        </span>
      </button>
    );
  }

  if (isHomework && expanded) {
    return (
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
          <span className="flex-1 text-sm font-medium text-gray-800">{item.title}</span>
          <button onClick={() => setExpanded(false)} className="text-xs text-gray-400">Cancel</button>
        </div>
        <p className="text-xs text-gray-500 ml-8">Take a photo of your completed homework.</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setSubmitting(true);
            await onHomeworkPhoto(item.id, file);
            setSubmitting(false);
            setExpanded(false);
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={submitting}
          className="ml-8 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {submitting ? "Uploading..." : "Take Photo"}
        </button>
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

  // Default: simple toggle items (Organization, End-of-Day, Review Notes, Study sessions)
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

function DashboardContent() {
  const session = useSession();
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

  const today = new Date().toISOString().split("T")[0];

  const loadData = useCallback(async () => {
    try {
      const [checklistRes, scheduleRes, assignmentsRes, testsRes] =
        await Promise.all([
          fetch(`/api/checklist?date=${today}`),
          fetch(`/api/schedule?date=${today}`),
          fetch(`/api/assignments?status=pending&from=${today}&to=${today}`),
          fetch(`/api/tests`),
        ]);

      const checklistData = await checklistRes.json();
      const scheduleData = await scheduleRes.json();
      const assignmentsData = await assignmentsRes.json();
      const testsData = await testsRes.json();

      setChecklist(checklistData.items || []);
      setIsSchoolDay(checklistData.isSchoolDay);
      setHasPlannerPhoto(checklistData.hasPlannerPhoto);
      setSchedule(scheduleData.slots || []);
      setAssignmentsDue(assignmentsData.assignments || []);

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

  async function handleHomeworkPhoto(itemId: number, file: File) {
    const formData = new FormData();
    formData.append("itemId", itemId.toString());
    formData.append("action", "complete");
    formData.append("photo", file);
    await fetch("/api/checklist", { method: "PATCH", body: formData });
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

    await fetch("/api/planner", { method: "POST", body: formData });
    setUploading(false);
    loadData();
  }

  async function handleCompleteAssignment(id: number) {
    await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "complete" }),
    });
    loadData();
  }

  async function handleVerifyAssignment(id: number) {
    await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "verify" }),
    });
    loadData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  const completedCount = checklist.filter((i) => i.completed).length;
  const totalCount = checklist.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const hasChecklist = totalCount > 0;

  // ── Parent View ──────────────────────────────────────────────────────────
  if (session?.role === "parent") {
    const testsNeedingReview = upcomingTests.filter(
      (t) => t.status === "returned" && !t.photoPath
    );

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Parent Dashboard</h2>
          <p className="text-gray-500 text-sm">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>

        {/* Overdue Tests Alert */}
        {overdueTests.length > 0 && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
            <h3 className="font-bold text-red-800 mb-2">
              Overdue Test Returns
            </h3>
            {overdueTests.map((test) => (
              <div key={test.id} className="flex items-center justify-between py-2">
                <div>
                  <span
                    className="inline-block w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: test.subjectColor }}
                  />
                  <span className="font-medium text-red-900">
                    {test.subjectName} {test.type}
                  </span>
                  <span className="text-red-600 text-sm ml-2">
                    — {daysSince(test.expectedReturnDate!)} days overdue
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Planner Photo */}
        <div className={`rounded-xl p-4 border-2 ${hasPlannerPhoto ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-600 mb-1">
            Planner Photo
          </h3>
          {hasPlannerPhoto ? (
            <p className="text-green-700">Uploaded today</p>
          ) : (
            <p className="text-yellow-700 font-medium">Not yet uploaded</p>
          )}
        </div>

        {/* Today's Progress */}
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-3">Today&apos;s Progress</h3>
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
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
              <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                {completionPct}%
              </div>
            </div>
            <div>
              <div className="text-lg font-semibold">{completedCount} / {totalCount}</div>
              <div className="text-sm text-gray-500">checklist items done</div>
            </div>
          </div>
        </div>

        {/* Verification Queue */}
        {pendingVerification.length > 0 && (
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <h3 className="font-semibold text-gray-800 mb-3">
              Needs Verification ({pendingVerification.length})
            </h3>
            <div className="space-y-2">
              {pendingVerification.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-blue-50 rounded-lg"
                >
                  <span className="text-gray-800">{item.title}</span>
                  <button
                    onClick={() => handleVerify(item.id)}
                    className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                  >
                    Verify
                  </button>
                </div>
              ))}
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
                {item.photoPath && (
                  <img src={item.photoPath} alt="Homework proof" className="mt-2 ml-8 rounded-lg border border-gray-200 max-h-40 object-cover" />
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

      {/* Overdue Tests Alert — always at top */}
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

      {/* ═══ STEP 1: Planner Photo (school days only) ═══ */}
      {isSchoolDay && (
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

      {/* ═══ STEP 2: Daily Checklist (every day — shorter on weekends) ═══ */}
      {hasChecklist && (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            completionPct === 100 ? "bg-green-500 text-white" : "bg-blue-500 text-white"
          }`}>
            {completionPct === 100 ? "✓" : isSchoolDay ? "2" : "1"}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-800">{isSchoolDay ? "Daily Checklist" : "Weekend Checklist"}</h3>
            <p className="text-xs text-gray-500">{completedCount} of {totalCount} done</p>
          </div>
          <div className="w-16 bg-gray-200 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full transition-all"
              style={{
                width: `${completionPct}%`,
                backgroundColor: completionPct >= 90 ? "#22C55E" : completionPct >= 50 ? "#EAB308" : "#EF4444",
              }}
            />
          </div>
        </div>
        <div className="divide-y divide-gray-50">
          {checklist.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              hasPlannerPhoto={hasPlannerPhoto}
              onToggle={handleChecklistToggle}
              onHomeworkPhoto={handleHomeworkPhoto}
              onReadingNotes={handleReadingNotes}
            />
          ))}
        </div>
      </div>
      )}

      {/* Upcoming Tests */}
      {upcomingTests.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <h3 className="font-semibold text-amber-800 text-sm mb-2">
            Upcoming Tests
          </h3>
          {upcomingTests.map((test) => {
            const days = daysUntil(test.testDate);
            return (
              <div key={test.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: test.subjectColor }}
                  />
                  <span className="text-sm text-gray-800 font-medium">{test.title}</span>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    days <= 1
                      ? "bg-red-100 text-red-700"
                      : days <= 3
                        ? "bg-amber-100 text-amber-700"
                        : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {days === 0 ? "TODAY" : days === 1 ? "Tomorrow" : `${days}d`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Assignments Due Today */}
      {assignmentsDue.length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-2">
            Due Today
          </h3>
          <div className="space-y-2">
            {assignmentsDue.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: a.subjectColor }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{a.title}</div>
                  <div className="text-xs text-gray-500">{a.subjectName}</div>
                </div>
                {a.status === "pending" && session?.role === "student" && (
                  <button
                    onClick={() => handleCompleteAssignment(a.id)}
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded-lg flex-shrink-0"
                  >
                    Done
                  </button>
                )}
                {a.status === "completed" && session?.role === "parent" && (
                  <button
                    onClick={() => handleVerifyAssignment(a.id)}
                    className="text-xs px-3 py-1 bg-green-600 text-white rounded-lg flex-shrink-0"
                  >
                    Verify
                  </button>
                )}
                {a.status === "verified" && (
                  <span className="text-xs text-green-600 font-medium">Verified</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Schedule (collapsed, less prominent) */}
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

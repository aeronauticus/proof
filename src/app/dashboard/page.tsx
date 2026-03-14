"use client";

import { useState, useEffect, useCallback } from "react";
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

  if (!isSchoolDay) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">&#127881;</div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">No School Today</h2>
        <p className="text-gray-500">Enjoy your day off!</p>
      </div>
    );
  }

  const completedCount = checklist.filter((i) => i.completed).length;
  const totalCount = checklist.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

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
                className={`flex items-center gap-3 p-2 rounded-lg ${
                  item.verifiedBy
                    ? "bg-green-50"
                    : item.completed
                      ? "bg-blue-50"
                      : "bg-gray-50"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
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
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Student View ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header with date and progress */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Hey, Jack</h2>
        <p className="text-gray-500 text-sm">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Progress Ring */}
      <div className="flex items-center justify-center gap-4">
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
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
            <span className="text-lg font-bold">{completionPct}%</span>
          </div>
        </div>
        <div>
          <div className="text-lg font-semibold">{completedCount} / {totalCount}</div>
          <div className="text-sm text-gray-500">done today</div>
        </div>
      </div>

      {/* Overdue Tests Alert */}
      {overdueTests.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 animate-pulse">
          <h3 className="font-bold text-red-800 text-sm uppercase tracking-wide mb-2">
            Missing Graded Work
          </h3>
          {overdueTests.map((test) => (
            <div key={test.id} className="text-red-700 text-sm py-1">
              <span className="font-medium">{test.subjectName} {test.type}</span>
              {" "}— taken {daysSince(test.testDate)} days ago, grade not submitted
            </div>
          ))}
        </div>
      )}

      {/* Upcoming Tests */}
      {upcomingTests.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="font-semibold text-amber-800 text-sm uppercase tracking-wide mb-2">
            Upcoming Tests
          </h3>
          {upcomingTests.map((test) => {
            const days = daysUntil(test.testDate);
            return (
              <div key={test.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: test.subjectColor }}
                  />
                  <span className="text-gray-800 font-medium">{test.title}</span>
                </div>
                <span
                  className={`text-sm font-bold px-2 py-0.5 rounded-full ${
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
            );
          })}
        </div>
      )}

      {/* Today's Schedule */}
      {schedule.length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">
            Today&apos;s Classes
          </h3>
          <div className="space-y-2">
            {schedule.map((slot, i) => (
              <div key={i} className="flex items-center gap-3">
                <span
                  className="w-1 h-8 rounded-full"
                  style={{ backgroundColor: slot.subjectColor }}
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-800">
                    {slot.subjectName}
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Planner Photo Upload */}
      {!hasPlannerPhoto && (
        <div className="bg-yellow-50 border-2 border-yellow-300 border-dashed rounded-xl p-4">
          <h3 className="font-semibold text-yellow-800 mb-2">
            Upload Planner Photo
          </h3>
          <p className="text-yellow-700 text-sm mb-3">
            Take a photo of today&apos;s planner page to get started.
          </p>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg cursor-pointer hover:bg-yellow-700 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {uploading ? "Uploading..." : "Take Photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePlannerUpload}
              disabled={uploading}
            />
          </label>
        </div>
      )}

      {/* Daily Checklist */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">
          Daily Checklist
        </h3>
        <div className="space-y-1">
          {checklist.map((item) => {
            const isBlocked =
              item.title === "Organization" && !hasPlannerPhoto;

            return (
              <button
                key={item.id}
                onClick={() => !item.completed && !isBlocked && handleChecklistToggle(item.id)}
                disabled={item.completed || isBlocked}
                className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                  item.verifiedBy
                    ? "bg-green-50"
                    : item.completed
                      ? "bg-blue-50"
                      : isBlocked
                        ? "bg-gray-50 opacity-50 cursor-not-allowed"
                        : "bg-gray-50 hover:bg-gray-100 cursor-pointer"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    item.verifiedBy
                      ? "border-green-500 bg-green-500"
                      : item.completed
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-300"
                  }`}
                >
                  {(item.completed || item.verifiedBy) && (
                    <svg
                      className="w-3.5 h-3.5 text-white"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
                <span
                  className={`flex-1 ${
                    item.completed
                      ? "text-gray-400 line-through"
                      : "text-gray-800"
                  }`}
                >
                  {item.title}
                </span>
                {item.requiresParent && (
                  <span className="text-xs text-gray-400">
                    {item.verifiedBy ? "Verified" : item.completed ? "Awaiting parent" : "Parent req."}
                  </span>
                )}
                {isBlocked && (
                  <span className="text-xs text-yellow-600 font-medium">
                    Upload planner first
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Assignments Due Today */}
      {assignmentsDue.length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">
            Assignments Due Today
          </h3>
          <div className="space-y-2">
            {assignmentsDue.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: a.subjectColor }}
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">
                    {a.title}
                  </div>
                  <div className="text-xs text-gray-500">{a.subjectName}</div>
                </div>
                {a.status === "pending" && session?.role === "student" && (
                  <button
                    onClick={() => handleCompleteAssignment(a.id)}
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded-lg"
                  >
                    Done
                  </button>
                )}
                {a.status === "completed" && session?.role === "parent" && (
                  <button
                    onClick={() => handleVerifyAssignment(a.id)}
                    className="text-xs px-3 py-1 bg-green-600 text-white rounded-lg"
                  >
                    Verify
                  </button>
                )}
                {a.status === "verified" && (
                  <span className="text-xs text-green-600 font-medium">
                    Verified
                  </span>
                )}
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

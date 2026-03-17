"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell, { useSession } from "@/components/ui/AppShell";
import { toLocalISODate } from "@/lib/date-utils";

interface NoteEntry {
  id: number;
  subjectId: number;
  subjectName: string;
  subjectColor: string;
  summaryEvaluation: string | null;
  quizScore: number | null;
  quizCompletedAt: string | null;
}

interface ScheduleSlot {
  subjectName: string;
  subjectColor: string;
}

function NotesContent() {
  const router = useRouter();
  const session = useSession();
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);

  const today = toLocalISODate(new Date());

  useEffect(() => {
    Promise.all([
      fetch(`/api/notes?date=${today}`).then((r) => r.json()),
      fetch(`/api/schedule?date=${today}`).then((r) => r.json()),
    ]).then(([notesData, scheduleData]) => {
      setNotes(notesData.notes || []);
      setSlots(scheduleData.slots || []);
      setLoading(false);
    });
  }, [today]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Get unique subjects from today's schedule, excluding Math
  const uniqueSubjects = new Map<string, string>();
  for (const slot of slots) {
    if (slot.subjectName !== "Math") {
      uniqueSubjects.set(slot.subjectName, slot.subjectColor);
    }
  }

  // Map of uploaded notes by subject name
  const uploadedBySubject = new Map(
    notes.map((n) => [n.subjectName, n])
  );

  const subjectList = Array.from(uniqueSubjects.entries()).map(
    ([name, color]) => ({
      name,
      color,
      note: uploadedBySubject.get(name) || null,
    })
  );

  const totalExpected = subjectList.length;
  const totalUploaded = subjectList.filter((s) => s.note).length;
  const totalQuizzed = subjectList.filter(
    (s) => s.note?.quizCompletedAt
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Daily Notes</h2>
        <span className="text-sm text-gray-500">
          {new Date().toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>

      {/* Progress summary */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600">Progress</span>
          <span className="text-sm text-gray-500">
            {totalUploaded}/{totalExpected} uploaded · {totalQuizzed}/
            {totalExpected} quizzed
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{
              width: `${totalExpected > 0 ? (totalQuizzed / totalExpected) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Weekend / no classes message */}
      {subjectList.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-400">
            No classes scheduled today that require notes review.
          </p>
        </div>
      )}

      {/* Subject cards */}
      <div className="space-y-3">
        {subjectList.map((s) => {
          const note = s.note;
          const isUploaded = !!note;
          const isQuizzed = !!note?.quizCompletedAt;

          let statusLabel: string;
          let statusColor: string;
          if (isQuizzed) {
            statusLabel = `Quiz: ${Math.round(note!.quizScore ?? 0)}%`;
            statusColor =
              (note!.quizScore ?? 0) >= 70
                ? "text-green-600"
                : "text-yellow-600";
          } else if (isUploaded) {
            statusLabel = "Take Quiz";
            statusColor = "text-blue-600";
          } else {
            statusLabel = "Upload Notes";
            statusColor = "text-gray-400";
          }

          const evalBadge =
            note?.summaryEvaluation === "adequate"
              ? { text: "Good", bg: "bg-green-100 text-green-700" }
              : note?.summaryEvaluation === "too_brief"
                ? { text: "Too Brief", bg: "bg-yellow-100 text-yellow-700" }
                : null;

          return (
            <button
              key={s.name}
              onClick={() =>
                router.push(
                  `/notes/${encodeURIComponent(s.name)}?date=${today}`
                )
              }
              className="w-full bg-white rounded-xl p-4 border border-gray-200 hover:border-blue-300 transition-all text-left flex items-center gap-4"
            >
              {/* Subject color dot */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: s.color }}
              >
                {s.name[0]}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{s.name}</span>
                  {evalBadge && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${evalBadge.bg}`}
                    >
                      {evalBadge.text}
                    </span>
                  )}
                </div>
                <span className={`text-sm font-medium ${statusColor}`}>
                  {statusLabel}
                </span>
              </div>

              {/* Status icon */}
              <div className="flex-shrink-0">
                {isQuizzed ? (
                  <svg
                    className="w-6 h-6 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : isUploaded ? (
                  <svg
                    className="w-6 h-6 text-blue-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-6 h-6 text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function NotesPage() {
  return (
    <AppShell>
      <NotesContent />
    </AppShell>
  );
}

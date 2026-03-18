"use client";

import { useState, useEffect } from "react";
import AppShell from "@/components/ui/AppShell";
import { toLocalISODate } from "@/lib/date-utils";

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
  title: string;
  testDate: string;
  type: string;
  status: string;
}

function CalendarContent() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = toLocalISODate(new Date());

  useEffect(() => {
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const to = `${year}-${String(month + 1).padStart(2, "0")}-${daysInMonth}`;
    Promise.all([
      fetch(`/api/assignments?from=${from}&to=${to}`).then((r) => r.json()),
      fetch("/api/tests").then((r) => r.json()),
    ]).then(([assignData, testData]) => {
      setAssignments(assignData.assignments || []);
      setTests(testData.tests || []);
    });
  }, [year, month, daysInMonth]);

  const monthName = currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const days: Array<{ day: number; dateStr: string }> = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    days.push({ day: d, dateStr });
  }

  function getItemsForDate(dateStr: string) {
    const dayAssignments = assignments.filter((a) => a.dueDate === dateStr);
    const dayTests = tests.filter((t) => t.testDate === dateStr);
    return { dayAssignments, dayTests };
  }

  const selectedItems = selectedDate ? getItemsForDate(selectedDate) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            setCurrentDate(new Date(year, month - 1, 1));
            setSelectedDate(null);
          }}
          className="p-2 text-gray-500 hover:text-gray-700"
        >
          &larr;
        </button>
        <h2 className="text-xl font-bold text-gray-900">{monthName}</h2>
        <button
          onClick={() => {
            setCurrentDate(new Date(year, month + 1, 1));
            setSelectedDate(null);
          }}
          className="p-2 text-gray-500 hover:text-gray-700"
        >
          &rarr;
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-xs font-medium text-gray-500 py-1">
            {d}
          </div>
        ))}

        {/* Empty cells before first day */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {/* Day cells */}
        {days.map(({ day, dateStr }) => {
          const { dayAssignments, dayTests } = getItemsForDate(dateStr);
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const isWeekend = new Date(dateStr + "T00:00:00").getDay() % 6 === 0;
          const hasItems = dayAssignments.length > 0 || dayTests.length > 0;

          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDate(isSelected ? null : dateStr)}
              className={`relative p-1 min-h-[48px] rounded-lg transition-colors ${
                isSelected
                  ? "bg-blue-200 ring-2 ring-blue-600"
                  : isToday
                    ? "bg-blue-100 ring-2 ring-blue-500"
                    : isWeekend
                      ? "bg-gray-50"
                      : hasItems
                        ? "bg-white hover:bg-blue-50"
                        : "bg-white"
              }`}
            >
              <div
                className={`text-sm text-center ${
                  isSelected
                    ? "font-bold text-blue-800"
                    : isToday
                      ? "font-bold text-blue-700"
                      : isWeekend
                        ? "text-gray-400"
                        : "text-gray-700"
                }`}
              >
                {day}
              </div>
              <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
                {dayAssignments.slice(0, 3).map((a, i) => (
                  <span
                    key={`a-${i}`}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: a.subjectColor }}
                  />
                ))}
                {dayTests.map((t, i) => (
                  <span
                    key={`t-${i}`}
                    className="w-2 h-2 rounded-sm"
                    style={{ backgroundColor: t.subjectColor }}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500 justify-center">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          Assignment
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-gray-400" />
          Test/Quiz
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDate && selectedItems && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h3>
          </div>
          <div className="p-4 space-y-3">
            {selectedItems.dayAssignments.length === 0 && selectedItems.dayTests.length === 0 && (
              <p className="text-sm text-gray-400">Nothing due this day.</p>
            )}

            {selectedItems.dayTests.map((t) => (
              <div
                key={`test-${t.id}`}
                className="flex items-center gap-3 p-2 bg-amber-50 rounded-lg border border-amber-200"
              >
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: t.subjectColor }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">
                      {t.type}
                    </span>
                    <span className="text-sm font-medium text-gray-800">{t.title}</span>
                  </div>
                  <div className="text-xs text-gray-500">{t.subjectName}</div>
                </div>
                {t.status !== "upcoming" && (
                  <span className="text-[10px] text-green-600 font-medium">{t.status}</span>
                )}
              </div>
            ))}

            {selectedItems.dayAssignments.map((a) => (
              <div
                key={`assign-${a.id}`}
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
                {a.status === "completed" && (
                  <span className="text-[10px] text-blue-600 font-medium">Done</span>
                )}
                {a.status === "verified" && (
                  <span className="text-[10px] text-green-600 font-medium">Verified</span>
                )}
                {a.status === "pending" && (
                  <span className="text-[10px] text-gray-400">Pending</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <AppShell>
      <CalendarContent />
    </AppShell>
  );
}

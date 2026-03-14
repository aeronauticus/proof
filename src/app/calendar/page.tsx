"use client";

import { useState, useEffect } from "react";
import AppShell from "@/components/ui/AppShell";

interface CalendarDay {
  date: string;
  assignments: Array<{ id: number; subjectColor: string; title: string }>;
  tests: Array<{ id: number; subjectColor: string; title: string; type: string }>;
}

function CalendarContent() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [assignments, setAssignments] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split("T")[0];

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

  function getDotsForDate(dateStr: string) {
    const assignDots = assignments
      .filter((a) => a.dueDate === dateStr)
      .map((a) => a.subjectColor);
    const testDots = tests
      .filter((t) => t.testDate === dateStr)
      .map((t) => t.subjectColor);
    return { assignDots, testDots };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
          className="p-2 text-gray-500 hover:text-gray-700"
        >
          &larr;
        </button>
        <h2 className="text-xl font-bold text-gray-900">{monthName}</h2>
        <button
          onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
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
          const { assignDots, testDots } = getDotsForDate(dateStr);
          const isToday = dateStr === today;
          const isWeekend = new Date(dateStr + "T00:00:00").getDay() % 6 === 0;

          return (
            <div
              key={dateStr}
              className={`relative p-1 min-h-[48px] rounded-lg ${
                isToday
                  ? "bg-blue-100 ring-2 ring-blue-500"
                  : isWeekend
                    ? "bg-gray-50"
                    : "bg-white"
              }`}
            >
              <div
                className={`text-sm text-center ${
                  isToday
                    ? "font-bold text-blue-700"
                    : isWeekend
                      ? "text-gray-400"
                      : "text-gray-700"
                }`}
              >
                {day}
              </div>
              <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
                {assignDots.slice(0, 3).map((color, i) => (
                  <span
                    key={`a-${i}`}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                ))}
                {testDots.map((color, i) => (
                  <span
                    key={`t-${i}`}
                    className="w-2 h-2 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
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

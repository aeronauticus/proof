"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell, { useSession } from "@/components/ui/AppShell";
import { toLocalISODate } from "@/lib/date-utils";

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

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function StatusBadge({ test }: { test: Test }) {
  const today = toLocalISODate(new Date());

  if (test.status === "upcoming") {
    const days = daysUntil(test.testDate);
    return (
      <span
        className={`text-xs font-bold px-2 py-1 rounded-full ${
          days <= 1
            ? "bg-red-100 text-red-700"
            : days <= 3
              ? "bg-amber-100 text-amber-700"
              : "bg-blue-100 text-blue-700"
        }`}
      >
        {days === 0 ? "TODAY" : days === 1 ? "Tomorrow" : `${days} days`}
      </span>
    );
  }

  if (test.status === "taken") {
    const daysWaiting = test.expectedReturnDate
      ? -daysUntil(test.expectedReturnDate)
      : 0;
    const overdue = test.expectedReturnDate && test.expectedReturnDate < today;
    return (
      <span
        className={`text-xs font-bold px-2 py-1 rounded-full ${
          overdue ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
        }`}
      >
        {overdue ? "OVERDUE" : "Waiting for grade"}
      </span>
    );
  }

  if (test.status === "returned") {
    return (
      <span className="text-xs font-bold px-2 py-1 rounded-full bg-purple-100 text-purple-700">
        Needs review
      </span>
    );
  }

  if (test.status === "reviewed") {
    return (
      <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">
        Reviewed
      </span>
    );
  }

  return null;
}

function TestsContent() {
  const session = useSession();
  const router = useRouter();
  const [tests, setTests] = useState<Test[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/tests${filter ? `?status=${filter}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        setTests(data.tests || []);
        setLoading(false);
      });
  }, [filter]);

  async function handleTake(id: number) {
    await fetch("/api/tests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "take" }),
    });
    const res = await fetch(`/api/tests${filter ? `?status=${filter}` : ""}`);
    const data = await res.json();
    setTests(data.tests || []);
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this test/quiz and its study plan?")) return;
    await fetch("/api/tests", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setTests((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Tests & Quizzes</h2>
        <button
          onClick={() => router.push("/tests/new")}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          + Add
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: "", label: "All" },
          { value: "upcoming", label: "Upcoming" },
          { value: "taken", label: "Waiting" },
          { value: "returned", label: "Needs Review" },
          { value: "reviewed", label: "Reviewed" },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setFilter(f.value);
              setLoading(true);
            }}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              filter === f.value
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 text-center py-8">Loading...</div>
      ) : tests.length === 0 ? (
        <div className="text-gray-400 text-center py-8">No tests found</div>
      ) : (
        <div className="space-y-3">
          {tests.map((test) => (
            <div
              key={test.id}
              onClick={() => router.push(`/tests/${test.id}`)}
              className="bg-white rounded-xl p-4 border border-gray-200 cursor-pointer hover:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: test.subjectColor }}
                  />
                  <span className="text-sm text-gray-500">
                    {test.subjectName}
                  </span>
                  <span className="text-sm text-gray-400 capitalize">
                    {test.type}
                  </span>
                </div>
                <StatusBadge test={test} />
              </div>
              <div className="font-medium text-gray-800">{test.title}</div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-gray-500">
                  {new Date(test.testDate + "T00:00:00").toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric" }
                  )}
                </span>
                {test.scoreRaw !== null && test.scoreTotal !== null && (
                  <span className="text-sm font-semibold">
                    {test.scoreRaw}/{test.scoreTotal}
                    {test.letterGrade && ` (${test.letterGrade})`}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  {test.status === "upcoming" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTake(test.id);
                      }}
                      className="text-xs px-3 py-1 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                    >
                      Mark as Taken
                    </button>
                  )}
                  {session?.role === "parent" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(test.id);
                      }}
                      className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TestsPage() {
  return (
    <AppShell>
      <TestsContent />
    </AppShell>
  );
}

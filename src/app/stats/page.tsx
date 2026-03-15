"use client";

import { useState, useEffect } from "react";
import AppShell, { useSession } from "@/components/ui/AppShell";

interface TestScore {
  id: number;
  title: string;
  subjectName: string;
  subjectColor: string;
  testDate: string;
  scoreRaw: number | null;
  scoreTotal: number | null;
  letterGrade: string | null;
}

interface NoteEntry {
  id: number;
  date: string;
  subjectName: string;
  summaryEvaluation: string | null;
  quizScore: number | null;
}

interface ChecklistDay {
  date: string;
  total: number;
  completed: number;
}

function StatsContent() {
  const session = useSession();
  const [tests, setTests] = useState<TestScore[]>([]);
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/tests").then((r) => r.json()),
      fetch("/api/stats/summary").then((r) => r.json()),
    ]).then(([testsData, statsData]) => {
      // Get tests with scores (returned or reviewed)
      const scored = (testsData.tests || []).filter(
        (t: TestScore) => t.scoreRaw != null && t.scoreTotal != null
      );
      setTests(scored);
      setStreak(statsData.streak || 0);
      setNotes(statsData.recentNotes || []);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Group test scores by subject
  const subjectScores = new Map<
    string,
    { color: string; scores: { date: string; pct: number; label: string }[] }
  >();
  for (const t of tests) {
    if (!subjectScores.has(t.subjectName)) {
      subjectScores.set(t.subjectName, {
        color: t.subjectColor,
        scores: [],
      });
    }
    const pct =
      t.scoreTotal && t.scoreTotal > 0
        ? Math.round((t.scoreRaw! / t.scoreTotal) * 100)
        : 0;
    subjectScores.get(t.subjectName)!.scores.push({
      date: t.testDate,
      pct,
      label: `${t.scoreRaw}/${t.scoreTotal}`,
    });
  }

  // Notes quality stats
  const totalNotes = notes.length;
  const adequateNotes = notes.filter(
    (n) => n.summaryEvaluation === "adequate"
  ).length;
  const quizScores = notes
    .filter((n) => n.quizScore != null)
    .map((n) => n.quizScore!);
  const avgQuizScore =
    quizScores.length > 0
      ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length)
      : null;

  // Overall grade average
  const allPcts = tests.map((t) =>
    t.scoreTotal && t.scoreTotal > 0
      ? (t.scoreRaw! / t.scoreTotal) * 100
      : 0
  );
  const overallAvg =
    allPcts.length > 0
      ? Math.round(allPcts.reduce((a, b) => a + b, 0) / allPcts.length)
      : null;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">Stats</h2>

      {/* Top stats cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-3 border border-gray-200 text-center">
          <div className="text-2xl font-bold text-blue-600">{streak}</div>
          <div className="text-xs text-gray-500">Day Streak</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-200 text-center">
          <div className="text-2xl font-bold text-green-600">
            {overallAvg != null ? `${overallAvg}%` : "—"}
          </div>
          <div className="text-xs text-gray-500">Grade Avg</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-200 text-center">
          <div className="text-2xl font-bold text-purple-600">
            {avgQuizScore != null ? `${avgQuizScore}%` : "—"}
          </div>
          <div className="text-xs text-gray-500">Quiz Avg</div>
        </div>
      </div>

      {/* Grade Trends by Subject */}
      {subjectScores.size > 0 && (
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-3">
            Grade Trends by Subject
          </h3>
          <div className="space-y-4">
            {Array.from(subjectScores.entries()).map(([name, data]) => {
              const avg = Math.round(
                data.scores.reduce((a, b) => a + b.pct, 0) /
                  data.scores.length
              );
              return (
                <div key={name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: data.color }}
                      />
                      <span className="text-sm font-medium text-gray-800">
                        {name}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      avg {avg}% ({data.scores.length} test
                      {data.scores.length !== 1 ? "s" : ""})
                    </span>
                  </div>
                  {/* Simple bar chart of scores */}
                  <div className="flex items-end gap-1 h-12">
                    {data.scores.map((s, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t transition-all relative group"
                        style={{
                          height: `${Math.max(s.pct, 5)}%`,
                          backgroundColor: data.color,
                          opacity: 0.7 + (i / data.scores.length) * 0.3,
                        }}
                        title={`${s.label} (${s.pct}%) — ${s.date}`}
                      />
                    ))}
                  </div>
                  {/* Score labels */}
                  <div className="flex gap-1 mt-1">
                    {data.scores.map((s, i) => (
                      <div
                        key={i}
                        className="flex-1 text-center text-[10px] text-gray-400"
                      >
                        {s.label}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes Quality */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <h3 className="font-semibold text-gray-800 mb-3">Notes Quality</h3>
        {totalNotes === 0 ? (
          <p className="text-gray-400 text-sm">No notes uploaded yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Adequate summaries</span>
              <span className="text-sm font-medium text-gray-800">
                {adequateNotes}/{totalNotes} (
                {Math.round((adequateNotes / totalNotes) * 100)}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full"
                style={{
                  width: `${(adequateNotes / totalNotes) * 100}%`,
                }}
              />
            </div>
            {avgQuizScore != null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  Avg quiz score
                </span>
                <span
                  className={`text-sm font-medium ${avgQuizScore >= 70 ? "text-green-600" : avgQuizScore >= 40 ? "text-yellow-600" : "text-red-600"}`}
                >
                  {avgQuizScore}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent Grades */}
      {tests.length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-3">Recent Grades</h3>
          <div className="space-y-2">
            {tests.slice(-10).reverse().map((t) => {
              const pct =
                t.scoreTotal && t.scoreTotal > 0
                  ? Math.round((t.scoreRaw! / t.scoreTotal) * 100)
                  : 0;
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: t.subjectColor }}
                    />
                    <span className="text-sm text-gray-800">
                      {t.subjectName}: {t.title}
                    </span>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-sm font-bold ${pct >= 90 ? "text-green-600" : pct >= 70 ? "text-yellow-600" : "text-red-600"}`}
                    >
                      {t.scoreRaw}/{t.scoreTotal}
                    </span>
                    {t.letterGrade && (
                      <span className="text-xs text-gray-400 ml-1">
                        ({t.letterGrade})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tests.length === 0 && totalNotes === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-400">
            Stats will appear as Jack completes tests and uploads notes.
          </p>
        </div>
      )}
    </div>
  );
}

export default function StatsPage() {
  return (
    <AppShell>
      <StatsContent />
    </AppShell>
  );
}

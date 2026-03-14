"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/ui/AppShell";

function NewTestContent() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Array<{ id: number; name: string; color: string }>>([]);
  const [subjectId, setSubjectId] = useState<number>(0);
  const [type, setType] = useState<"test" | "quiz">("quiz");
  const [title, setTitle] = useState("");
  const [topics, setTopics] = useState("");
  const [testDate, setTestDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/subjects")
      .then((r) => r.json())
      .then((data) => setSubjects(data.subjects || []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectId || !title || !testDate) return;
    setSubmitting(true);

    const res = await fetch("/api/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId, type, title, topics, testDate }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/tests/${data.test.id}`);
    } else {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          &larr;
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Add Test / Quiz</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(parseInt(e.target.value))}
            className="w-full p-3 border border-gray-300 rounded-xl bg-white text-gray-800"
            required
          >
            <option value={0}>Select subject...</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
          <div className="flex gap-3">
            {(["quiz", "test"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-xl border-2 font-medium capitalize transition-colors ${
                  type === t
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Chapter 5 Quiz"
            className="w-full p-3 border border-gray-300 rounded-xl text-gray-800"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Topics / Chapters</label>
          <textarea
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
            placeholder="e.g., Chapters 3-4, vocabulary list, verb conjugations"
            className="w-full p-3 border border-gray-300 rounded-xl text-gray-800"
            rows={2}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Test Date</label>
          <input
            type="date"
            value={testDate}
            onChange={(e) => setTestDate(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-xl text-gray-800"
            required
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !subjectId || !title || !testDate}
          className="w-full py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Creating..." : "Add & Generate Study Plan"}
        </button>
      </form>
    </div>
  );
}

export default function NewTestPage() {
  return (
    <AppShell>
      <NewTestContent />
    </AppShell>
  );
}

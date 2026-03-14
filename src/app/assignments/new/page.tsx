"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/ui/AppShell";

interface Subject {
  subjectName: string;
  subjectColor: string;
  subjectId?: number;
}

function NewAssignmentContent() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Array<{ id: number; name: string; color: string }>>([]);
  const [subjectId, setSubjectId] = useState<number>(0);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Get today's schedule to show relevant subjects
    const today = new Date().toISOString().split("T")[0];
    fetch(`/api/schedule?date=${today}`)
      .then((r) => r.json())
      .then(async (data) => {
        // Also fetch all subjects for the dropdown
        // For now, we'll use the schedule endpoint data
        // but we need subject IDs, so let's fetch subjects separately
        const allSubjectsRes = await fetch("/api/subjects");
        const allSubjectsData = await allSubjectsRes.json();
        setSubjects(allSubjectsData.subjects || []);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectId || !title || !dueDate) return;
    setSubmitting(true);

    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId, title, description, dueDate }),
    });

    if (res.ok) {
      router.push("/assignments");
    } else {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-gray-500 hover:text-gray-700"
        >
          &larr;
        </button>
        <h2 className="text-2xl font-bold text-gray-900">New Assignment</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Subject
          </label>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(parseInt(e.target.value))}
            className="w-full p-3 border border-gray-300 rounded-xl bg-white text-gray-800"
            required
          >
            <option value={0}>Select subject...</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Assignment
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Worksheet p.42 #1-15"
            className="w-full p-3 border border-gray-300 rounded-xl text-gray-800"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Details (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Any extra details..."
            className="w-full p-3 border border-gray-300 rounded-xl text-gray-800"
            rows={2}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Due Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-xl text-gray-800"
            required
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !subjectId || !title || !dueDate}
          className="w-full py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Adding..." : "Add Assignment"}
        </button>
      </form>
    </div>
  );
}

export default function NewAssignmentPage() {
  return (
    <AppShell>
      <NewAssignmentContent />
    </AppShell>
  );
}

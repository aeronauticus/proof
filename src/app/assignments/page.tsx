"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell, { useSession } from "@/components/ui/AppShell";

interface Assignment {
  id: number;
  subjectName: string;
  subjectColor: string;
  title: string;
  description: string | null;
  assignedDate: string;
  dueDate: string;
  status: string;
}

function AssignmentsContent() {
  const session = useSession();
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [filter, setFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/assignments${filter ? `?status=${filter}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        setAssignments(data.assignments || []);
        setLoading(false);
      });
  }, [filter]);

  async function handleAction(id: number, action: string) {
    await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    // Reload
    const res = await fetch(`/api/assignments${filter ? `?status=${filter}` : ""}`);
    const data = await res.json();
    setAssignments(data.assignments || []);
  }

  const today = new Date().toISOString().split("T")[0];

  // Group assignments by due date
  const grouped: Record<string, Assignment[]> = {};
  for (const a of assignments) {
    const label =
      a.dueDate === today
        ? "Today"
        : a.dueDate < today
          ? "Overdue"
          : a.dueDate ===
              new Date(Date.now() + 86400000).toISOString().split("T")[0]
            ? "Tomorrow"
            : a.dueDate;

    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(a);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Assignments</h2>
        {session?.role === "student" && (
          <button
            onClick={() => router.push("/assignments/new")}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            + Add
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {["pending", "completed", "verified", ""].map((f) => (
          <button
            key={f}
            onClick={() => {
              setFilter(f);
              setLoading(true);
            }}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              filter === f
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f === "" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 text-center py-8">Loading...</div>
      ) : assignments.length === 0 ? (
        <div className="text-gray-400 text-center py-8">
          No {filter || ""} assignments
        </div>
      ) : (
        Object.entries(grouped).map(([label, items]) => (
          <div key={label}>
            <h3
              className={`text-sm font-semibold uppercase tracking-wide mb-2 ${
                label === "Overdue" ? "text-red-600" : "text-gray-500"
              }`}
            >
              {label}
            </h3>
            <div className="space-y-2">
              {items.map((a) => (
                <div
                  key={a.id}
                  className="bg-white rounded-xl p-4 border border-gray-200 flex items-center gap-3"
                >
                  <span
                    className="w-1 h-10 rounded-full flex-shrink-0"
                    style={{ backgroundColor: a.subjectColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 truncate">
                      {a.title}
                    </div>
                    <div className="text-sm text-gray-500">{a.subjectName}</div>
                  </div>
                  {a.status === "pending" && session?.role === "student" && (
                    <button
                      onClick={() => handleAction(a.id, "complete")}
                      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex-shrink-0"
                    >
                      Done
                    </button>
                  )}
                  {a.status === "completed" && session?.role === "parent" && (
                    <button
                      onClick={() => handleAction(a.id, "verify")}
                      className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex-shrink-0"
                    >
                      Verify
                    </button>
                  )}
                  {a.status === "verified" && (
                    <span className="text-green-600 text-sm font-medium flex-shrink-0">
                      Verified
                    </span>
                  )}
                  {a.status === "completed" && session?.role === "student" && (
                    <span className="text-blue-500 text-sm flex-shrink-0">
                      Done
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function AssignmentsPage() {
  return (
    <AppShell>
      <AssignmentsContent />
    </AppShell>
  );
}

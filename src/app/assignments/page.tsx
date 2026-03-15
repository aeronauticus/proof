"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import AppShell, { useSession } from "@/components/ui/AppShell";
import Lightbox from "@/components/ui/Lightbox";

interface AiEval {
  looksLikeHomework: boolean;
  appearsComplete: boolean;
  missingAnswers: boolean;
  estimatedCompletionPct: number;
  feedback: string;
  parentNote: string;
}

interface Assignment {
  id: number;
  subjectName: string;
  subjectColor: string;
  title: string;
  description: string | null;
  assignedDate: string;
  dueDate: string;
  status: string;
  photoPaths: string[] | null;
  aiHomeworkEval: AiEval | null;
  studentConfirmedComplete: boolean;
}

function PhotoThumbnails({ photos }: { photos: string[] }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  if (!photos.length) return null;
  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto mt-2">
        {photos.map((p, i) => (
          <img
            key={i}
            src={p}
            alt={`Photo ${i + 1}`}
            className="h-16 w-16 rounded-lg border border-gray-200 object-cover flex-shrink-0 cursor-pointer hover:opacity-80"
            onClick={() => { setIdx(i); setOpen(true); }}
          />
        ))}
      </div>
      {open && <Lightbox photos={photos} initialIndex={idx} onClose={() => setOpen(false)} />}
    </>
  );
}

function AssignmentCard({
  a,
  role,
  today,
  onReload,
}: {
  a: Assignment;
  role: string;
  today: string;
  onReload: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [aiWarning, setAiWarning] = useState<AiEval | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const photos = a.photoPaths || [];
  const hasPendingWarning = a.status === "pending" && a.aiHomeworkEval &&
    (a.aiHomeworkEval.missingAnswers || !a.aiHomeworkEval.appearsComplete || !a.aiHomeworkEval.looksLikeHomework);

  async function handleAddPhoto(file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append("id", a.id.toString());
    formData.append("action", "add_photos");
    formData.append("photos", file);
    await fetch("/api/assignments", { method: "PATCH", body: formData });
    setUploading(false);
    onReload();
  }

  async function handleComplete() {
    setSubmitting(true);
    const res = await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, action: "complete" }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (data.needsConfirmation) {
      setAiWarning(data.aiHomeworkEval);
    }
    onReload();
  }

  async function handleConfirm() {
    await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, action: "confirm_complete" }),
    });
    setAiWarning(null);
    onReload();
  }

  async function handleVerify() {
    await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, action: "verify" }),
    });
    onReload();
  }

  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200">
      <div className="flex items-start gap-3">
        <span
          className="w-1 min-h-[2.5rem] rounded-full flex-shrink-0 mt-0.5"
          style={{ backgroundColor: a.subjectColor }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">
            {a.subjectName}
          </div>
          <div className="font-medium text-gray-800 leading-snug">
            {a.title}
          </div>
          {a.description && (
            <p className="text-sm text-gray-500 mt-1">{a.description}</p>
          )}
        </div>
      </div>

      {/* Photo proof */}
      <PhotoThumbnails photos={photos} />

      {/* AI warning from server (persisted) */}
      {hasPendingWarning && !aiWarning && (
        <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-900 font-medium">
            {!a.aiHomeworkEval!.looksLikeHomework
              ? "This doesn't look like homework."
              : "It looks like some answers might be missing."}
          </p>
          <p className="text-xs text-amber-800 mt-0.5">{a.aiHomeworkEval!.feedback}</p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => { setExpanded(true); }}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium"
            >
              Add Photos
            </button>
            <button
              onClick={handleConfirm}
              className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium"
            >
              I Finished Everything
            </button>
          </div>
        </div>
      )}

      {/* AI warning from current submission */}
      {aiWarning && (
        <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-900 font-medium">
            {!aiWarning.looksLikeHomework
              ? "This doesn't look like homework."
              : aiWarning.missingAnswers
                ? "It looks like some answers might be missing."
                : "The work may not be fully complete."}
          </p>
          <p className="text-xs text-amber-800 mt-0.5">{aiWarning.feedback}</p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => { setExpanded(true); setAiWarning(null); }}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium"
            >
              Add More Photos
            </button>
            <button
              onClick={handleConfirm}
              className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium"
            >
              I Finished Everything
            </button>
          </div>
        </div>
      )}

      {/* AI eval note for parent */}
      {a.status !== "pending" && a.aiHomeworkEval && (a.aiHomeworkEval.missingAnswers || !a.aiHomeworkEval.appearsComplete) && role === "parent" && (
        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-medium text-amber-800">AI Review:</p>
          <p className="text-xs text-amber-700">{a.aiHomeworkEval.parentNote}</p>
          {a.studentConfirmedComplete && (
            <p className="text-xs text-amber-600 mt-1 font-medium">Jack confirmed complete despite warning.</p>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleAddPhoto(file);
          if (fileRef.current) fileRef.current.value = "";
        }}
      />

      {/* Bottom bar: due date + actions */}
      <div className="flex items-center justify-between mt-3 ml-4">
        <span className="text-xs text-gray-400">
          Due {a.dueDate === today ? "today" : a.dueDate < today ? `${a.dueDate} (overdue)` : a.dueDate}
        </span>

        {a.status === "pending" && role === "student" && !hasPendingWarning && !aiWarning && (
          expanded ? (
            <div className="flex gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {uploading ? "..." : photos.length > 0 ? "Add" : "Photo"}
              </button>
              {photos.length > 0 && (
                <button
                  onClick={handleComplete}
                  disabled={submitting}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? "Checking..." : "Submit"}
                </button>
              )}
              <button
                onClick={() => setExpanded(false)}
                className="text-xs text-gray-400"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setExpanded(true)}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              Mark Done
            </button>
          )
        )}

        {a.status === "completed" && role === "parent" && (
          <button
            onClick={handleVerify}
            className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
          >
            Verify
          </button>
        )}
        {a.status === "verified" && (
          <span className="text-green-600 text-sm font-medium">Verified</span>
        )}
        {a.status === "completed" && role === "student" && (
          <span className="text-blue-500 text-sm font-medium">Waiting for parent</span>
        )}
      </div>
    </div>
  );
}

function AssignmentsContent() {
  const session = useSession();
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [filter, setFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);

  function loadAssignments() {
    fetch(`/api/assignments${filter ? `?status=${filter}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        setAssignments(data.assignments || []);
        setLoading(false);
      });
  }

  useEffect(() => {
    setLoading(true);
    loadAssignments();
  }, [filter]);

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  // Group assignments by due date
  const grouped: Record<string, Assignment[]> = {};
  for (const a of assignments) {
    let label: string;
    if (a.dueDate < today) {
      label = "Overdue";
    } else if (a.dueDate === today) {
      label = "Today";
    } else if (a.dueDate === tomorrow) {
      label = "Tomorrow";
    } else {
      const d = new Date(a.dueDate + "T12:00:00");
      label = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    }
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
            onClick={() => setFilter(f)}
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
                <AssignmentCard
                  key={a.id}
                  a={a}
                  role={session?.role || "student"}
                  today={today}
                  onReload={loadAssignments}
                />
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

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell, { useSession } from "@/components/ui/AppShell";

interface SchoolBreak {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  type: string;
}

function SettingsContent() {
  const router = useRouter();
  const session = useSession();
  const [breaks, setBreaks] = useState<SchoolBreak[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState("holiday");
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/calendar")
      .then((r) => r.json())
      .then((data) => setBreaks(data.breaks || []));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, startDate, endDate, type }),
    });
    setShowAdd(false);
    setName("");
    setStartDate("");
    setEndDate("");
    const res = await fetch("/api/calendar");
    const data = await res.json();
    setBreaks(data.breaks || []);
  }

  async function handleDelete(id: number) {
    await fetch("/api/calendar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBreaks((prev) => prev.filter((b) => b.id !== id));
  }

  async function handleSendEmail() {
    setEmailSending(true);
    setEmailResult(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setEmailResult(`Sent to: ${data.sentTo.join(", ")}`);
      } else {
        setEmailResult(`Error: ${data.error}`);
      }
    } catch {
      setEmailResult("Failed to send email.");
    }
    setEmailSending(false);
  }

  const isParent = session?.role === "parent";

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">More</h2>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => router.push("/calendar")}
          className="bg-white rounded-xl p-4 border border-gray-200 hover:border-blue-300 transition-colors text-left"
        >
          <svg className="w-6 h-6 text-blue-500 mb-2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="font-medium text-gray-800 text-sm">Calendar</span>
        </button>
        <button
          onClick={() => router.push("/stats")}
          className="bg-white rounded-xl p-4 border border-gray-200 hover:border-blue-300 transition-colors text-left"
        >
          <svg className="w-6 h-6 text-green-500 mb-2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="font-medium text-gray-800 text-sm">Stats</span>
        </button>
      </div>

      {/* Daily Email Summary */}
      {isParent && (
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-3">Daily Email Summary</h3>
          <p className="text-sm text-gray-500 mb-3">
            An automatic summary is emailed every school day at 6:30 PM.
            You can also send one manually right now.
          </p>
          <button
            onClick={handleSendEmail}
            disabled={emailSending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
          >
            {emailSending ? "Sending..." : "Send Summary Now"}
          </button>
          {emailResult && (
            <p className={`mt-2 text-sm ${emailResult.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
              {emailResult}
            </p>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">School Calendar</h3>
          {isParent && (
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="text-sm px-3 py-1 bg-blue-600 text-white rounded-lg"
            >
              + Add Break
            </button>
          )}
        </div>

        {showAdd && (
          <form onSubmit={handleAdd} className="space-y-3 mb-4 p-3 bg-gray-50 rounded-lg">
            <input
              type="text"
              placeholder="Break name (e.g., Spring Break)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border rounded-lg text-gray-800"
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="p-2 border rounded-lg text-gray-800"
                required
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="p-2 border rounded-lg text-gray-800"
                required
              />
            </div>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full p-2 border rounded-lg text-gray-800"
            >
              <option value="holiday">Holiday</option>
              <option value="summer">Summer Break</option>
              <option value="teacher_workday">Teacher Workday</option>
              <option value="half_day">Half Day</option>
            </select>
            <button
              type="submit"
              className="w-full py-2 bg-blue-600 text-white rounded-lg"
            >
              Save
            </button>
          </form>
        )}

        {breaks.length === 0 ? (
          <p className="text-gray-400 text-sm">No breaks added yet.</p>
        ) : (
          <div className="space-y-2">
            {breaks.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <div className="font-medium text-gray-800">{b.name}</div>
                  <div className="text-sm text-gray-500">
                    {new Date(b.startDate + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short", day: "numeric",
                    })}
                    {" — "}
                    {new Date(b.endDate + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short", day: "numeric",
                    })}
                    <span className="ml-2 text-xs capitalize text-gray-400">
                      {b.type.replace("_", " ")}
                    </span>
                  </div>
                </div>
                {isParent && (
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="text-red-500 text-sm hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsContent />
    </AppShell>
  );
}

"use client";

import { useState, useEffect } from "react";
import AppShell, { useSession } from "@/components/ui/AppShell";

interface SchoolBreak {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  type: string;
}

function SettingsContent() {
  const session = useSession();
  const [breaks, setBreaks] = useState<SchoolBreak[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState("holiday");

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

  const isParent = session?.role === "parent";

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Settings</h2>

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

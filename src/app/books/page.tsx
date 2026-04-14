"use client";

import { useState, useEffect } from "react";
import AppShell, { useSession } from "@/components/ui/AppShell";

interface Book {
  id: number;
  title: string;
  author: string | null;
  dueDate: string;
  startedAt: string;
  status: string;
  testScore: number | null;
  completedAt: string | null;
  notes: string | null;
}

function BooksPageContent() {
  const session = useSession();
  const [active, setActive] = useState<Book | null>(null);
  const [history, setHistory] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  async function loadBooks() {
    const res = await fetch("/api/books");
    const data = await res.json();
    setActive(data.active || null);
    setHistory(data.history || []);
    setLoading(false);
  }

  useEffect(() => {
    loadBooks();
  }, []);

  function startEdit(book: Book) {
    setEditing(book.id);
    setEditTitle(book.title);
    setEditAuthor(book.author || "");
    setEditDueDate(book.dueDate);
  }

  async function saveEdit(bookId: number) {
    await fetch("/api/books", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: bookId,
        action: "edit",
        title: editTitle,
        author: editAuthor || null,
        dueDate: editDueDate,
      }),
    });
    setEditing(null);
    loadBooks();
  }

  async function deleteBook(bookId: number) {
    if (!confirm("Delete this book record? This can't be undone.")) return;
    await fetch("/api/books", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bookId, action: "delete" }),
    });
    loadBooks();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const isParent = session?.role === "parent";

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">Books</h2>

      {/* Active book */}
      {active && (
        <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-4">
          <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide mb-2">
            Currently Reading
          </div>
          {editing === active.id ? (
            <div className="space-y-2">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="Author"
                value={editAuthor}
                onChange={(e) => setEditAuthor(e.target.value)}
                className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm"
              />
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveEdit(active.id)}
                  className="flex-1 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="font-semibold text-gray-900 text-lg">{active.title}</div>
              {active.author && (
                <div className="text-sm text-gray-600">by {active.author}</div>
              )}
              <div className="mt-2 flex items-center gap-4 text-xs text-indigo-700">
                <span>
                  <strong>Started:</strong>{" "}
                  {new Date(active.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <span>
                  <strong>Test by:</strong>{" "}
                  {new Date(active.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => startEdit(active)}
                  className="text-xs px-3 py-1.5 bg-white text-indigo-700 border border-indigo-300 rounded-lg font-medium hover:bg-indigo-100"
                >
                  Edit
                </button>
                {isParent && (
                  <button
                    onClick={() => deleteBook(active.id)}
                    className="text-xs px-3 py-1.5 bg-white text-red-600 border border-red-200 rounded-lg font-medium hover:bg-red-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {!active && (
        <p className="text-sm text-gray-500">
          No active book. Jack will be prompted on the home screen to pick one.
        </p>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 text-sm mb-2">Books Read</h3>
          <div className="space-y-2">
            {history.map((book) => {
              const passed = book.status === "passed";
              return (
                <div
                  key={book.id}
                  className={`bg-white rounded-xl p-3 border ${passed ? "border-green-200" : "border-red-200"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-900 truncate">{book.title}</div>
                      {book.author && (
                        <div className="text-xs text-gray-600 truncate">by {book.author}</div>
                      )}
                      <div className="text-[11px] text-gray-500 mt-1">
                        {book.completedAt &&
                          `Finished ${new Date(book.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                      </div>
                    </div>
                    <div className={`text-right flex-shrink-0 ${passed ? "text-green-700" : "text-red-700"}`}>
                      <div className="text-lg font-bold">
                        {book.testScore != null ? `${Math.round(book.testScore)}%` : "—"}
                      </div>
                      <div className="text-[10px] uppercase font-bold">
                        {passed ? "Passed" : "Failed"}
                      </div>
                    </div>
                  </div>
                  {isParent && (
                    <button
                      onClick={() => deleteBook(book.id)}
                      className="mt-2 text-[11px] text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BooksPage() {
  return (
    <AppShell>
      <BooksPageContent />
    </AppShell>
  );
}

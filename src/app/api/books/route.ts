import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { books } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";

// GET /api/books — list all books (active first, then by completion date desc)
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const all = await db
    .select()
    .from(books)
    .orderBy(desc(books.startedAt));

  const active = all.find((b) => b.status === "active") || null;
  const history = all.filter((b) => b.status !== "active");

  return NextResponse.json({ active, history, all });
}

// POST /api/books — Jack adds a new book (only allowed if no active book)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existingActive = await db
    .select()
    .from(books)
    .where(eq(books.status, "active"));

  if (existingActive.length > 0) {
    return NextResponse.json(
      { error: "Finish the current book before adding a new one" },
      { status: 400 }
    );
  }

  const data = await req.json();
  const title = (data.title || "").trim();
  const author = (data.author || "").trim() || null;
  const dueDate = (data.dueDate || "").trim();

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return NextResponse.json({ error: "Valid due date required" }, { status: 400 });
  }

  const [inserted] = await db
    .insert(books)
    .values({ title, author, dueDate })
    .returning();

  await logAction(session.userId, "add", "book", inserted.id, null, {
    title,
    dueDate,
  });

  return NextResponse.json({ ok: true, book: inserted });
}

// PATCH /api/books — parent records test result, or either edits the due date
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, action, ...data } = await req.json();

  const book = await db
    .select()
    .from(books)
    .where(eq(books.id, id))
    .then((rows) => rows[0]);

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  if (action === "record_score") {
    if (session.role !== "parent") {
      return NextResponse.json({ error: "Parent only" }, { status: 403 });
    }

    const score = Number(data.testScore);
    if (isNaN(score) || score < 0 || score > 100) {
      return NextResponse.json(
        { error: "Test score must be 0-100" },
        { status: 400 }
      );
    }

    const status = score >= 70 ? "passed" : "failed";

    await db
      .update(books)
      .set({
        status,
        testScore: score,
        completedAt: new Date(),
        reviewedBy: session.userId,
        notes: data.notes || null,
      })
      .where(eq(books.id, id));

    await logAction(session.userId, "record_book_score", "book", id, null, {
      testScore: score,
      status,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "edit") {
    const updates: Record<string, unknown> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.author !== undefined) updates.author = data.author || null;
    if (data.dueDate !== undefined) updates.dueDate = data.dueDate;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    await db.update(books).set(updates).where(eq(books.id, id));
    await logAction(session.userId, "edit", "book", id, null, updates);
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    if (session.role !== "parent") {
      return NextResponse.json({ error: "Parent only" }, { status: 403 });
    }
    await db.delete(books).where(eq(books.id, id));
    await logAction(session.userId, "delete", "book", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

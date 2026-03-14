import { NextRequest, NextResponse } from "next/server";
import { login, logout, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";

// GET /api/auth — get current session + list available users
export async function GET() {
  const session = await getSession();
  const allUsers = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users);

  return NextResponse.json({ session, users: allUsers });
}

// POST /api/auth — login
export async function POST(req: NextRequest) {
  const { userId, pin } = await req.json();

  if (!userId || !pin) {
    return NextResponse.json(
      { error: "userId and pin required" },
      { status: 400 }
    );
  }

  const session = await login(userId, pin);
  if (!session) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  return NextResponse.json({ session });
}

// DELETE /api/auth — logout
export async function DELETE() {
  await logout();
  return NextResponse.json({ ok: true });
}

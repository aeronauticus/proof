import { cookies } from "next/headers";
import { db } from "./db";
import { users } from "./schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const SECRET = process.env.APP_SECRET || "dev-secret-change-me";

interface SessionPayload {
  userId: number;
  role: "student" | "parent";
  name: string;
}

function sign(payload: SessionPayload): string {
  const data = JSON.stringify(payload);
  const encoded = Buffer.from(data).toString("base64");
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(encoded)
    .digest("hex");
  return `${encoded}.${signature}`;
}

function verify(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", SECRET)
    .update(encoded)
    .digest("hex");

  if (signature !== expectedSignature) return null;

  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString());
  } catch {
    return null;
  }
}

export async function login(
  userId: number,
  pin: string
): Promise<SessionPayload | null> {
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .then((rows) => rows[0]);

  if (!user) return null;

  const valid = await bcrypt.compare(pin, user.pinHash);
  if (!valid) return null;

  const payload: SessionPayload = {
    userId: user.id,
    role: user.role as "student" | "parent",
    name: user.name,
  };

  const token = sign(payload);
  const cookieStore = await cookies();
  cookieStore.set("session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return payload;
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  return verify(token);
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

export function requireStudent(session: SessionPayload | null): SessionPayload {
  if (!session || session.role !== "student") {
    throw new Error("Student access required");
  }
  return session;
}

export function requireParent(session: SessionPayload | null): SessionPayload {
  if (!session || session.role !== "parent") {
    throw new Error("Parent access required");
  }
  return session;
}

export function requireAuth(session: SessionPayload | null): SessionPayload {
  if (!session) {
    throw new Error("Authentication required");
  }
  return session;
}

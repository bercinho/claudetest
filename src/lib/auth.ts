import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { hashPin, isValidPin, verifyPin } from "./pin";
import type { Role, User } from "./types";

export { hashPin, isValidPin, verifyPin };

const COOKIE_NAME = "family_hq_session";
const SESSION_DAYS = 30;

// ---------------------------------------------------------------------------
// Signed session cookie
// ---------------------------------------------------------------------------

function secret(): Buffer {
  const fromEnv = process.env.APP_SECRET;
  if (fromEnv && fromEnv.length >= 16) return Buffer.from(fromEnv, "utf8");

  // Fall back to a generated secret persisted next to the database so that
  // sessions survive restarts on a home server without any configuration.
  const dir = path.dirname(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "family.db"));
  const file = path.join(dir, ".session-secret");
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(file, "utf8").trim(), "hex");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encodeToken(userId: number, expiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeToken(token: string): number | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload), "utf8");
  const given = Buffer.from(signature, "utf8");
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;

  try {
    const { userId, expiresAt } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof userId !== "number" || typeof expiresAt !== "number") return null;
    if (Date.now() > expiresAt) return null;
    return userId;
  } catch {
    return null;
  }
}

export async function startSession(userId: number): Promise<void> {
  const expiresAt = Date.now() + SESSION_DAYS * 86_400_000;
  const store = await cookies();
  store.set(COOKIE_NAME, encodeToken(userId, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

// ---------------------------------------------------------------------------
// Current user
// ---------------------------------------------------------------------------

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const userId = decodeToken(token);
  if (userId === null) return null;

  const user = getDb()
    .prepare("SELECT id, name, role, emoji, color, active FROM users WHERE id = ? AND active = 1")
    .get(userId) as User | undefined;
  return user ?? null;
}

/** Sends anyone without a valid session back to the sign-in screen. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(role: Role): Promise<User> {
  const user = await requireUser();
  if (user.role !== role) throw new AuthError(`This action is for ${role.toLowerCase()}s only`);
  return user;
}

export async function requireParent(): Promise<User> {
  return requireRole("PARENT");
}

/** A child may only act on their own records; a parent may act on any child. */
export async function requireSelfOrParent(childId: number): Promise<User> {
  const user = await requireUser();
  if (user.role === "PARENT") return user;
  if (user.id !== childId) throw new AuthError("You can only do that for yourself");
  return user;
}

export class AuthError extends Error {}

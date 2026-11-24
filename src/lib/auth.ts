import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { authSessions, loginLimits, users } from "@/db/schema";
import { DUMMY_HASH, normalizeUsername, validUsername, verifyPassword } from "@/lib/password";
import type { Role } from "@/lib/model";

const COOKIE = "mma_session";
const SESSION_MS = 8 * 60 * 60 * 1000;
const isToken = (value: string) => /^[a-f0-9]{64}$/.test(value);
export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
const csrfFor = (token: string) => hashToken(`mma-csrf-v1:${token}`);
export type Session = { id: number; name: string; username: string; role: Role; csrf: string; hash: string };
export class AppError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw || !isToken(raw)) return null;
  const hash = hashToken(raw);
  const [user] = await db.select({ id: users.id, name: users.name, username: users.username, role: users.role })
    .from(authSessions).innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.hash, hash), gt(authSessions.expiresAt, new Date()), eq(users.active, true))).limit(1);
  return user ? { ...user, csrf: csrfFor(raw), hash } : null;
}

export function sameOrigin(request: Request) {
  if (request.headers.get("x-mma-request") !== "1") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  try {
    const external = new URL(origin);
    if (external.origin !== origin || !["http:", "https:"].includes(external.protocol)) return false;
    if (process.env.APP_ORIGIN) return external.origin === new URL(process.env.APP_ORIGIN).origin;
    if (external.origin === new URL(request.url).origin) return true;
    const forwardedHost = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim();
    // Browsers set Sec-Fetch-Site themselves. This accommodates trusted reverse proxies that rewrite Host.
    return external.host === forwardedHost || (site === "same-origin" && external.protocol === "https:");
  } catch { return false; }
}
export function assertOrigin(request: Request) {
  if (!sameOrigin(request)) throw new AppError(403, "This request could not be verified. Refresh the page and retry.");
}
export async function authorizeWrite(request: Request, role?: Role) {
  assertOrigin(request);
  const session = await getSession();
  if (!session) throw new AppError(401, "Your session has expired. Please sign in again.");
  if (role && session.role !== role) throw new AppError(403, "This action is not available for your role.");
  const csrf = request.headers.get("x-mma-csrf") || "";
  if (!isToken(csrf) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf))) throw new AppError(403, "This request could not be verified. Refresh the page and retry.");
  return session;
}
export async function signIn(request: Request, login: string, password: string) {
  const username = normalizeUsername(login);
  if (!validUsername(username) || !password || Buffer.byteLength(password) > 256) throw new AppError(401, "The username or password is incorrect.");
  const now = new Date();
  const expiration = new Date(now.getTime() + 15 * 60 * 1000);
  const key = hashToken(`mma-login-v1:${username}`);
  // The atomic upsert also bounds concurrent guesses at the same username.
  const [limit] = await db.insert(loginLimits).values({ key, attempts: 1, expiresAt: expiration }).onConflictDoUpdate({
    target: loginLimits.key,
    set: {
      attempts: sql`case when ${loginLimits.expiresAt} <= ${now} then 1 else least(${loginLimits.attempts} + 1, 1000) end`,
      expiresAt: sql`case when ${loginLimits.expiresAt} <= ${now} then ${expiration} else ${loginLimits.expiresAt} end`,
    },
  }).returning({ attempts: loginLimits.attempts });
  if (limit.attempts > 8) throw new AppError(429, "Too many attempts. Please wait 15 minutes before trying again.");
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const verified = await verifyPassword(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !user.active || !verified) throw new AppError(401, "The username or password is incorrect.");

  const raw = randomBytes(32).toString("hex");
  const old = (await cookies()).get(COOKIE)?.value || "";
  await db.transaction(async (tx) => {
    if (isToken(old)) await tx.delete(authSessions).where(eq(authSessions.hash, hashToken(old)));
    await tx.delete(authSessions).where(lt(authSessions.expiresAt, now));
    await tx.delete(loginLimits).where(eq(loginLimits.key, key));
    await tx.delete(loginLimits).where(lt(loginLimits.expiresAt, now));
    await tx.insert(authSessions).values({ hash: hashToken(raw), userId: user.id, expiresAt: new Date(now.getTime() + SESSION_MS) });
  });
  const response = NextResponse.json({ redirect: `/${user.role}` }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(COOKIE, raw, { path: "/", httpOnly: true, sameSite: "lax", secure: secureRequest(request), maxAge: SESSION_MS / 1000 });
  return response;
}
function secureRequest(request: Request) {
  return [process.env.APP_ORIGIN, request.headers.get("origin"), request.url].some((value) => value?.startsWith("https://")) ||
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
}
export async function signOut(request: Request) {
  const session = await authorizeWrite(request);
  await db.delete(authSessions).where(eq(authSessions.hash, session.hash));
  const response = NextResponse.json({ redirect: "/login" }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", secure: secureRequest(request), maxAge: 0 });
  return response;
}

export function apiError(error: unknown) {
  const headers = { "Cache-Control": "no-store" };
  if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  const cause = (error as { cause?: { code?: string }; code?: string })?.cause?.code || (error as { code?: string })?.code;
  if (cause === "23505") return NextResponse.json({ error: "That record already exists. Use a different name, ID, or placement." }, { status: 409, headers });
  if (cause === "23503") return NextResponse.json({ error: "That record is linked to other records or is not available for this event." }, { status: 409, headers });
  if (cause === "23514") return NextResponse.json({ error: "The record did not meet the required dates, values, or relationships." }, { status: 400, headers });
  console.error("MMA request failed", { name: error instanceof Error ? error.name : "unknown", code: cause });
  return NextResponse.json({ error: "The request could not be completed. Please try again." }, { status: 500, headers });
}

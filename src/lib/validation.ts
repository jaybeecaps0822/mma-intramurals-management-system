import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { AppError } from "@/lib/auth";
import { hashPassword, normalizeUsername, validPassword, validUsername } from "@/lib/password";

export type Payload = Record<string, unknown>;
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const fail = (message: string, status = 400): never => { throw new AppError(status, message); };
export function text(d: Payload, k: string, max = 150, required = true): string {
  const value = typeof d[k] === "string" ? d[k].trim() : "";
  if ((required && !value) || value.length > max || value.includes("\0")) fail(`Enter a valid ${fieldNames[k] || k}.`);
  return value;
}
const fieldNames: Record<string, string> = { firstName: "first name", lastName: "last name", startTime: "start time", endTime: "end time", studentId: "student", houseId: "house", sportId: "sport", venueId: "venue", schoolYear: "school year" };
export function integer(d: Payload, k: string, min = 1, max = 2147483647) {
  const raw = d[k];
  const value = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`Choose a valid ${fieldNames[k] || k} (${min}–${max}).`);
  return value;
}
export function optionalId(d: Payload, k = "id") { return d[k] == null || d[k] === "" || d[k] === 0 || d[k] === "0" ? null : integer(d, k); }
export const flag = (d: Payload, k: string) => d[k] === true || d[k] === "on" || d[k] === "true" || d[k] === "1";
export function oneOf<const T extends readonly string[]>(d: Payload, k: string, values: T): T[number] {
  const value = text(d, k, 40);
  if (!values.includes(value)) fail(`Choose a valid ${k}.`);
  return value;
}
export function date(d: Payload, k: string) {
  const value = text(d, k, 10);
  if (!/^\d{4}-\d\d-\d\d$/.test(value) || !Number.isFinite(Date.parse(value)) || !new Date(`${value}T12:00Z`).toISOString().startsWith(value) || value < "2000-01-01" || value > "2200-12-31") fail(`Enter a valid ${k}.`);
  return value;
}
export function time(d: Payload, k: string, required = true) {
  const value = text(d, k, 5, required);
  if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail(`Enter a valid ${fieldNames[k] || k}.`);
  return value;
}
export function email(d: Payload, k = "email") {
  const value = text(d, k, 254, false);
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail("Enter a valid email address.");
  return value || null;
}
export function username(d: Payload, k = "username") {
  const name = normalizeUsername(text(d, k, 80));
  if (!validUsername(name)) fail("Use 3–80 letters, numbers, or . _ @ - for the username or student ID.");
  return name;
}
export async function password(d: Payload, required = false) {
  if ((d.password === undefined || d.password === "") && !required) return null;
  if (typeof d.password !== "string" || !validPassword(d.password)) return fail("Use a password with at least 12 characters and at most 256 bytes.");
  return hashPassword(d.password);
}
export function idList(d: Payload, k: string) {
  const value = d[k];
  if (!Array.isArray(value) || value.length > 80) return fail(`Choose valid ${k}.`);
  return [...new Set(value.map((v) => integer({ [k]: v }, k)))];
}
export async function eventFor(tx: Tx, eventId: number, mutable = false, lock: "share" | "update" = "share") {
  const [e] = await tx.select().from(s.intramurals).where(eq(s.intramurals.id, eventId)).for(lock);
  if (!e) return fail("Choose an intramurals event first.", 404);
  if (mutable && e.state === "completed") fail("This season is archived. Historical assignments and schedules cannot be changed.", 409);
  return e;
}
export function withinEvent(day: string, event: { startDate: string; endDate: string }) {
  if (day < event.startDate || day > event.endDate) fail("The date must be within the selected event.");
}
export async function requireMembership(tx: Tx, eventId: number, studentId: number) {
  const [row] = await tx.select().from(s.teamMembers).where(and(eq(s.teamMembers.eventId, eventId), eq(s.teamMembers.studentId, studentId)));
  if (!row) return fail("This student is not assigned to a house for the selected event.", 409);
  return row;
}
export async function audit(tx: Tx, actorId: number, action: string, entity: string, entityId: number | string, eventId?: number | null, reason?: string | null, snapshot?: unknown) {
  await tx.insert(s.auditLogs).values({ actorId, action, entity, entityId: String(entityId), eventId, reason, snapshot });
}

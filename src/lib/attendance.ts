import { randomBytes, randomInt } from "node:crypto";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import * as s from "@/db/schema";
import { hashToken, type Session } from "@/lib/auth";
import { getSchool } from "@/lib/data";
import { faceConfigured, pinDigest } from "@/lib/attendance-privacy";
import { syncSanction } from "@/lib/sanctions";
import { localDate, localTime, timeLabel, type AttendanceMethod } from "@/lib/model";
import * as v from "@/lib/validation";
import type { Payload } from "@/lib/validation";

function localInstant(day: string, time: string, timezone: string) {
  if (!time) return null;
  const target = Date.parse(`${day}T${time}:00Z`);
  let candidate = new Date(target);
  for (let i = 0; i < 4; i++) {
    const local = `${localDate(candidate, timezone)}T${localTime(candidate, timezone)}Z`;
    const delta = target - Date.parse(local);
    if (!delta) return candidate;
    candidate = new Date(candidate.getTime() + delta);
  }
  return v.fail("That local time is not valid in the configured school time zone.");
}

export function attendanceExpiry(now: Date, minutes: number, timezone: string) {
  const day = localDate(now, timezone);
  let left = now.getTime(), right = left + minutes * 60_000;
  if (localDate(new Date(right), timezone) === day) return new Date(right);
  while (right - left > 1) {
    const mid = Math.floor((left + right) / 2);
    if (localDate(new Date(mid), timezone) === day) left = mid;
    else right = mid;
  }
  return new Date(right);
}

export async function activeStudent(tx: v.Tx, owner: { userId: number } | { studentId: number }, allowDisabled = false) {
  const [student] = await tx.select({ id: s.students.id, name: s.users.name, number: s.students.studentNumber }).from(s.students)
    .innerJoin(s.users, eq(s.users.id, s.students.userId)).where(and("userId" in owner ? eq(s.students.userId, owner.userId) : eq(s.students.id, owner.studentId), allowDisabled ? undefined : eq(s.users.active, true))).for("share");
  if (!student) return v.fail("No active student account was found for this attendance credential.", 403);
  return student;
}

type Capture = { event: typeof s.intramurals.$inferSelect; studentId: number; date: string; type: "in" | "out"; method: AttendanceMethod; sessionId?: number; stationId?: number; timezone: string; now: Date };
export async function recordAttendance(tx: v.Tx, item: Capture) {
  const { event, studentId, date, type, method, sessionId, stationId, timezone, now } = item;
  v.withinEvent(date, event);
  await v.requireMembership(tx, event.id, studentId);
  const conditions = and(eq(s.attendance.eventId, event.id), eq(s.attendance.date, date), eq(s.attendance.studentId, studentId));
  if (type === "in") {
    const status = localTime(now, timezone) > event.cutoff ? "late" : "present";
    const [record] = await tx.insert(s.attendance).values({ eventId: event.id, studentId, date, timeIn: now, status, inSessionId: sessionId, inStationId: stationId, inMethod: method }).onConflictDoNothing().returning({ id: s.attendance.id });
    if (!record) return v.fail("You already have an attendance record for this date.", 409);
  } else {
    const [record] = await tx.update(s.attendance).set({ timeOut: now, outSessionId: sessionId, outStationId: stationId, outMethod: method, updatedAt: now }).where(and(conditions, isNotNull(s.attendance.timeIn), isNull(s.attendance.timeOut))).returning({ id: s.attendance.id });
    if (!record) {
      const [existing] = await tx.select({ timeOut: s.attendance.timeOut }).from(s.attendance).where(conditions);
      return v.fail(existing?.timeOut ? "You have already timed out for this date." : "You need a valid TIME IN before timing out.", 409);
    }
  }
  return { message: `TIME ${type.toUpperCase()} recorded at ${timeLabel(now.toISOString(), timezone)}.`, recordedAt: now.toISOString() };
}

export async function scanAttendance(session: Session, d: Payload) {
  if (session.role !== "student") return v.fail("Only students can submit attendance.", 403);
  const raw = v.text(d, "code", 70);
  if (!/^mma1\.[A-Za-z0-9_-]{43}$/.test(raw)) return v.fail("This is not a valid intramurals attendance QR code.");
  const tokenHash = hashToken(raw);
  const { timezone } = await getSchool();
  return db.transaction(async (tx) => {
    const [hint] = await tx.select({ eventId: s.attendanceSessions.eventId }).from(s.attendanceSessions).where(eq(s.attendanceSessions.tokenHash, tokenHash));
    if (!hint) return v.fail("This QR code is not recognized.", 404);
    const event = await v.eventFor(tx, hint.eventId);
    const [qr] = await tx.select().from(s.attendanceSessions).where(eq(s.attendanceSessions.tokenHash, tokenHash)).for("share");
    const now = new Date();
    if (event.state !== "active" || !qr || !qr.active || qr.expiresAt <= now || qr.date !== localDate(now, timezone)) return v.fail("This QR session has expired or closed. Ask the event staff for a new code.", 410);
    const student = await activeStudent(tx, { userId: session.id });
    return recordAttendance(tx, { event, studentId: student.id, date: qr.date, type: qr.type, method: "qr", sessionId: qr.id, timezone, now });
  });
}

export async function manageAttendance(action: string, actor: number, d: Payload) {
  if (!action.startsWith("attendance.")) return null;
  const eventId = v.integer(d, "eventId");
  const { timezone } = await getSchool();
  if (action === "attendance.generate") {
    const type = v.oneOf(d, "type", ["in", "out"]);
    const minutes = v.integer(d, "minutes", 1, 15);
    const withFace = v.flag(d, "withFace");
    if (withFace && !faceConfigured()) return v.fail("Face verification is not configured. The QR-only option is still available.", 503);
    const pin = withFace ? String(randomInt(1_000_000)).padStart(6, "0") : undefined;
    const facePinHash = pin ? pinDigest(eventId, pin) : null;
    const code = `mma1.${randomBytes(32).toString("base64url")}`;
    const image = await QRCode.toDataURL(code, { width: 380, margin: 3, errorCorrectionLevel: "M", color: { dark: "#111d33", light: "#ffffff" } });
    return db.transaction(async (tx) => {
      const event = await v.eventFor(tx, eventId, true, "update");
      const now = new Date();
      const date = localDate(now, timezone);
      if (event.state !== "active") return v.fail("Activate the event before opening an attendance session.", 409);
      v.withinEvent(date, event);
      const expiresAt = attendanceExpiry(now, minutes, timezone);
      if (expiresAt <= now) return v.fail("The attendance date has ended.", 409);
      await tx.update(s.attendanceSessions).set({ active: false }).where(and(eq(s.attendanceSessions.eventId, eventId), or(eq(s.attendanceSessions.type, type), facePinHash ? eq(s.attendanceSessions.facePinHash, facePinHash) : undefined), eq(s.attendanceSessions.active, true)));
      const [qr] = await tx.insert(s.attendanceSessions).values({ eventId, type, date, tokenHash: hashToken(code), facePinHash, expiresAt, createdBy: actor }).returning({ id: s.attendanceSessions.id });
      await v.audit(tx, actor, "Opened QR session", "Attendance session", qr.id, eventId, null, { type, date, withFace });
      return { message: "Attendance session opened.", id: qr.id, code, pin, image, expiresAt: expiresAt.toISOString(), type };
    });
  }
  if (action === "attendance.close") {
    const id = v.integer(d, "id");
    return db.transaction(async (tx) => {
      await v.eventFor(tx, eventId);
      const [updated] = await tx.update(s.attendanceSessions).set({ active: false }).where(and(eq(s.attendanceSessions.id, id), eq(s.attendanceSessions.eventId, eventId))).returning({ id: s.attendanceSessions.id });
      if (!updated) return v.fail("QR session not found.", 404);
      await v.audit(tx, actor, "Closed QR session", "Attendance session", id, eventId);
      return { message: "QR session closed." };
    });
  }
  if (action === "attendance.correct") {
    const date = v.date(d, "date"), studentId = v.integer(d, "studentId");
    const status = v.oneOf(d, "status", ["present", "late", "absent", "excused"]);
    const reason = v.text(d, "reason", 400);
    const timeIn = localInstant(date, v.time(d, "timeIn", false), timezone);
    const timeOut = localInstant(date, v.time(d, "timeOut", false), timezone);
    const now = new Date();
    if (date > localDate(now, timezone) || (timeIn && timeIn > now) || (timeOut && timeOut > now)) return v.fail("Official attendance times cannot be in the future.");
    if (timeOut && (!timeIn || timeOut < timeIn)) return v.fail("TIME OUT must be after a valid TIME IN.");
    if ((status === "present" || status === "late") !== !!timeIn) return v.fail("Present and late records require TIME IN. Absent and excused records cannot contain times.");
    return db.transaction(async (tx) => {
      const event = await v.eventFor(tx, eventId, false, "update");
      if (event.state === "draft") return v.fail("Attendance cannot be recorded for a draft event.");
      v.withinEvent(date, event);
      await v.requireMembership(tx, eventId, studentId);
      const [before] = await tx.select().from(s.attendance).where(and(eq(s.attendance.studentId, studentId), eq(s.attendance.eventId, eventId), eq(s.attendance.date, date)));
      const patch = { timeIn, timeOut, status, inSessionId: null, outSessionId: null, inStationId: null, outStationId: null, inMethod: timeIn ? "manual" as const : null, outMethod: timeOut ? "manual" as const : null, updatedAt: now };
      const [after] = await tx.insert(s.attendance).values({ eventId, studentId, date, ...patch }).onConflictDoUpdate({ target: [s.attendance.studentId, s.attendance.eventId, s.attendance.date], set: patch }).returning();
      await syncSanction(tx, actor, after, reason);
      await v.audit(tx, actor, "Corrected attendance", "Attendance", after.id, eventId, reason, { before: before || null, after });
      return { message: after.sanctionEligible ? "Attendance corrected, logged, and sanctions reconciled." : "Attendance corrected and logged." };
    });
  }
  return null;
}

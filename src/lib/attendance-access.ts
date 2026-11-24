import { randomInt, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import type { Session } from "@/lib/auth";
import { activeStudent, attendanceExpiry, recordAttendance } from "@/lib/attendance";
import { attendanceLimit, cardDigest, encryptFace, faceConfigured, matchesFace, pinDigest, purgeExpiredFaces, rfidConfigured } from "@/lib/attendance-privacy";
import { FACE_VERSION, makeFaceTemplate } from "@/lib/face-engine";
import { localDate } from "@/lib/model";
import * as v from "@/lib/validation";

const DAY = 86_400_000;
const pendingDuration = 15 * 60_000;
const enrollmentDuration = 180 * DAY;

export async function rfidAction(action: string, operator: Session, d: v.Payload, timezone: string) {
  if (!action.startsWith("rfid.")) return null;
  if (operator.role !== "admin") return v.fail("The RFID station is staff-operated.", 403);
  if (action === "rfid.bind" || action === "rfid.revoke") {
    const studentId = v.integer(d, "studentId");
    const digest = action === "rfid.bind" ? cardDigest(v.text(d, "uid", 96)) : null;
    return db.transaction(async (tx) => {
      const student = await activeStudent(tx, { studentId }, action === "rfid.revoke");
      if (digest) {
        const [existing] = await tx.select({ studentId: s.rfidCards.studentId }).from(s.rfidCards).where(eq(s.rfidCards.digest, digest));
        if (existing && existing.studentId !== studentId) return v.fail("This card is assigned to another student. Revoke the old assignment first.", 409);
        await tx.insert(s.rfidCards).values({ studentId, digest, issuedBy: operator.id }).onConflictDoUpdate({ target: s.rfidCards.studentId, set: { digest, issuedBy: operator.id, issuedAt: new Date() } });
      } else await tx.delete(s.rfidCards).where(eq(s.rfidCards.studentId, studentId));
      await v.audit(tx, operator.id, digest ? "Assigned RFID card" : "Revoked RFID card", "Student", studentId);
      return { message: digest ? `Card assigned to ${student.name}.` : "Card revoked. QR attendance is still available." };
    });
  }
  if (action === "rfid.open") {
    if (!rfidConfigured()) return v.fail("RFID is not configured. Contact your system administrator.", 503);
    const eventId = v.integer(d, "eventId"), type = v.oneOf(d, "type", ["in", "out"]);
    return db.transaction(async (tx) => {
      const event = await v.eventFor(tx, eventId, true, "update");
      if (event.state !== "active") return v.fail("Activate the event before opening a station.", 409);
      const now = new Date(), date = localDate(now, timezone);
      v.withinEvent(date, event);
      await tx.update(s.rfidStations).set({ active: false }).where(and(eq(s.rfidStations.operatorId, operator.id), eq(s.rfidStations.active, true)));
      const expiresAt = attendanceExpiry(now, 45, timezone);
      const [station] = await tx.insert(s.rfidStations).values({ eventId, type, date, operatorId: operator.id, operatorSession: operator.hash, expiresAt }).returning({ id: s.rfidStations.id });
      await v.audit(tx, operator.id, "Opened RFID station", "RFID station", station.id, eventId, null, { date, type });
      return { message: `RFID TIME ${type.toUpperCase()} station ready.`, id: station.id, expiresAt: expiresAt.toISOString(), type };
    });
  }
  if (action === "rfid.close" || action === "rfid.scan") {
    const eventId = v.integer(d, "eventId"), stationId = v.integer(d, "stationId");
    const digest = action === "rfid.scan" ? cardDigest(v.text(d, "uid", 96)) : null;
    if (digest) await attendanceLimit("rfid", operator.id, 180, 60_000);
    return db.transaction(async (tx) => {
      const event = await v.eventFor(tx, eventId);
      const filter = and(eq(s.rfidStations.id, stationId), eq(s.rfidStations.eventId, eventId), eq(s.rfidStations.operatorId, operator.id), eq(s.rfidStations.operatorSession, operator.hash));
      if (!digest) {
        const [station] = await tx.update(s.rfidStations).set({ active: false }).where(filter).returning({ id: s.rfidStations.id });
        if (!station) return v.fail("Station not found for this session.", 404);
        await v.audit(tx, operator.id, "Closed RFID station", "RFID station", stationId, eventId);
        return { message: "RFID station closed." };
      }
      const [station] = await tx.select().from(s.rfidStations).where(filter).for("share");
      const now = new Date();
      if (!station || !station.active || station.expiresAt <= now || station.date !== localDate(now, timezone) || event.state !== "active") return v.fail("This station is closed or expired. Start a new RFID station.", 410);
      const [card] = await tx.select({ studentId: s.rfidCards.studentId }).from(s.rfidCards).where(eq(s.rfidCards.digest, digest)).for("share");
      if (!card) return v.fail("Card not recognized. Assign the card in Attendance → Credentials.", 404);
      const student = await activeStudent(tx, { studentId: card.studentId });
      const result = await recordAttendance(tx, { event, studentId: student.id, date: station.date, type: station.type, method: "rfid", stationId, timezone, now });
      return { ...result, studentName: student.name, studentNumber: student.number };
    });
  }
  return null;
}

function approvalCode(value: unknown) {
  if (typeof value !== "string" || !/^\d{8}$/.test(value.trim())) return v.fail("Enter the eight-digit review code shown on the student's device.");
  return value.trim();
}
function facePin(value: unknown) {
  if (typeof value !== "string" || !/^\d{6}$/.test(value.trim())) return v.fail("Enter the six-digit attendance PIN displayed by event staff.");
  return value.trim();
}

export async function faceUpload(action: "face.enroll" | "face.verify", session: Session, form: FormData, timezone: string) {
  if (session.role !== "student") return v.fail("Only signed-in students can capture their own face.", 403);
  if (!faceConfigured()) return v.fail("Face verification is not enabled. Use QR or the staffed RFID station.", 503);
  const frame = form.get("frame");
  if (!(frame instanceof File)) return v.fail("Capture an image with your camera.");
  const start = new Date();
  const [student] = await db.select({ id: s.students.id }).from(s.students).innerJoin(s.users, eq(s.users.id, s.students.userId)).where(and(eq(s.students.userId, session.id), eq(s.users.active, true)));
  if (!student) return v.fail("Your account is not linked to an active student profile.", 403);
  if (action === "face.enroll") {
    if (form.get("consent") !== "true") return v.fail("You must opt in before enrolling. QR and RFID do not require face data.");
    await purgeExpiredFaces(student.id);
    const [existing] = await db.select({ id: s.faceProfiles.studentId }).from(s.faceProfiles).where(eq(s.faceProfiles.studentId, student.id));
    if (existing) return v.fail("Delete the current face enrollment before creating a new one.", 409);
    await attendanceLimit("face-enroll", session.id, 6, 10 * 60_000);
    const vector = await makeFaceTemplate(frame);
    const reviewCode = String(randomInt(100_000_000)).padStart(8, "0");
    let encrypted: string;
    try { encrypted = encryptFace(student.id, FACE_VERSION, vector); } finally { vector.fill(0); }
    return db.transaction(async (tx) => {
      await activeStudent(tx, { userId: session.id });
      const now = new Date(), expiresAt = new Date(now.getTime() + pendingDuration);
      await tx.insert(s.faceProfiles).values({ studentId: student.id, template: encrypted, version: FACE_VERSION, consentedAt: now, expiresAt, reviewCode });
      await v.audit(tx, session.id, "Opted in to face verification", "Face enrollment", student.id);
      return { message: "Face enrollment captured. Have staff approve it in person within 15 minutes.", code: reviewCode, expiresAt: expiresAt.toISOString() };
    });
  }
  const eventId = v.integer({ eventId: form.get("eventId") }, "eventId");
  const pin = facePin(form.get("pin")), digest = pinDigest(eventId, pin);
  await attendanceLimit("face-verify", session.id, 12, 5 * 60_000);
  await purgeExpiredFaces(student.id);
  const [profile] = await db.select().from(s.faceProfiles).where(eq(s.faceProfiles.studentId, student.id));
  if (!profile?.approvedAt || profile.expiresAt <= start || profile.version !== FACE_VERSION) return v.fail("Enroll and have staff approve your face profile first.", 409);
  const [hint] = await db.select({ id: s.attendanceSessions.id, active: s.attendanceSessions.active, expiresAt: s.attendanceSessions.expiresAt, date: s.attendanceSessions.date }).from(s.attendanceSessions).where(and(eq(s.attendanceSessions.eventId, eventId), eq(s.attendanceSessions.facePinHash, digest), eq(s.attendanceSessions.active, true))).limit(1);
  if (!hint || hint.expiresAt <= start || hint.date !== localDate(start, timezone)) return v.fail("The attendance PIN is not active or has expired. Ask event staff for the current PIN.", 410);
  const vector = await makeFaceTemplate(frame);
  let matched: boolean;
  try { matched = matchesFace(student.id, profile.version, profile.template, vector); } finally { vector.fill(0); }
  if (!matched) return v.fail("Face could not be verified. Retake it in good lighting or use QR or RFID. This did not mark you absent.", 422);
  return db.transaction(async (tx) => {
    const event = await v.eventFor(tx, eventId);
    const [current] = await tx.select({ template: s.faceProfiles.template, approvedAt: s.faceProfiles.approvedAt, expiresAt: s.faceProfiles.expiresAt }).from(s.faceProfiles).where(eq(s.faceProfiles.studentId, student.id)).for("share");
    const [gate] = await tx.select().from(s.attendanceSessions).where(eq(s.attendanceSessions.id, hint.id)).for("share");
    const now = new Date();
    if (!current?.approvedAt || current.template !== profile.template || current.expiresAt <= now) return v.fail("Your face enrollment changed. Refresh and try again.", 409);
    if (!gate?.active || gate.facePinHash !== digest || gate.expiresAt <= now || gate.date !== localDate(now, timezone) || event.state !== "active") return v.fail("The attendance PIN has expired. Ask staff for the current PIN.", 410);
    await activeStudent(tx, { userId: session.id });
    return recordAttendance(tx, { event, studentId: student.id, date: gate.date, type: gate.type, method: "face", sessionId: gate.id, timezone, now });
  });
}

export async function faceAction(action: string, session: Session, d: v.Payload) {
  if (action !== "face.approve" && action !== "face.revoke" && action !== "face.withdraw" && action !== "face.purge") return null;
  const own = action === "face.withdraw";
  if ((own && session.role !== "student") || (!own && session.role !== "admin")) return v.fail("This action is not available to your role.", 403);
  if (action === "face.purge") {
    await purgeExpiredFaces();
    return { message: "Expired face templates were deleted." };
  }
  const targetId = own ? null : v.integer(d, "studentId");
  const code = action === "face.approve" ? approvalCode(d.code) : null;
  if (code) {
    if (!v.flag(d, "inPerson")) return v.fail("Confirm that the student showed their code and verified their identity in person.");
    await attendanceLimit("face-approve", session.id, 100, 10 * 60_000);
  }
  return db.transaction(async (tx) => {
    const student = await activeStudent(tx, own ? { userId: session.id } : { studentId: targetId! }, action === "face.revoke");
    const filter = eq(s.faceProfiles.studentId, student.id);
    if (code) {
      const [record] = await tx.select().from(s.faceProfiles).where(filter).for("update");
      const now = new Date();
      if (!record || !record.reviewCode || record.expiresAt <= now || record.version !== FACE_VERSION || !timingSafeEqual(Buffer.from(code), Buffer.from(record.reviewCode))) return v.fail("No matching pending enrollment. Have the student re-enroll if their code expired.", 409);
      await tx.update(s.faceProfiles).set({ reviewCode: null, approvedAt: now, approvedBy: session.id, expiresAt: new Date(now.getTime() + enrollmentDuration) }).where(filter);
      await v.audit(tx, session.id, "Approved face enrollment in person", "Face enrollment", student.id);
      return { message: "Face verification approved for 180 days. The student can withdraw at any time." };
    }
    const deleted = await tx.delete(s.faceProfiles).where(filter).returning({ id: s.faceProfiles.studentId });
    if (deleted.length) await v.audit(tx, session.id, own ? "Withdrew face consent" : "Revoked face enrollment", "Face enrollment", student.id);
    return { message: "Face template deleted. QR and RFID attendance remain available." };
  });
}

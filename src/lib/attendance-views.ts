import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { faceConfigured, rfidConfigured } from "@/lib/attendance-privacy";
import { FACE_VERSION } from "@/lib/face-engine";
import type { AttendanceAccess, FaceEnrollment, Role } from "@/lib/model";

export async function attendanceAccess(role: Role, eventId: number, day: string, profileId: number | undefined, houseIds: number[], section: string): Promise<AttendanceAccess> {
  const admin = role === "admin", student = role === "student";
  const recordsView = section === "attendance" || section === "sanctions" || (student && section === "overview");
  const credentialsView = admin && section === "attendance";
  const personalFace = student && (section === "face" || section === "attendance" || section === "overview");
  const [cards, profiles, [finalized], sanctions] = await Promise.all([
    credentialsView ? db.select({ studentId: s.rfidCards.studentId }).from(s.rfidCards) : Promise.resolve([]),
    credentialsView || personalFace ? db.select({ studentId: s.faceProfiles.studentId, approvedAt: s.faceProfiles.approvedAt, consentedAt: s.faceProfiles.consentedAt, expiresAt: s.faceProfiles.expiresAt, version: s.faceProfiles.version, reviewCode: student ? s.faceProfiles.reviewCode : sql<string | null>`null` })
      .from(s.faceProfiles).where(student ? eq(s.faceProfiles.studentId, profileId ?? -1) : undefined) : Promise.resolve([]),
    admin && section === "attendance" && eventId > 0 ? db.select({ finalizedAt: s.finalizedAttendanceDays.finalizedAt }).from(s.finalizedAttendanceDays).where(and(eq(s.finalizedAttendanceDays.eventId, eventId), eq(s.finalizedAttendanceDays.date, day))) : Promise.resolve([]),
    recordsView && eventId > 0 ? db.select({ id: s.attendanceSanctions.id, studentId: s.students.id, number: s.students.studentNumber, name: s.users.name, houseId: s.teamMembers.houseId, date: s.attendanceSanctions.date, amountCentavos: s.attendanceSanctions.amountCentavos, status: s.attendanceSanctions.status, reason: s.attendanceSanctions.reason })
      .from(s.attendanceSanctions).innerJoin(s.students, eq(s.students.id, s.attendanceSanctions.studentId)).innerJoin(s.users, eq(s.users.id, s.students.userId))
      .innerJoin(s.teamMembers, and(eq(s.teamMembers.eventId, s.attendanceSanctions.eventId), eq(s.teamMembers.studentId, s.attendanceSanctions.studentId)))
      .where(and(eq(s.attendanceSanctions.eventId, eventId), admin ? undefined : student ? eq(s.students.id, profileId ?? -1) : inArray(s.teamMembers.houseId, houseIds.length ? houseIds : [-1])))
      .orderBy(desc(s.attendanceSanctions.date), desc(s.attendanceSanctions.id)) : Promise.resolve([]),
  ]);
  const now = new Date();
  const enrollment = profiles.map((p): FaceEnrollment => {
    const state = p.expiresAt <= now || p.version !== FACE_VERSION ? "expired" : p.approvedAt ? "approved" : "pending";
    return { studentId: p.studentId, state, expiresAt: p.expiresAt.toISOString(), consentedAt: p.consentedAt.toISOString(), reviewCode: student && state === "pending" ? p.reviewCode || undefined : undefined };
  });
  return { rfidReady: rfidConfigured(), faceReady: faceConfigured(), rfidStudentIds: cards.map((c) => c.studentId), profiles: admin ? enrollment : [], myFace: student ? enrollment[0] || null : null,
    finalizedAt: finalized?.finalizedAt.toISOString() || null, sanctions: role === "adviser" ? sanctions.map((x) => ({ ...x, reason: null })) : sanctions };
}


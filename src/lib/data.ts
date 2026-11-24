import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import type { Session } from "@/lib/auth";
import { localDate, safePhotoUrl, type AttendanceRow, type Competition, type House, type Match, type Season, type Standing, type Student, type WorkspaceData } from "@/lib/model";
import { attendanceAccess } from "@/lib/attendance-views";
import { demoPublic } from "@/lib/demo";

const empty: Competition = { houses: [], sports: [], matches: [], standings: [], awards: [], announcements: [], gallery: [] };
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: string | undefined): v is string => !!v && ISO_DAY.test(v) && !Number.isNaN(Date.parse(v)) && new Date(`${v}T12:00Z`).toISOString().startsWith(v);
export async function getSchool() {
  const [settings] = await db.select().from(s.settings).where(eq(s.settings.key, "main"));
  return settings || { schoolName: "MMA", timezone: "Asia/Manila", logoUrl: null };
}
export function rankHouses(houses: House[], awards: Competition["awards"], points: WorkspaceData["points"], matches: Match[]): Standing[] {
  const sorted = houses.filter((h) => h.inSeason).map((h) => {
    const medals = awards.filter((a) => a.houseId === h.id);
    const wins = matches.filter((m) => m.status === "completed" && m.homeScore !== null && m.awayScore !== null && ((m.homeId === h.id && m.homeScore > m.awayScore) || (m.awayId === h.id && m.awayScore > m.homeScore))).length;
    return { houseId: h.id, gold: medals.filter((a) => a.placement === 1).length, silver: medals.filter((a) => a.placement === 2).length, bronze: medals.filter((a) => a.placement === 3).length, points: medals.reduce((total, a) => total + (points.find((p) => p.placement === a.placement)?.points || 0), 0), wins, rank: 0, name: h.name };
  }).sort((a, b) => b.points - a.points || b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.name.localeCompare(b.name));
  sorted.forEach((r, i) => {
    const p = sorted[i - 1];
    r.rank = p && r.points === p.points && r.gold === p.gold && r.silver === p.silver && r.bronze === p.bronze ? p.rank : i + 1;
  });
  return sorted.map(({ houseId, gold, silver, bronze, points, wins, rank }) => ({ houseId, gold, silver, bronze, points, wins, rank }));
}

async function loadCompetition(event: Season | null, visibility: "admin" | "member" | "public") {
  const eventId = event?.id ?? -1;
  if (!event && visibility !== "admin") return { ...empty, points: [] };
  const now = new Date();
  const [houseRows, sportRows, links, matchRows, awards, points, noticeRows, photos] = await Promise.all([
    db.select({ house: s.houses, inSeason: s.eventHouses.houseId }).from(s.houses).leftJoin(s.eventHouses, and(eq(s.eventHouses.eventId, eventId), eq(s.eventHouses.houseId, s.houses.id))).where(visibility === "admin" ? undefined : isNotNull(s.eventHouses.houseId)).orderBy(asc(s.houses.id)),
    db.select({ sport: s.sports, inSeason: s.eventSports.sportId }).from(s.sports).leftJoin(s.eventSports, and(eq(s.eventSports.eventId, eventId), eq(s.eventSports.sportId, s.sports.id))).where(visibility === "admin" ? undefined : isNotNull(s.eventSports.sportId)).orderBy(asc(s.sports.name)),
    db.select().from(s.sportHouses).where(eq(s.sportHouses.eventId, eventId)),
    db.select({ id: s.matches.id, sportId: s.matches.sportId, sport: s.sports.name, division: s.sports.division, stage: s.matches.stage, homeId: s.matches.homeId, awayId: s.matches.awayId, date: s.matches.date, startTime: s.matches.startTime, endTime: s.matches.endTime, venueId: s.venues.id, venue: s.venues.name, status: s.matches.status, officialId: s.matches.officialId, official: s.officials.name, format: s.matches.format, homeScore: s.matchScores.home, awayScore: s.matchScores.away })
      .from(s.matches).innerJoin(s.sports, eq(s.sports.id, s.matches.sportId)).innerJoin(s.venues, eq(s.venues.id, s.matches.venueId)).leftJoin(s.officials, eq(s.officials.id, s.matches.officialId)).leftJoin(s.matchScores, eq(s.matchScores.matchId, s.matches.id)).where(eq(s.matches.eventId, eventId)).orderBy(asc(s.matches.date), asc(s.matches.startTime), asc(s.matches.id)),
    db.select({ id: s.medalAwards.id, houseId: s.medalAwards.houseId, sportId: s.medalAwards.sportId, label: s.medalAwards.label, placement: s.medalAwards.placement }).from(s.medalAwards).where(eq(s.medalAwards.eventId, eventId)).orderBy(asc(s.medalAwards.sportId), asc(s.medalAwards.placement)),
    db.select({ placement: s.pointSettings.placement, points: s.pointSettings.points }).from(s.pointSettings).where(eq(s.pointSettings.eventId, eventId)).orderBy(asc(s.pointSettings.placement)),
    db.select({ id: s.announcements.id, title: s.announcements.title, body: s.announcements.body, audience: s.announcements.audience, pinned: s.announcements.pinned, publishedAt: s.announcements.publishedAt }).from(s.announcements)
      .where(and(eq(s.announcements.eventId, eventId), visibility === "admin" ? undefined : lte(s.announcements.publishedAt, now), visibility === "public" ? eq(s.announcements.audience, "public") : undefined)).orderBy(desc(s.announcements.pinned), desc(s.announcements.createdAt)),
    db.select({ id: s.galleryPhotos.id, url: s.galleryPhotos.url, caption: s.galleryPhotos.caption, published: s.galleryPhotos.published }).from(s.galleryPhotos).where(and(eq(s.galleryPhotos.eventId, eventId), visibility === "admin" ? undefined : eq(s.galleryPhotos.published, true))).orderBy(desc(s.galleryPhotos.id)),
  ]);
  const houses = houseRows.map(({ house: h, inSeason }) => ({ id: h.id, name: h.name, color: h.color, emblem: h.emblem, description: h.description, active: h.active, inSeason: inSeason !== null, members: 0, advisers: [] as string[], logoUrl: safePhotoUrl(h.logoUrl) }));
  const sports = sportRows.map(({ sport: x, inSeason }) => ({ id: x.id, name: x.name, category: x.category, division: x.division, kind: x.kind, description: x.description, rules: x.rules, active: x.active, inSeason: inSeason !== null, houseIds: links.filter((link) => link.sportId === x.id).map((link) => link.houseId) }));
  const matches = matchRows.map((m) => ({ ...m, official: visibility === "public" ? "" : m.official || "", officialId: visibility === "public" ? null : m.officialId }));
  const announcements = noticeRows.map((n) => ({ ...n, publishedAt: n.publishedAt?.toISOString() || null }));
  return { houses, sports, matches, awards, points, announcements, gallery: photos.filter((p) => safePhotoUrl(p.url)), standings: rankHouses(houses, awards, points, matches) };
}

export async function publicData(slug?: string) {
  const seasons = await db.select().from(s.intramurals).where(eq(s.intramurals.published, true)).orderBy(desc(s.intramurals.startDate));
  if (!seasons.length) return demoPublic(slug);
  const season = seasons.find((e) => e.slug === slug) || seasons.find((e) => e.state === "active") || seasons[0];
  return { season, seasons, competition: await loadCompetition(season, "public"), example: false };
}

export async function loadWorkspace(session: Session, slug?: string, selectedDay?: string, fromDay?: string, section = "overview"): Promise<WorkspaceData> {
  const admin = session.role === "admin";
  const studentRole = session.role === "student";
  const [school, [profile], [adviser], allSeasons] = await Promise.all([
    getSchool(),
    studentRole ? db.select({ id: s.students.id }).from(s.students).where(eq(s.students.userId, session.id)) : Promise.resolve([]),
    session.role === "adviser" ? db.select({ id: s.advisers.id }).from(s.advisers).where(eq(s.advisers.userId, session.id)) : Promise.resolve([]),
    db.select().from(s.intramurals).orderBy(desc(s.intramurals.startDate)),
  ]);
  const membership = admin ? [] : studentRole ? await db.select({ eventId: s.teamMembers.eventId, houseId: s.teamMembers.houseId }).from(s.teamMembers).where(eq(s.teamMembers.studentId, profile?.id ?? -1)) : await db.select({ eventId: s.houseAdvisers.eventId, houseId: s.houseAdvisers.houseId }).from(s.houseAdvisers).where(eq(s.houseAdvisers.adviserId, adviser?.id ?? -1));
  const seasons = admin ? allSeasons : allSeasons.filter((e) => membership.some((m) => m.eventId === e.id));
  const season = seasons.find((e) => e.slug === slug) || seasons.find((e) => e.state === "active") || seasons[0] || null;
  const eventId = season?.id || -1;
  const today = localDate(new Date(), school.timezone);
  const validEventDay = (value: string | undefined): value is string => isDay(value) && !!season && value >= season.startDate && value <= season.endDate;
  const day = validEventDay(selectedDay) ? selectedDay : season ? today > season.endDate ? season.endDate : today < season.startDate ? season.startDate : today : today;
  const from = validEventDay(fromDay) && fromDay <= day && (Date.parse(day) - Date.parse(fromDay)) / 86400000 <= 30 ? fromDay : day;
  const scoped = membership.filter((m) => m.eventId === eventId).map((m) => m.houseId);
  const memberScope = inArray(s.teamMembers.houseId, scoped.length ? scoped : [-1]);
  const [competition, studentRows, adviserRows, assignments, venues, officials, roster, records, sessions, accounts, audit, access] = await Promise.all([
    loadCompetition(season, admin ? "admin" : "member"),
    db.select({ student: s.students, name: s.users.name, email: s.users.email, active: s.users.active, houseId: s.teamMembers.houseId, assignedAt: s.teamMembers.assignedAt }).from(s.students)
      .innerJoin(s.users, eq(s.users.id, s.students.userId)).leftJoin(s.teamMembers, and(eq(s.teamMembers.eventId, eventId), eq(s.teamMembers.studentId, s.students.id)))
      .where(admin ? undefined : studentRole ? sql`(${s.students.id} = ${profile?.id ?? -1} or (${memberScope} and ${s.users.active}))` : memberScope).orderBy(asc(s.students.lastName), asc(s.students.firstName)),
    db.select({ id: s.advisers.id, userId: s.users.id, name: s.users.name, username: s.users.username, department: s.advisers.department, email: s.users.email, active: s.users.active }).from(s.advisers).innerJoin(s.users, eq(s.users.id, s.advisers.userId)).orderBy(asc(s.users.name)),
    db.select().from(s.houseAdvisers).where(eq(s.houseAdvisers.eventId, eventId)),
    admin ? db.select().from(s.venues).orderBy(asc(s.venues.name)) : Promise.resolve([]),
    admin ? db.select().from(s.officials).orderBy(asc(s.officials.name)) : Promise.resolve([]),
    db.select({ studentId: s.athleteSports.studentId, sportId: s.athleteSports.sportId }).from(s.athleteSports).innerJoin(s.teamMembers, and(eq(s.teamMembers.eventId, s.athleteSports.eventId), eq(s.teamMembers.studentId, s.athleteSports.studentId)))
      .where(and(eq(s.athleteSports.eventId, eventId), admin ? undefined : studentRole ? eq(s.athleteSports.studentId, profile?.id ?? -1) : memberScope)),
    db.select({ studentId: s.attendance.studentId, date: s.attendance.date, status: s.attendance.status, timeIn: s.attendance.timeIn, timeOut: s.attendance.timeOut, inMethod: s.attendance.inMethod, outMethod: s.attendance.outMethod }).from(s.attendance).innerJoin(s.teamMembers, and(eq(s.teamMembers.eventId, s.attendance.eventId), eq(s.teamMembers.studentId, s.attendance.studentId)))
      .where(and(eq(s.attendance.eventId, eventId), studentRole ? eq(s.attendance.studentId, profile?.id ?? -1) : gte(s.attendance.date, from), studentRole || admin ? undefined : memberScope, studentRole ? undefined : lte(s.attendance.date, day))).orderBy(desc(s.attendance.date)),
    admin ? db.select({ id: s.attendanceSessions.id, date: s.attendanceSessions.date, type: s.attendanceSessions.type, expiresAt: s.attendanceSessions.expiresAt, active: s.attendanceSessions.active }).from(s.attendanceSessions).where(eq(s.attendanceSessions.eventId, eventId)).orderBy(desc(s.attendanceSessions.id)).limit(20) : Promise.resolve([]),
    admin ? db.select({ id: s.users.id, role: s.users.role, name: s.users.name, username: s.users.username, active: s.users.active }).from(s.users).orderBy(asc(s.users.name)) : Promise.resolve([]),
    admin ? db.select({ id: s.auditLogs.id, actor: s.users.name, action: s.auditLogs.action, entity: s.auditLogs.entity, reason: s.auditLogs.reason, date: s.auditLogs.createdAt }).from(s.auditLogs).innerJoin(s.users, eq(s.users.id, s.auditLogs.actorId)).orderBy(desc(s.auditLogs.id)).limit(80) : Promise.resolve([]),
    attendanceAccess(session.role, eventId, day, profile?.id, scoped, section),
  ]);
  const advisers = adviserRows.map((a) => ({ ...a, email: studentRole ? "" : a.email || "", username: studentRole ? "" : a.username, houseIds: assignments.filter((x) => x.adviserId === a.id && (admin || scoped.includes(x.houseId))).map((x) => x.houseId) })).filter((a) => admin || (a.active && a.houseIds.length));
  const students: Student[] = studentRows.map(({ student: p, name, email, active, houseId }) => {
    const canSeeContacts = !studentRole || p.id === profile?.id;
    return { id: p.id, userId: canSeeContacts ? p.userId : 0, name, number: canSeeContacts ? p.studentNumber : "", firstName: p.firstName, middleName: canSeeContacts ? p.middleName || "" : "", lastName: p.lastName, course: p.course, year: p.yearLevel, gender: canSeeContacts ? p.gender || "" : "", email: canSeeContacts ? email || "" : "", phone: canSeeContacts ? p.phone || "" : "", photoUrl: canSeeContacts ? safePhotoUrl(p.photoUrl) : null, active, houseId };
  });
  const members = students.filter((m) => m.houseId !== null && (m.active || season?.state === "completed"));
  const attendanceMembers = studentRole ? members.filter((m) => m.id === profile?.id) : members;
  const houses = competition.houses.map((h) => ({ ...h, members: members.filter((m) => m.houseId === h.id).length, advisers: advisers.filter((a) => a.active && a.houseIds.includes(h.id)).map((a) => a.name) }));
  const assignmentDates = new Map(studentRows.flatMap(({ student, assignedAt }) => assignedAt ? [[student.id, localDate(assignedAt, school.timezone)] as const] : []));
  const recordsByDay = new Map(records.map((a) => [`${a.studentId}/${a.date}`, a]));
  const rowsFor = (date: string): AttendanceRow[] => attendanceMembers.map((m) => {
    const a = recordsByDay.get(`${m.id}/${date}`);
    const closed = date < today || season?.state === "completed";
    const absent = date <= today && season?.state !== "draft" && closed && (assignmentDates.get(m.id) || "9999") <= date;
    return { studentId: m.id, number: m.number, name: m.name, houseId: m.houseId, date, status: a?.status || (absent ? "absent" : "unrecorded"), timeIn: a?.timeIn?.toISOString() || null, timeOut: a?.timeOut?.toISOString() || null, inMethod: a?.inMethod, outMethod: a?.outMethod };
  });
  const range = [];
  for (let d = new Date(`${from}T12:00Z`); d.toISOString().slice(0, 10) <= day; d.setUTCDate(d.getUTCDate() + 1)) range.push(d.toISOString().slice(0, 10));
  const attendance = rowsFor(day);
  const own = attendanceMembers[0];
  const history: AttendanceRow[] = studentRole ? own ? records.map((a) => ({ ...a, number: own.number, name: own.name, houseId: own.houseId, timeIn: a.timeIn?.toISOString() || null, timeOut: a.timeOut?.toISOString() || null })) : [] : range.reverse().flatMap(rowsFor);
  const scopedHouseIds = admin ? houses.filter((h) => h.inSeason).map((h) => h.id) : scoped;
  const groups = houses.filter((h) => scopedHouseIds.includes(h.id)).map((h) => {
    const group = attendance.filter((a) => a.houseId === h.id);
    return { houseId: h.id, name: h.name, present: group.filter((a) => a.status === "present").length, absent: group.filter((a) => a.status === "absent").length, late: group.filter((a) => a.status === "late").length, excused: group.filter((a) => a.status === "excused").length, pending: group.filter((a) => !!a.timeIn && !a.timeOut).length };
  });
  const now = new Date();
  return {
    ...competition, houses, matches: session.role === "adviser" ? competition.matches.filter((m) => scoped.includes(m.homeId) || scoped.includes(m.awayId)) : competition.matches,
    role: session.role, viewer: { id: session.id, name: session.name, username: session.username }, preview: false, csrf: session.csrf, season, seasons, schoolName: school.schoolName, schoolLogoUrl: safePhotoUrl(school.logoUrl), timezone: school.timezone, today, day,
    students, advisers, accounts, scopedHouseIds, profileId: profile?.id ?? null, venues, officials, athletes: roster,
    attendance, history, groups, attendanceAccess: access, qrSessions: sessions.map((q) => ({ ...q, active: q.active && q.expiresAt > now, expiresAt: q.expiresAt.toISOString() })), audit: audit.map((a) => ({ ...a, date: a.date.toISOString() })),
    stats: { students: season ? members.length : students.filter((m) => m.active).length, houses: scopedHouseIds.length, advisers: advisers.filter((a) => a.active && (!season || a.houseIds.length)).length,
      sports: competition.sports.filter((x) => x.inSeason).length, present: groups.reduce((n, h) => n + h.present, 0), late: groups.reduce((n, h) => n + h.late, 0), absent: groups.reduce((n, h) => n + h.absent, 0), pending: groups.reduce((n, h) => n + h.pending, 0), excused: groups.reduce((n, h) => n + h.excused, 0) },
  };
}

import { and, eq, gt, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { DUMMY_HASH, normalizeUsername } from "@/lib/password";
import * as v from "@/lib/validation";
import type { Payload, Tx } from "@/lib/validation";

export function studentValues(d: Payload) {
  const login = v.username(d, "number");
  const number = v.text(d, "number", 80).toUpperCase();
  const firstName = v.text(d, "firstName", 75), lastName = v.text(d, "lastName", 75), middleName = v.text(d, "middleName", 75, false);
  const name = [firstName, middleName, lastName].filter(Boolean).join(" ");
  if (name.length > 150) v.fail("The full name must not exceed 150 characters.");
  return {
    login, name, email: v.email(d), student: { studentNumber: number, firstName, lastName, middleName: middleName || null,
      course: v.text(d, "course", 100), yearLevel: v.integer(d, "year", 1, 12), gender: v.text(d, "gender", 24, false) || null, phone: v.text(d, "phone", 32, false) || null },
  };
}

async function linkStudent(tx: Tx, eventId: number, studentId: number, houseId: number | null) {
  const [linked] = await tx.select({ houseId: s.teamMembers.houseId }).from(s.teamMembers).where(and(eq(s.teamMembers.eventId, eventId), eq(s.teamMembers.studentId, studentId))).for("update");
  if ((linked?.houseId ?? null) === houseId) return;
  if (linked) {
    const [record] = await tx.select({ id: s.attendance.id }).from(s.attendance).where(and(eq(s.attendance.eventId, eventId), eq(s.attendance.studentId, studentId))).limit(1);
    const [sport] = await tx.select({ sportId: s.athleteSports.sportId }).from(s.athleteSports).where(and(eq(s.athleteSports.eventId, eventId), eq(s.athleteSports.studentId, studentId))).limit(1);
    if (record || sport) v.fail("This assignment has attendance or sports history. It cannot be moved within this event.", 409);
  }
  if (houseId === null) await tx.delete(s.teamMembers).where(and(eq(s.teamMembers.eventId, eventId), eq(s.teamMembers.studentId, studentId)));
  else await tx.insert(s.teamMembers).values({ eventId, studentId, houseId }).onConflictDoUpdate({ target: [s.teamMembers.eventId, s.teamMembers.studentId], set: { houseId, assignedAt: new Date() } });
}

export async function registry(action: string, actor: number, d: Payload) {
  if (action === "student.save") {
    const parsed = studentValues(d);
    const id = v.optionalId(d), eventId = v.optionalId(d, "eventId");
    const hash = await v.password(d, !id);
    return db.transaction(async (tx) => {
      if (eventId) await v.eventFor(tx, eventId, true, "update");
      let studentId = id;
      const now = new Date();
      const active = v.flag(d, "active");
      if (!id) {
        const [user] = await tx.insert(s.users).values({ role: "student", username: parsed.login, name: parsed.name, email: parsed.email, passwordHash: hash!, active }).returning({ id: s.users.id });
        const [p] = await tx.insert(s.students).values({ ...parsed.student, userId: user.id }).returning({ id: s.students.id });
        studentId = p.id;
      } else {
        const [p] = await tx.select({ userId: s.students.userId, passwordHash: s.users.passwordHash }).from(s.students).innerJoin(s.users, eq(s.users.id, s.students.userId)).where(eq(s.students.id, id)).for("update");
        if (!p) return v.fail("Student not found.", 404);
        if (active && !hash && p.passwordHash === DUMMY_HASH) v.fail("Set an initial password before enabling an imported student.");
        await tx.update(s.students).set({ ...parsed.student, updatedAt: now }).where(eq(s.students.id, id));
        await tx.update(s.users).set({ username: parsed.login, name: parsed.name, email: parsed.email, active, passwordHash: hash || undefined, updatedAt: now }).where(eq(s.users.id, p.userId));
        if (!active || hash) await tx.delete(s.authSessions).where(eq(s.authSessions.userId, p.userId));
      }
      if (eventId) await linkStudent(tx, eventId, studentId!, v.optionalId(d, "houseId"));
      await v.audit(tx, actor, id ? "Updated student" : "Registered student", "Student", studentId!, eventId);
      return { message: id ? "Student updated." : "Student registered." };
    });
  }
  if (action === "house.save") {
    const id = v.optionalId(d), eventId = v.optionalId(d, "eventId");
    const color = v.text(d, "color", 7);
    if (!/^#[a-f\d]{6}$/i.test(color)) v.fail("Choose a valid house color.");
    const data = { name: v.text(d, "name", 100), color, emblem: v.oneOf(d, "emblem", ["shield", "flame", "waves", "leaf", "zap"]), description: v.text(d, "description", 1500, false), active: v.flag(d, "active"), updatedAt: new Date() };
    return db.transaction(async (tx) => {
      if (eventId) await v.eventFor(tx, eventId, true);
      const [house] = await (id ? tx.update(s.houses).set(data).where(eq(s.houses.id, id)).returning({ id: s.houses.id }) : tx.insert(s.houses).values(data).returning({ id: s.houses.id }));
      if (!house) return v.fail("House not found.", 404);
      if (eventId) {
        if (v.flag(d, "inSeason")) await tx.insert(s.eventHouses).values({ eventId, houseId: house.id }).onConflictDoNothing();
        else await tx.delete(s.eventHouses).where(and(eq(s.eventHouses.eventId, eventId), eq(s.eventHouses.houseId, house.id)));
      }
      await v.audit(tx, actor, id ? "Updated house" : "Created house", "House", house.id, eventId);
      return { message: "House saved." };
    });
  }
  if (action === "adviser.save" || action === "account.save") {
    const isAdviser = action === "adviser.save";
    const role = isAdviser ? "adviser" : "admin";
    const id = v.optionalId(d), eventId = isAdviser ? v.optionalId(d, "eventId") : null;
    const hash = await v.password(d, !id);
    const userRecord = { role, name: v.text(d, "name", 150), username: v.username(d), email: v.email(d), active: v.flag(d, "active"), updatedAt: new Date() } as const;
    const department = isAdviser ? v.text(d, "department", 100) : "";
    const houseIds = eventId ? v.idList(d, "houseIds") : [];
    return db.transaction(async (tx) => {
      if (eventId) await v.eventFor(tx, eventId, true);
      let entityId = id;
      if (!id) {
        const [user] = await tx.insert(s.users).values({ ...userRecord, passwordHash: hash! }).returning({ id: s.users.id });
        if (isAdviser) {
          const [row] = await tx.insert(s.advisers).values({ userId: user.id, department }).returning({ id: s.advisers.id });
          entityId = row.id;
        } else entityId = user.id;
      } else {
        const [adviser] = isAdviser ? await tx.select({ userId: s.advisers.userId }).from(s.advisers).where(eq(s.advisers.id, id)) : [{ userId: id }];
        if (!adviser) return v.fail("Adviser not found.", 404);
        if (adviser.userId === actor && !userRecord.active) v.fail("You cannot deactivate your own account.");
        const [updated] = await tx.update(s.users).set({ ...userRecord, passwordHash: hash || undefined }).where(and(eq(s.users.id, adviser.userId), eq(s.users.role, role))).returning({ id: s.users.id });
        if (!updated) return v.fail("Account not found.", 404);
        if (isAdviser) await tx.update(s.advisers).set({ department, updatedAt: new Date() }).where(eq(s.advisers.id, id));
        if (hash || !userRecord.active) await tx.delete(s.authSessions).where(eq(s.authSessions.userId, adviser.userId));
      }
      if (eventId) {
        await tx.delete(s.houseAdvisers).where(and(eq(s.houseAdvisers.eventId, eventId), eq(s.houseAdvisers.adviserId, entityId!)));
        if (houseIds.length) await tx.insert(s.houseAdvisers).values(houseIds.map((houseId) => ({ houseId, eventId, adviserId: entityId! })));
      }
      await v.audit(tx, actor, id ? "Updated account" : "Created account", isAdviser ? "Adviser" : "Administrator", entityId!, eventId);
      return { message: "Account saved." };
    });
  }
  if (action === "account.deactivate") {
    const id = v.integer(d, "id");
    const reason = v.text(d, "reason", 400);
    if (id === actor) v.fail("You cannot deactivate your own account.");
    return db.transaction(async (tx) => {
      const [u] = await tx.update(s.users).set({ active: false, updatedAt: new Date() }).where(eq(s.users.id, id)).returning({ id: s.users.id });
      if (!u) return v.fail("Account not found.", 404);
      await tx.delete(s.authSessions).where(eq(s.authSessions.userId, id));
      await v.audit(tx, actor, "Disabled account", "Account", id, null, reason);
      return { message: "Account deactivated and its sessions ended." };
    });
  }
  if (action === "season.save") {
    const id = v.optionalId(d);
    const startDate = v.date(d, "startDate"), endDate = v.date(d, "endDate");
    if (endDate < startDate) v.fail("The end date cannot precede the start date.");
    const title = v.text(d, "title", 150), slug = v.text(d, "slug", 80).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) v.fail("Event URL keys may contain only letters, numbers, and single hyphens.");
    const data = { title, slug, startDate, endDate, schoolYear: v.text(d, "schoolYear", 24), location: v.text(d, "location", 125), description: v.text(d, "description", 1500, false), state: v.oneOf(d, "state", ["draft", "active", "completed"]), cutoff: v.time(d, "cutoff"), published: v.flag(d, "published"), updatedAt: new Date() };
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(97131)`);
      if (id) {
        const previous = await v.eventFor(tx, id, false, "update");
        if (previous.state === "completed" && data.state !== "completed") v.fail("An archived event cannot be reopened.", 409);
        const outside = (column: typeof s.matches.date | typeof s.attendance.date) => or(lt(column, startDate), gt(column, endDate));
        const [game] = await tx.select({ id: s.matches.id }).from(s.matches).where(and(eq(s.matches.eventId, id), outside(s.matches.date))).limit(1);
        const [roll] = await tx.select({ id: s.attendance.id }).from(s.attendance).where(and(eq(s.attendance.eventId, id), outside(s.attendance.date))).limit(1);
        if (game || roll) v.fail("Existing matches or attendance fall outside the proposed dates.", 409);
      }
      if (data.state === "active") {
        const [active] = await tx.select({ id: s.intramurals.id }).from(s.intramurals).where(eq(s.intramurals.state, "active"));
        if (active && active.id !== id) v.fail("Close or draft the currently active event before activating another.", 409);
      }
      const [saved] = await (id ? tx.update(s.intramurals).set(data).where(eq(s.intramurals.id, id)).returning({ id: s.intramurals.id }) : tx.insert(s.intramurals).values(data).returning({ id: s.intramurals.id }));
      if (id) {
        await tx.update(s.attendanceSessions).set({ active: false }).where(eq(s.attendanceSessions.eventId, id));
        await tx.update(s.rfidStations).set({ active: false }).where(eq(s.rfidStations.eventId, id));
      }
      await v.audit(tx, actor, id ? "Updated event" : "Created event", "Event", saved.id, saved.id);
      return { message: "Intramurals event saved.", slug };
    });
  }
  return null;
}

export async function importStudents(actor: number, rows: Payload[], eventId: number | null) {
  if (!rows.length || rows.length > 500) return v.fail("Import between 1 and 500 student rows at a time.");
  const parsed = rows.map((row, i) => {
    try { return { ...studentValues(row), house: v.text(row, "house", 100, false) }; }
    catch (error) { return v.fail(`Row ${i + 2}: ${error instanceof Error ? error.message : "Invalid row."}`); }
  });
  if (new Set(parsed.map((r) => r.login)).size !== parsed.length) v.fail("The file contains duplicate student IDs.");
  return db.transaction(async (tx) => {
    if (eventId) await v.eventFor(tx, eventId, true, "update");
    const entries = await tx.select({ id: s.houses.id, name: s.houses.name }).from(s.eventHouses).innerJoin(s.houses, eq(s.houses.id, s.eventHouses.houseId)).where(eq(s.eventHouses.eventId, eventId || -1));
    const mapped = parsed.map((r) => {
      const house = entries.find((h) => normalizeUsername(h.name) === normalizeUsername(r.house));
      if (r.house && !house) v.fail(`House “${r.house}” is not enrolled in the selected event.`);
      return { ...r, houseId: house?.id };
    });
    const accounts = await tx.insert(s.users).values(mapped.map((r) => ({ username: r.login, name: r.name, email: r.email, role: "student" as const, active: false, passwordHash: DUMMY_HASH }))).returning({ id: s.users.id, username: s.users.username });
    const userIds = new Map(accounts.map((u) => [u.username, u.id]));
    const imported = await tx.insert(s.students).values(mapped.map((r) => ({ ...r.student, userId: userIds.get(r.login)! }))).returning({ id: s.students.id, userId: s.students.userId });
    const studentIds = new Map(imported.map((r) => [r.userId, r.id]));
    const assignments = mapped.flatMap((r) => r.houseId && eventId ? [{ eventId, houseId: r.houseId, studentId: studentIds.get(userIds.get(r.login)!)! }] : []);
    if (assignments.length) await tx.insert(s.teamMembers).values(assignments);
    await v.audit(tx, actor, "Imported students", "Student", "batch", eventId, null, { count: imported.length });
    return { message: `Imported ${imported.length} student${imported.length === 1 ? "" : "s"}. Set passwords and enable accounts to allow sign-in.` };
  });
}

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import * as s from "../src/db/schema";
import { hashPassword, normalizeUsername, validPassword, validUsername } from "../src/lib/password";
import { localDate } from "../src/lib/model";
import { sampleAdvisers, sampleAthletes, sampleHouses, sampleMatches, sampleNotices, sampleOfficials, sampleSports, sampleStudents, sampleVenues } from "../src/lib/demo";

const offsetDate = (day: string, offset: number) => new Date(Date.parse(`${day}T12:00Z`) + offset * 86400000).toISOString().slice(0, 10);
async function main() {
  const args = process.argv.slice(2);
  const username = normalizeUsername(process.env.MMA_ADMIN_USERNAME || "");
  const password = process.env.MMA_ADMIN_PASSWORD || "";
  const name = (process.env.MMA_ADMIN_NAME || "Intramurals Administrator").trim();
  const sample = args.includes("--sample");
  const samplePassword = process.env.MMA_SAMPLE_PASSWORD || "";
  if (args.some((arg) => arg !== "--sample") || !validUsername(username) || !validPassword(password) || !name || name.length > 150) throw new Error("Set MMA_ADMIN_USERNAME, MMA_ADMIN_PASSWORD (at least 12 characters), and optional MMA_ADMIN_NAME before running the setup command.");
  if (sample && (!validPassword(samplePassword) || samplePassword === password)) throw new Error("For --sample, set a separate MMA_SAMPLE_PASSWORD (at least 12 characters). Use only a disposable test database.");
  const [adminHash, sampleHash] = await Promise.all([hashPassword(password), sample ? hashPassword(samplePassword) : Promise.resolve("")]);
  await db.transaction(async (tx) => {
    await tx.insert(s.roles).values([{ key: "admin", label: "Administrator" }, { key: "student", label: "Student" }, { key: "adviser", label: "Team Adviser" }]).onConflictDoNothing();
    await tx.insert(s.settings).values({ key: "main", schoolName: "MMA", timezone: "Asia/Manila" }).onConflictDoNothing();
    const [admin] = await tx.insert(s.users).values({ role: "admin", username, name, passwordHash: adminHash }).onConflictDoNothing().returning({ id: s.users.id });
    if (!admin) throw new Error("That account already exists. Setup never replaces a password. Choose a different administrator username.");
    await tx.insert(s.auditLogs).values({ actorId: admin.id, action: "Provisioned administrator", entity: "Administrator", entityId: String(admin.id) });
    await tx.insert(s.houses).values(sampleHouses.map(({ name, color, emblem, description }) => ({ name, color, emblem, description }))).onConflictDoNothing();
    if (!sample) return;
    if ((await tx.select().from(s.intramurals).limit(1)).length) throw new Error("Sample seeding requires a disposable database without events.");
    const zone = "Asia/Manila", today = localDate(new Date(), zone);
    const sampleId = "training-season";
    const [event] = await tx.insert(s.intramurals).values({ slug: sampleId, title: "MMA Training Intramurals", schoolYear: `${today.slice(0, 4)}–${Number(today.slice(0, 4)) + 1}`, location: "MMA Sports Complex", description: "A fictional event for testing intramurals workflows.", startDate: offsetDate(today, -2), endDate: offsetDate(today, 3), state: "active", published: false }).returning();
    const houseRows = await tx.select().from(s.houses);
    const houseIds = new Map(sampleHouses.map((h) => [h.id, houseRows.find((x) => x.name === h.name)!.id]));
    await tx.insert(s.eventHouses).values([...houseIds.values()].map((houseId) => ({ eventId: event.id, houseId })));
    const sports = await tx.insert(s.sports).values(sampleSports.map(({ name, category, division, kind, description, rules }) => ({ name, category, division, kind, description, rules }))).returning();
    const sportIds = new Map(sampleSports.map((x) => [x.id, sports.find((sport) => sport.name === x.name)!.id]));
    await tx.insert(s.eventSports).values(sports.map((x) => ({ eventId: event.id, sportId: x.id })));
    await tx.insert(s.sportHouses).values(sports.flatMap((x) => [...houseIds.values()].map((houseId) => ({ eventId: event.id, sportId: x.id, houseId }))));
    const venueRows = await tx.insert(s.venues).values(sampleVenues.map(({ name, location }) => ({ name, location }))).returning();
    const officialRows = await tx.insert(s.officials).values(sampleOfficials.map(({ name }) => ({ name }))).returning();
    const studentIds = new Map<number, number>();
    for (const person of sampleStudents) {
      const [user] = await tx.insert(s.users).values({ username: normalizeUsername(person.number), role: "student", name: person.name, email: person.email, passwordHash: sampleHash }).returning();
      const [student] = await tx.insert(s.students).values({ userId: user.id, studentNumber: person.number, firstName: person.firstName, lastName: person.lastName, course: person.course, yearLevel: person.year }).returning();
      await tx.insert(s.teamMembers).values({ eventId: event.id, houseId: houseIds.get(person.houseId!)!, studentId: student.id, assignedAt: new Date(`${event.startDate}T00:00:00+08:00`) });
      studentIds.set(person.id, student.id);
      const yesterday = offsetDate(today, -1);
      if (person.id % 5 !== 0) await tx.insert(s.attendance).values({ eventId: event.id, studentId: student.id, date: yesterday, status: person.id % 5 === 1 ? "late" : "present", timeIn: new Date(`${yesterday}T${person.id % 5 === 1 ? "08:14" : "07:43"}:00+08:00`), timeOut: new Date(`${yesterday}T16:04:00+08:00`) });
    }
    for (const row of sampleAdvisers) {
      const [user] = await tx.insert(s.users).values({ username: row.username, role: "adviser", name: row.name, email: row.email, passwordHash: sampleHash }).returning();
      const [adviser] = await tx.insert(s.advisers).values({ userId: user.id, department: row.department }).returning();
      await tx.insert(s.houseAdvisers).values(row.houseIds.map((id) => ({ eventId: event.id, adviserId: adviser.id, houseId: houseIds.get(id)! })));
    }
    await tx.insert(s.athleteSports).values(sampleAthletes.map((a) => ({ eventId: event.id, studentId: studentIds.get(a.studentId)!, sportId: sportIds.get(a.sportId)! })));
    for (const sample of sampleMatches) {
      const [match] = await tx.insert(s.matches).values({ eventId: event.id, sportId: sportIds.get(sample.sportId)!, homeId: houseIds.get(sample.homeId)!, awayId: houseIds.get(sample.awayId)!, stage: sample.stage, format: sample.format, date: offsetDate(today, Number(sample.date.slice(8)) - 16), startTime: sample.startTime, endTime: sample.endTime, venueId: venueRows.find((x) => x.name === sample.venue)!.id, officialId: officialRows.find((x) => x.name === sample.official)?.id, status: sample.status }).returning();
      if (sample.homeScore !== null && sample.awayScore !== null) await tx.insert(s.matchScores).values({ matchId: match.id, home: sample.homeScore, away: sample.awayScore, recordedBy: admin.id });
    }
    await tx.insert(s.pointSettings).values([10, 6, 4].map((points, i) => ({ eventId: event.id, points, placement: i + 1 })));
    await tx.insert(s.medalAwards).values([2, 1, 3].map((house, i) => ({ eventId: event.id, sportId: sportIds.get(5)!, placement: i + 1, houseId: houseIds.get(house)!, label: "Open division" })));
    await tx.insert(s.announcements).values(sampleNotices.map((n) => ({ eventId: event.id, title: n.title, body: n.body, audience: n.audience, pinned: n.pinned, publishedAt: new Date(), createdBy: admin.id })));
  });
  console.log("Administrator created. Remove the setup passwords from your environment.");
  if (sample) console.log("Fictional test event added. Student: 2026-1001. Team adviser: msantos. These use your MMA_SAMPLE_PASSWORD.");
}
main().catch((error) => {
  console.error(error.cause ? "Setup failed. Check the database, schema, and username availability." : error.message);
  process.exitCode = 1;
}).finally(() => pool.end());

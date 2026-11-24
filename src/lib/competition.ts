import { and, eq, inArray, lt, gt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import * as v from "@/lib/validation";
import type { Payload, Tx } from "@/lib/validation";

async function matchResources(tx: Tx, input: typeof s.matches.$inferInsert) {
  const [place] = await tx.select().from(s.venues).where(and(eq(s.venues.id, input.venueId), eq(s.venues.active, true))).for("share");
  const [official] = input.officialId ? await tx.select().from(s.officials).where(and(eq(s.officials.id, input.officialId), eq(s.officials.active, true))).for("share") : [];
  const allowed = await tx.select().from(s.sportHouses).where(and(eq(s.sportHouses.eventId, input.eventId), eq(s.sportHouses.sportId, input.sportId), inArray(s.sportHouses.houseId, [input.homeId, input.awayId]))).for("share");
  if (!place || (input.officialId && !official)) v.fail("Choose an active venue and official.");
  if (input.homeId === input.awayId || allowed.length !== 2) v.fail("Choose two different houses registered for this sport.");
}
async function matchConflict(tx: Tx, input: typeof s.matches.$inferInsert, except?: number | null) {
  const [overlap] = await tx.select({ id: s.matches.id }).from(s.matches).where(and(
    eq(s.matches.date, input.date), lt(s.matches.startTime, input.endTime), gt(s.matches.endTime, input.startTime), ne(s.matches.status, "cancelled"),
    or(eq(s.matches.venueId, input.venueId), inArray(s.matches.homeId, [input.homeId, input.awayId]), inArray(s.matches.awayId, [input.homeId, input.awayId]), input.officialId ? eq(s.matches.officialId, input.officialId) : undefined),
    except ? ne(s.matches.id, except) : undefined,
  )).limit(1);
  if (overlap) v.fail(`Schedule conflict at ${input.startTime.slice(0, 5)}: a house, venue, or official is already booked.`, 409);
}
const scheduleLock = (tx: Tx) => tx.execute(sql`select pg_advisory_xact_lock(97132)`);

export async function competitionAction(action: string, actor: number, d: Payload) {
  if (action === "sport.save") {
    const id = v.optionalId(d), eventId = v.optionalId(d, "eventId");
    const inSeason = v.flag(d, "inSeason");
    const houseIds = inSeason && eventId ? v.idList(d, "houseIds") : [];
    const data = { name: v.text(d, "name", 100), category: v.text(d, "category", 70), division: v.oneOf(d, "division", ["male", "female", "mixed"]), kind: v.oneOf(d, "kind", ["individual", "team"]), description: v.text(d, "description", 1500, false), rules: v.text(d, "rules", 3000, false), active: v.flag(d, "active"), updatedAt: new Date() };
    return db.transaction(async (tx) => {
      if (eventId) await v.eventFor(tx, eventId, true, "update");
      const [sport] = await (id ? tx.update(s.sports).set(data).where(eq(s.sports.id, id)).returning() : tx.insert(s.sports).values(data).returning());
      if (!sport) return v.fail("Sport not found.", 404);
      if (eventId) {
        const athletes = await tx.select({ houseId: s.teamMembers.houseId }).from(s.athleteSports).innerJoin(s.teamMembers, and(eq(s.teamMembers.eventId, s.athleteSports.eventId), eq(s.teamMembers.studentId, s.athleteSports.studentId))).where(and(eq(s.athleteSports.eventId, eventId), eq(s.athleteSports.sportId, sport.id)));
        const links = await tx.select().from(s.sportHouses).where(and(eq(s.sportHouses.eventId, eventId), eq(s.sportHouses.sportId, sport.id)));
        if (athletes.some((x) => !houseIds.includes(x.houseId))) v.fail("A house with registered athletes cannot be removed from this sport.", 409);
        for (const link of links.filter((l) => !houseIds.includes(l.houseId))) await tx.delete(s.sportHouses).where(and(eq(s.sportHouses.eventId, eventId), eq(s.sportHouses.sportId, sport.id), eq(s.sportHouses.houseId, link.houseId)));
        if (inSeason) {
          await tx.insert(s.eventSports).values({ eventId, sportId: sport.id }).onConflictDoNothing();
          if (houseIds.length) await tx.insert(s.sportHouses).values(houseIds.map((houseId) => ({ eventId, sportId: sport.id, houseId }))).onConflictDoNothing();
        } else await tx.delete(s.eventSports).where(and(eq(s.eventSports.eventId, eventId), eq(s.eventSports.sportId, sport.id)));
      }
      await v.audit(tx, actor, id ? "Updated sport" : "Created sport", "Sport", sport.id, eventId);
      return { message: "Sport saved." };
    });
  }
  if (action === "sport.remove") {
    const id = v.integer(d, "id");
    return db.transaction(async (tx) => {
      const [link] = await tx.select().from(s.eventSports).where(eq(s.eventSports.sportId, id)).limit(1);
      if (link) return v.fail("This sport is linked to an event. Archive it instead to preserve history.", 409);
      const [sport] = await tx.delete(s.sports).where(eq(s.sports.id, id)).returning();
      if (!sport) return v.fail("Sport not found.", 404);
      await v.audit(tx, actor, "Removed unreferenced sport", "Sport", id);
      return { message: "Sport deleted." };
    });
  }
  if (action === "athlete.save" || action === "athlete.remove") {
    const eventId = v.integer(d, "eventId"), sportId = v.integer(d, "sportId"), studentId = v.integer(d, "studentId");
    return db.transaction(async (tx) => {
      await v.eventFor(tx, eventId, true, "update");
      const member = await v.requireMembership(tx, eventId, studentId);
      if (action === "athlete.save") {
        const [participating] = await tx.select().from(s.sportHouses).where(and(eq(s.sportHouses.eventId, eventId), eq(s.sportHouses.sportId, sportId), eq(s.sportHouses.houseId, member.houseId)));
        if (!participating) return v.fail("The student's house is not competing in this sport.", 409);
        await tx.insert(s.athleteSports).values({ eventId, sportId, studentId });
      } else await tx.delete(s.athleteSports).where(and(eq(s.athleteSports.eventId, eventId), eq(s.athleteSports.sportId, sportId), eq(s.athleteSports.studentId, studentId)));
      await v.audit(tx, actor, action === "athlete.save" ? "Registered athlete" : "Removed athlete from sport", "Student", studentId, eventId, null, { sportId });
      return { message: action === "athlete.save" ? "Athlete registered." : "Registration removed." };
    });
  }
  if (action === "venue.save" || action === "official.save") {
    const id = v.optionalId(d);
    const isVenue = action === "venue.save";
    const base = { name: v.text(d, "name", isVenue ? 100 : 125), active: v.flag(d, "active") };
    const location = isVenue ? v.text(d, "location", 125) : "";
    return db.transaction(async (tx) => {
      const [saved] = isVenue ? (id ? await tx.update(s.venues).set({ ...base, location }).where(eq(s.venues.id, id)).returning() : await tx.insert(s.venues).values({ ...base, location }).returning()) : (id ? await tx.update(s.officials).set(base).where(eq(s.officials.id, id)).returning() : await tx.insert(s.officials).values(base).returning());
      if (!saved) return v.fail("Record not found.", 404);
      await v.audit(tx, actor, id ? "Updated record" : "Created record", isVenue ? "Venue" : "Official", saved.id);
      return { message: `${isVenue ? "Venue" : "Official"} saved.` };
    });
  }
  if (action === "match.save") {
    const id = v.optionalId(d), eventId = v.integer(d, "eventId"), date = v.date(d, "date");
    const startTime = v.time(d, "startTime"), endTime = v.time(d, "endTime");
    if (endTime <= startTime) return v.fail("The match end time must be after its start time.");
    const input = { eventId, date, startTime, endTime, sportId: v.integer(d, "sportId"), homeId: v.integer(d, "homeId"), awayId: v.integer(d, "awayId"), venueId: v.integer(d, "venueId"), officialId: v.optionalId(d, "officialId"), stage: v.text(d, "stage", 80), format: v.oneOf(d, "format", ["single", "double", "round_robin"]), updatedAt: new Date() };
    return db.transaction(async (tx) => {
      await scheduleLock(tx);
      const event = await v.eventFor(tx, eventId, true);
      v.withinEvent(date, event);
      if (id) {
        const [old] = await tx.select().from(s.matches).where(and(eq(s.matches.id, id), eq(s.matches.eventId, eventId))).for("update");
        if (!old) return v.fail("Match not found.", 404);
        if (old.tournamentId && old.sportId !== input.sportId) v.fail("A generated fixture cannot change sports.");
        if (old.status === "completed" || old.status === "live") v.fail("A live or completed match can only be edited through Scores & Rankings.", 409);
        const [score] = await tx.select().from(s.matchScores).where(eq(s.matchScores.matchId, id));
        if (score && (old.homeId !== input.homeId || old.awayId !== input.awayId || old.sportId !== input.sportId)) v.fail("Teams and sports cannot be replaced after scores have been recorded.", 409);
      }
      await matchResources(tx, input);
      await matchConflict(tx, input, id);
      const [saved] = await (id ? tx.update(s.matches).set(input).where(eq(s.matches.id, id)).returning() : tx.insert(s.matches).values(input).returning());
      await v.audit(tx, actor, id ? "Updated schedule" : "Scheduled match", "Match", saved.id, eventId);
      return { message: "Match scheduled." };
    });
  }
  if (action === "tournament.generate") {
    const eventId = v.integer(d, "eventId"), sportId = v.integer(d, "sportId"), venueId = v.integer(d, "venueId"), officialId = v.optionalId(d, "officialId");
    const date = v.date(d, "date"), start = v.time(d, "startTime");
    const minutes = v.integer(d, "minutes", 10, 180), name = v.text(d, "name", 125);
    return db.transaction(async (tx) => {
      await scheduleLock(tx);
      const event = await v.eventFor(tx, eventId, true);
      v.withinEvent(date, event);
      const teams = (await tx.select({ id: s.sportHouses.houseId }).from(s.sportHouses).where(and(eq(s.sportHouses.eventId, eventId), eq(s.sportHouses.sportId, sportId))).orderBy(s.sportHouses.houseId)).map((x) => x.id);
      if (teams.length < 2 || teams.length > 8) return v.fail("Round robin generation requires two to eight participating houses.");
      if (teams.length % 2) teams.push(0);
      const [tournament] = await tx.insert(s.tournaments).values({ eventId, sportId, name, format: "round_robin" }).returning({ id: s.tournaments.id });
      let offset = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
      const clock = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
      let count = 0;
      for (let round = 0; round < teams.length - 1; round++) {
        for (let i = 0; i < teams.length / 2; i++) {
          const homeId = teams[i], awayId = teams[teams.length - 1 - i];
          if (!homeId || !awayId) continue;
          if (offset + minutes >= 1440) return v.fail("These fixtures cannot fit on the selected day. Start earlier or shorten each slot.");
          const input = { eventId, sportId, tournamentId: tournament.id, stage: `${name.slice(0, 64)} · Round ${round + 1}`, format: "round_robin" as const, homeId, awayId, date, startTime: clock(offset), endTime: clock(offset + minutes), venueId, officialId };
          await matchResources(tx, input);
          await matchConflict(tx, input);
          await tx.insert(s.matches).values(input);
          offset += minutes; count++;
        }
        teams.splice(1, 0, teams.pop()!);
      }
      await v.audit(tx, actor, "Generated round robin", "Tournament", tournament.id, eventId, null, { count });
      return { message: `Generated ${count} round-robin fixtures.` };
    });
  }
  if (action === "score.save") {
    const id = v.integer(d, "id"), eventId = v.integer(d, "eventId");
    const status = v.oneOf(d, "status", ["scheduled", "live", "completed", "cancelled"]);
    const reason = v.text(d, "reason", 400, false);
    const record = status === "live" || status === "completed";
    const home = record ? v.integer(d, "home", 0, 100000) : 0, away = record ? v.integer(d, "away", 0, 100000) : 0;
    return db.transaction(async (tx) => {
      await scheduleLock(tx);
      await v.eventFor(tx, eventId, false);
      const [match] = await tx.select().from(s.matches).where(and(eq(s.matches.id, id), eq(s.matches.eventId, eventId))).for("update");
      if (!match) return v.fail("Match not found.", 404);
      const [before] = await tx.select().from(s.matchScores).where(eq(s.matchScores.matchId, id));
      if (before && !reason) return v.fail("Enter a reason when updating a recorded score or status.");
      if (before && status === "scheduled") return v.fail("A match with recorded scores cannot be returned to the unpublished schedule.");
      if (match.status === "cancelled" && status !== "cancelled") await matchConflict(tx, match, id);
      if (status === "completed" && match.format !== "round_robin" && home === away) return v.fail("An elimination match needs a winner before completion.");
      await tx.update(s.matches).set({ status, updatedAt: new Date() }).where(eq(s.matches.id, id));
      if (record) {
        const patch = { home, away, recordedBy: actor, updatedAt: new Date() };
        await tx.insert(s.matchScores).values({ matchId: id, ...patch }).onConflictDoUpdate({ target: s.matchScores.matchId, set: patch });
      }
      await v.audit(tx, actor, "Saved score and status", "Match", id, eventId, reason || null, { before: { score: before || null, status: match.status }, after: { status, home: record ? home : null, away: record ? away : null } });
      return { message: "Match status and scores saved." };
    });
  }
  if (action === "award.save" || action === "award.remove") {
    const id = v.optionalId(d), eventId = v.integer(d, "eventId");
    return db.transaction(async (tx) => {
      await v.eventFor(tx, eventId, true);
      const data = action === "award.save" ? { eventId, sportId: v.integer(d, "sportId"), houseId: v.integer(d, "houseId"), placement: v.integer(d, "placement", 1, 100), label: v.text(d, "label", 100) } : null;
      const scope = and(eq(s.medalAwards.eventId, eventId), eq(s.medalAwards.id, id ?? -1));
      const [award] = data ? (id ? await tx.update(s.medalAwards).set(data).where(scope).returning() : await tx.insert(s.medalAwards).values(data).returning()) : await tx.delete(s.medalAwards).where(scope).returning();
      if (!award) return v.fail("Award not found.", 404);
      await v.audit(tx, actor, data ? "Saved placement" : "Removed placement", "Medal award", award.id, eventId, null, data || award);
      return { message: data ? "Placement saved. The standings have been updated." : "Placement removed." };
    });
  }
  if (action === "points.save") {
    const eventId = v.integer(d, "eventId"), placement = v.integer(d, "placement", 1, 100), points = v.integer(d, "points", 0, 10000);
    return db.transaction(async (tx) => {
      await v.eventFor(tx, eventId, true);
      await tx.insert(s.pointSettings).values({ eventId, placement, points }).onConflictDoUpdate({ target: [s.pointSettings.eventId, s.pointSettings.placement], set: { points } });
      await v.audit(tx, actor, "Updated competition points", "Placement", placement, eventId, null, { points });
      return { message: "Scoring rule saved. The standings have been updated." };
    });
  }
  return null;
}

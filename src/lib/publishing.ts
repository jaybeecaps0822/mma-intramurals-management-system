import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import * as v from "@/lib/validation";
import { getSchool } from "@/lib/data";
import type { Payload } from "@/lib/validation";

export async function publishingAction(action: string, actor: number, d: Payload) {
  if (action === "school.save") {
    const schoolName = v.text(d, "schoolName", 150), timezone = v.text(d, "timezone", 80);
    try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); }
    catch { return v.fail("Use a valid IANA time zone such as Asia/Manila."); }
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(97131)`);
      const previous = await getSchool();
      if (timezone !== previous.timezone) {
        const [active] = await tx.select({ id: s.intramurals.id }).from(s.intramurals).where(eq(s.intramurals.state, "active"));
        if (active) return v.fail("Close the active event before changing the school time zone.", 409);
      }
      const patch = { schoolName, timezone, updatedAt: new Date() };
      await tx.insert(s.settings).values({ key: "main", ...patch }).onConflictDoUpdate({ target: s.settings.key, set: patch });
      await v.audit(tx, actor, "Updated school settings", "Settings", "main");
      return { message: "School settings saved." };
    });
  }
  if (action === "notice.save" || action === "notice.remove") {
    const eventId = v.integer(d, "eventId"), id = v.optionalId(d);
    return db.transaction(async (tx) => {
      await v.eventFor(tx, eventId);
      let saved: { id: number } | undefined;
      if (action === "notice.remove") {
        [saved] = await tx.delete(s.announcements).where(and(eq(s.announcements.id, id ?? -1), eq(s.announcements.eventId, eventId))).returning({ id: s.announcements.id });
      } else {
        const data = { title: v.text(d, "title", 160), body: v.text(d, "body", 4000), audience: v.oneOf(d, "audience", ["public", "workspace"]), pinned: v.flag(d, "pinned"), publishedAt: v.flag(d, "publish") ? new Date() : null, updatedAt: new Date() };
        [saved] = await (id ? tx.update(s.announcements).set(data).where(and(eq(s.announcements.id, id), eq(s.announcements.eventId, eventId))).returning() : tx.insert(s.announcements).values({ ...data, eventId, createdBy: actor }).returning());
      }
      if (!saved) return v.fail("Announcement not found.", 404);
      await v.audit(tx, actor, action === "notice.remove" ? "Removed announcement" : "Saved announcement", "Announcement", saved.id, eventId);
      return { message: action === "notice.remove" ? "Announcement removed." : "Announcement saved." };
    });
  }
  return null;
}

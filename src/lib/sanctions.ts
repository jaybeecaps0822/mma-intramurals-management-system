import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ABSENCE_CENTAVOS, localDate } from "@/lib/model";
import * as v from "@/lib/validation";

const sanctionKey = (eventId: number, studentId: number, date: string) => and(eq(s.attendanceSanctions.eventId, eventId), eq(s.attendanceSanctions.studentId, studentId), eq(s.attendanceSanctions.date, date));
export async function syncSanction(tx: v.Tx, actor: number, after: typeof s.attendance.$inferSelect, reason: string) {
  if (!after.sanctionEligible) return;
  const filter = sanctionKey(after.eventId, after.studentId, after.date);
  const [record] = await tx.select().from(s.attendanceSanctions).where(filter).for("update");
  if (after.status === "absent") {
    if (!record) {
      await tx.insert(s.attendanceSanctions).values({ eventId: after.eventId, studentId: after.studentId, date: after.date, amountCentavos: ABSENCE_CENTAVOS, revisedBy: actor, reason });
    } else if (record.status === "voided" || record.status === "refund_due") {
      await tx.update(s.attendanceSanctions).set({ status: record.status === "refund_due" ? "settled" : "outstanding", revisedBy: actor, reason, updatedAt: new Date() }).where(filter);
    }
  } else if (record?.status === "outstanding" || record?.status === "settled") {
    await tx.update(s.attendanceSanctions).set({ status: record.status === "settled" ? "refund_due" : "voided", revisedBy: actor, reason, updatedAt: new Date() }).where(filter);
  }
}

export async function sanctionAction(action: string, actor: number, d: v.Payload, timezone: string) {
  if (action === "sanction.finalize") {
    const eventId = v.integer(d, "eventId"), date = v.date(d, "date");
    if (!v.flag(d, "confirmed")) return v.fail("Confirm that staff reviewed the selected roster and this day required attendance.");
    return db.transaction(async (tx) => {
      const event = await v.eventFor(tx, eventId, false, "update");
      if (event.state === "draft") return v.fail("Draft events cannot be finalized.", 409);
      v.withinEvent(date, event);
      if (date >= localDate(new Date(), timezone)) return v.fail("Only past attendance dates can be finalized.", 409);
      const [day] = await tx.insert(s.finalizedAttendanceDays).values({ eventId, date, finalizedBy: actor }).onConflictDoNothing().returning({ date: s.finalizedAttendanceDays.date });
      if (!day) return { message: "This day was already finalized. No duplicate sanctions were created." };
      // Freeze the roster evaluated for this day. A later import does not generate retroactive sanctions.
      const roster = await tx.execute(sql`
        insert into attendance (intramurals_id, student_id, attendance_date, status, sanction_eligible)
        select ${eventId}, tm.student_id, ${date}::date, 'absent'::attendance_status, true
        from team_members tm
        join students st on st.id = tm.student_id
        join users u on u.id = st.user_id
        where tm.intramurals_id = ${eventId} and u.active = true
          and ((tm.assigned_at at time zone ${timezone})::date <= ${date}::date or exists (
            select 1 from attendance a where a.intramurals_id = tm.intramurals_id and a.student_id = tm.student_id and a.attendance_date = ${date}::date
          ))
        on conflict (student_id,intramurals_id,attendance_date) do update set sanction_eligible = true
      `);
      if (!roster.rowCount) return v.fail("There are no eligible students on this date. Check event enrollment before finalizing.", 409);
      const sanctions = await tx.execute(sql`
        insert into attendance_sanctions (intramurals_id, student_id, attendance_date, amount_centavos, revised_by)
        select a.intramurals_id, a.student_id, a.attendance_date, ${ABSENCE_CENTAVOS}, ${actor}
        from attendance a where a.intramurals_id = ${eventId} and a.attendance_date = ${date}::date and a.sanction_eligible = true and a.status = 'absent'
        on conflict (student_id,intramurals_id,attendance_date) do nothing
      `);
      const count = sanctions.rowCount || 0;
      await v.audit(tx, actor, "Finalized attendance and assessed sanctions", "Attendance day", date, eventId, null, { count, roster: roster.rowCount, amountCentavos: ABSENCE_CENTAVOS });
      return { message: `Attendance finalized. ${count} ${count === 1 ? "sanction" : "sanctions"} recorded.` };
    });
  }
  if (action === "sanction.review") {
    const id = v.integer(d, "id"), eventId = v.integer(d, "eventId");
    const decision = v.oneOf(d, "decision", ["settle", "waive", "refund"]);
    const reason = v.text(d, "reason", 400);
    return db.transaction(async (tx) => {
      await v.eventFor(tx, eventId, false, "update");
      const filter = and(eq(s.attendanceSanctions.id, id), eq(s.attendanceSanctions.eventId, eventId));
      const [record] = await tx.select().from(s.attendanceSanctions).where(filter).for("update");
      if (!record) return v.fail("Sanction not found.", 404);
      if ((decision === "refund" && record.status !== "refund_due") || (decision !== "refund" && record.status !== "outstanding")) return v.fail("This sanction's status has changed. Refresh before recording a decision.", 409);
      const status = decision === "settle" ? "settled" : decision === "waive" ? "waived" : "voided";
      await tx.update(s.attendanceSanctions).set({ status, reason, revisedBy: actor, updatedAt: new Date() }).where(filter);
      await v.audit(tx, actor, decision === "refund" ? "Recorded external refund" : decision === "settle" ? "Recorded external settlement" : "Waived sanction", "Sanction", id, eventId, reason, { previous: record.status, status });
      return { id, message: decision === "refund" ? "External refund recorded." : decision === "settle" ? "External settlement recorded." : "Sanction waived." };
    });
  }
  return null;
}

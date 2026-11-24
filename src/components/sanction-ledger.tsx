"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BadgeCheck, CalendarDays, ClipboardCheck, Download, Receipt, ShieldCheck, Wallet } from "lucide-react";
import { ABSENCE_CENTAVOS, dateLabel, pesos, sanctionLabel, type Sanction, type SanctionStatus } from "@/lib/model";
import { Stat } from "@/components/overview";
import { Avatar, Badge, Empty, HouseName, Panel, Picker, SearchBox, SectionHeading, useWorkspace } from "@/components/ui";
import { downloadCsv } from "@/components/exports";

const tones: Record<SanctionStatus, string> = { outstanding: "red", settled: "green", waived: "blue", voided: "gray", refund_due: "gold" };
export function FinalizeAttendance() {
  const { data, open, href } = useWorkspace();
  if (data.role !== "admin") return null;
  const date = dateLabel(data.day), finalized = data.attendanceAccess.finalizedAt;
  const allowed = !!data.season && data.season.state !== "draft" && data.day < data.today;
  const outstandingToday = data.attendanceAccess.sanctions.filter((s) => s.date === data.day && s.status === "outstanding").length;
  function confirm() {
    open({ title: `Finalize ${date}?`, description: "The eligible roster will be recorded and each unexcused absence will receive one ₱50.00 sanction. Excused absences, late arrivals, and missing TIME OUT do not incur a sanction.", action: "sanction.finalize", payload: { eventId: data.season?.id, date: data.day }, fields: [{ name: "confirmed", label: "I reviewed the attendance and confirm that this day required attendance.", type: "checkbox", full: true, required: true }], submit: "Finalize and assess" });
  }
  return <section className="attendance-finalize panel"><span className="icon-tile tile-gold"><ClipboardCheck size={20} /></span><div><h2>{finalized ? "Attendance day finalized" : "Review and finalize this day"}</h2><p>{finalized ? `${date} · ${outstandingToday} outstanding ${outstandingToday === 1 ? "sanction" : "sanctions"}. Corrections update the ledger.` : allowed ? `${date} · Assess one ${pesos(ABSENCE_CENTAVOS)} sanction per unexcused absence after review.` : "Select a past event date after staff has reviewed missing or excused entries."}</p></div><div className="row-actions"><Link className="btn btn-sm" href={href("sanctions")}>View sanctions <ArrowRight size={14} /></Link>{!finalized && <button className="btn btn-primary btn-sm" type="button" disabled={!allowed} onClick={confirm}>Finalize day</button>}</div></section>;
}

export function SanctionsPage() {
  const { data, href, open } = useWorkspace();
  const [query, setQuery] = useState(""), [status, setStatus] = useState("all"), [house, setHouse] = useState("all"), [page, setPage] = useState(0);
  const student = data.role === "student", admin = data.role === "admin";
  const list = data.attendanceAccess.sanctions;
  const rows = list.filter((r) => `${r.name} ${r.number} ${r.date}`.toLowerCase().includes(query.toLowerCase().trim()) && (status === "all" || status === r.status) && (house === "all" || house === String(r.houseId)));
  const count = (state: SanctionStatus) => list.filter((s) => s.status === state).length;
  const sum = (state: SanctionStatus) => list.reduce((total, s) => total + (s.status === state ? s.amountCentavos : 0), 0);
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 15) - 1));
  function review(s: Sanction) {
    const refund = s.status === "refund_due";
    open({ title: refund ? "Record completed refund" : "Review attendance sanction", description: `${s.name} · ${dateLabel(s.date)} · ${pesos(s.amountCentavos)}. This records a staff decision only; no money is transferred by the app.`, action: "sanction.review", payload: { id: s.id, eventId: data.season?.id }, defaults: { decision: refund ? "refund" : "waive" }, fields: [
      { name: "decision", label: "Decision", type: "select", required: true, full: true, options: refund ? [{ value: "refund", label: "Confirm refund was handled outside the app" }] : [{ value: "waive", label: "Waive the sanction" }, { value: "settle", label: "Record settlement handled outside the app" }] },
      { name: "reason", label: refund ? "Refund reference or reason" : "Reason or settlement reference", type: "textarea", maxLength: 400, required: true },
    ], submit: "Record decision" });
  }
  function download() {
    downloadCsv("mma-attendance-sanctions.csv", ["Student ID", "Name", "House", "Date", "Amount PHP", "Status", "Review note"], rows.map((s) => [s.number, s.name, data.houses.find((h) => h.id === s.houseId)?.name, s.date, (s.amountCentavos / 100).toFixed(2), sanctionLabel[s.status], s.reason]));
  }
  return <><SectionHeading title={student ? "My Attendance Sanctions" : "Attendance Sanctions"} description={student ? "Review sanctions recorded for your finalized attendance days." : "Review the ₱50 absence ledger for the selected intramurals event."} actions={<><Link className="btn" href={href("attendance")}><CalendarDays size={16} /> Attendance records</Link>{!student && <button className="btn" onClick={download} disabled={!rows.length}><Download size={16} /> Export CSV</button>}</>} />
    <div className="stats-grid sanctions-stats"><Stat label="Outstanding balance" value={pesos(sum("outstanding"))} hint={`${count("outstanding")} open ${count("outstanding") === 1 ? "sanction" : "sanctions"}`} icon={Wallet} tone="gold" /><Stat label="Settled total" value={pesos(sum("settled"))} hint={`${count("settled")} recorded ${count("settled") === 1 ? "settlement" : "settlements"}`} icon={BadgeCheck} tone="green" /><Stat label="Waived or voided" value={count("waived") + count("voided")} hint={`${count("refund_due")} ${count("refund_due") === 1 ? "item needs" : "items need"} refund review`} icon={Receipt} tone="blue" /></div>
    <div className="panel sanction-policy"><span className="icon-tile tile-blue"><ShieldCheck size={19} /></span><div><h2>When a sanction applies</h2><p>One ₱50.00 sanction per unexcused absence, only after staff finalizes a required attendance day. Excused absences, lateness, failed scans, and missing TIME OUT are not charged. {student ? "If a record is wrong, contact your adviser or the intramurals office for review." : "The ledger does not process payments."}</p></div></div>
    <Panel title={student ? "My sanctions" : "Sanction ledger"} description={`${rows.length} ${rows.length === 1 ? "entry" : "entries"} · ${data.season?.title || "No event selected"}`} className="records-panel">
      <div className="filter-row">{!student && <><SearchBox value={query} change={(q) => { setQuery(q); setPage(0); }} placeholder="Search student or date…" /><Picker label="Filter sanctions by house" value={house} change={(value) => { setHouse(value); setPage(0); }} options={[{ value: "all", label: "All houses" }, ...data.houses.filter((h) => data.scopedHouseIds.includes(h.id)).map((h) => ({ value: h.id, label: h.name }))]} /></>}<Picker label="Filter sanctions by status" value={status} change={(value) => { setStatus(value); setPage(0); }} options={[{ value: "all", label: "All statuses" }, ...Object.entries(sanctionLabel).map(([value, label]) => ({ value, label }))]} /></div>
      {rows.length ? <><div className="table-wrap"><table className="data-table sanction-table"><thead><tr>{!student && <><th>Student</th><th>House</th></>}<th>Absence date</th><th>Amount</th><th>Status</th>{data.role !== "adviser" && <th>Review note</th>}{admin && <th>Review</th>}</tr></thead><tbody>{rows.slice(current * 15, current * 15 + 15).map((s) => <tr key={s.id}>{!student && <><td><span className="person-cell"><Avatar name={s.name} tone="navy" /><span><strong>{s.name}</strong><small>{s.number}</small></span></span></td><td><HouseName house={data.houses.find((h) => h.id === s.houseId)} /></td></>}<td>{dateLabel(s.date)}</td><td><strong>{pesos(s.amountCentavos)}</strong></td><td><Badge tone={tones[s.status]} dot>{sanctionLabel[s.status]}</Badge></td>{data.role !== "adviser" && <td className="ledger-note">{s.reason || "—"}</td>}{admin && <td>{s.status === "outstanding" || s.status === "refund_due" ? <button className="btn btn-sm" type="button" aria-label={`Review sanction for ${s.name}`} onClick={() => review(s)}>Review <ArrowRight size={14} /></button> : "—"}</td>}</tr>)}</tbody></table></div>{rows.length > 15 && <div className="table-footer"><span>Showing {current * 15 + 1}–{Math.min(current * 15 + 15, rows.length)} of {rows.length}</span><div><button className="btn btn-sm" disabled={!current} onClick={() => setPage(current - 1)}>Previous</button><button className="btn btn-sm" disabled={(current + 1) * 15 >= rows.length} onClick={() => setPage(current + 1)}>Next</button></div></div>}</> : <Empty title={list.length ? "No matching sanctions" : "No sanctions recorded"} hint={list.length ? "Try a different status, house, or search." : "Sanctions only appear after a reviewed attendance day is finalized."} />}
    </Panel></>;
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from "react";
import { ArrowRight, Camera, CircleCheck, ClipboardCheck, Clock3, Copy, Download, FileText, ImagePlus, Pencil, QrCode, ScanFace, ScanLine, ShieldCheck, UserMinus, UserRoundCheck, X } from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";
import { attendanceLabel, dateLabel, durationLabel, localTime, methodLabel, pesos, timeLabel, type AttendanceMethod, type AttendanceRow } from "@/lib/model";
import { AttendanceChart, Stat } from "@/components/overview";
import { Badge, Empty, HouseName, Panel, Picker, SearchBox, SectionHeading, Tabs, dateOptions, useWorkspace, type Result } from "@/components/ui";
import { downloadCsv, downloadReport } from "@/components/exports";
import { CredentialsPanel, RFIDStation } from "@/components/rfid-attendance";
import { FinalizeAttendance } from "@/components/sanction-ledger";

const statusOptions = [{ value: "all", label: "All statuses" }, ...Object.entries(attendanceLabel).map(([value, label]) => ({ value, label })), { value: "pending", label: "Pending TIME OUT" }];
const isPending = (a: AttendanceRow) => !!a.timeIn && !a.timeOut;
const subscribeReady = () => () => undefined;
const clientReady = () => true;
const serverReady = () => false;
function Status({ record }: { record: AttendanceRow }) {
  return <div className="chip-row"><Badge dot tone={{ present: "green", late: "gold", absent: "red", excused: "blue", unrecorded: "gray" }[record.status]}>{attendanceLabel[record.status]}</Badge>{isPending(record) && <Badge tone="gold">Pending TIME OUT</Badge>}</div>;
}
function matchesFilters(row: AttendanceRow, q: string, house: string, status: string) {
  return `${row.name} ${row.number}`.toLowerCase().includes(q.trim().toLowerCase()) && (house === "all" || String(row.houseId) === house) && (status === "all" || (status === "pending" ? isPending(row) : status === row.status));
}
function AttendanceTime({ time, method, timezone }: { time: string | null; method?: AttendanceMethod | null; timezone: string }) {
  return <span className="stacked"><strong>{timeLabel(time, timezone)}</strong>{time && method && <small>{methodLabel[method]}</small>}</span>;
}
function AttendanceTable({ rows, correction = false }: { rows: AttendanceRow[]; correction?: boolean }) {
  const { data, open } = useWorkspace();
  const student = data.role === "student";
  const [page, setPage] = useState(0);
  const shown = Math.min(page, Math.max(0, Math.ceil(rows.length / 15) - 1));
  function edit(row: AttendanceRow) {
    const local = (value: string | null) => value ? localTime(new Date(value), data.timezone).slice(0, 5) : "";
    open({ title: "Correct attendance", description: `${row.name} · ${dateLabel(row.date)}. Your name and reason will be recorded in the audit log.`, action: "attendance.correct", payload: { eventId: data.season?.id, studentId: row.studentId, date: row.date }, defaults: { status: row.status === "unrecorded" ? "absent" : row.status, timeIn: local(row.timeIn), timeOut: local(row.timeOut) }, fields: [
      { name: "status", label: "Official status", type: "select", required: true, full: true, options: statusOptions.filter((x) => !["all", "pending", "unrecorded"].includes(x.value)) },
      { name: "timeIn", label: "TIME IN", type: "time" }, { name: "timeOut", label: "TIME OUT", type: "time" },
      { name: "reason", label: "Reason for correction", type: "textarea", required: true, maxLength: 400 },
    ], submit: "Save correction" });
  }
  if (!rows.length) return <Empty title="No attendance records found" hint="Choose a different date or filter. New scans will appear here." />;
  return <><div className="table-wrap"><table className="data-table"><thead><tr>{!student && <th>Student</th>}<th>Date</th>{!student && <th>House</th>}<th>TIME IN</th><th>TIME OUT</th><th>Duration</th><th>Status</th>{correction && <th><span className="sr-only">Correct record</span></th>}</tr></thead><tbody>{rows.slice(shown * 15, shown * 15 + 15).map((row) => <tr key={`${row.studentId}-${row.date}`}>
    {!student && <td><span className="stacked"><strong>{row.name}</strong><small>{row.number}</small></span></td>}<td>{dateLabel(row.date, { month: "short", day: "numeric" })}</td>{!student && <td><HouseName house={data.houses.find((h) => h.id === row.houseId)} /></td>}<td><AttendanceTime time={row.timeIn} method={row.inMethod} timezone={data.timezone} /></td><td><AttendanceTime time={row.timeOut} method={row.outMethod} timezone={data.timezone} /></td><td>{durationLabel(row.timeIn, row.timeOut)}</td><td><Status record={row} /></td>{correction && <td><button type="button" className="icon-button" title="Correct attendance" aria-label={`Correct attendance for ${row.name}`} onClick={() => edit(row)}><Pencil size={16} /></button></td>}
  </tr>)}</tbody></table></div>{rows.length > 15 && <div className="table-footer"><span>Showing {shown * 15 + 1}–{Math.min(shown * 15 + 15, rows.length)} of {rows.length}</span><div><button className="btn btn-sm" disabled={shown === 0} onClick={() => setPage(shown - 1)}>Previous</button><button className="btn btn-sm" disabled={(shown + 1) * 15 >= rows.length} onClick={() => setPage(shown + 1)}>Next</button></div></div>}</>;
}

function ActiveCode({ result }: { result: Result }) {
  const { data, run, close, notify } = useWorkspace();
  const [now, setNow] = useState(() => Date.now());
  const [ending, setEnding] = useState(false);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(result.expiresAt || "") - now) / 1000));
  return <div className="active-code">
    {seconds > 0 && result.image ? <Image src={result.image} alt={`${result.type === "in" ? "TIME IN" : "TIME OUT"} attendance QR code`} width={260} height={260} unoptimized /> : <div className="scanner-target"><Clock3 size={46} /><strong>Session expired</strong></div>}
    <Badge tone={seconds > 0 ? "green" : "gray"} dot>{seconds > 0 ? `Expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Expired"}</Badge>
    {result.pin && seconds > 0 && <div className="gate-pin"><span>FACE VERIFICATION PIN</span><strong>{result.pin}</strong><button className="btn btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(result.pin || ""); notify("Face verification PIN copied."); } catch { notify("Unable to copy on this browser. Use the displayed PIN.", true); } }}><Copy size={14} /> Copy PIN</button></div>}
    <p>Show the code{result.pin ? " and PIN" : ""} to signed-in students in person. Closing this display does not close the session.</p>
    <div className="row-actions"><button className="btn" type="button" disabled={!seconds} onClick={async () => { try { await navigator.clipboard.writeText(result.code || ""); notify("Attendance code copied."); } catch { notify("Unable to copy on this browser. Use the QR code.", true); } }}><Copy size={16} /> Copy code</button><button className="btn btn-danger" type="button" disabled={ending || !seconds} onClick={async () => { setEnding(true); try { await run("attendance.close", { eventId: data.season?.id, id: result.id }); close(); } catch (error) { notify((error as Error).message, true); setEnding(false); } }}>Close session</button></div>
  </div>;
}
export function AttendancePage() {
  const { data, open, href } = useWorkspace();
  const router = useRouter();
  const [query, setQuery] = useState(""), [house, setHouse] = useState("all"), [status, setStatus] = useState("all"), [tab, setTab] = useState("daily");
  const student = data.role === "student", admin = data.role === "admin", eventId = data.season?.id;
  const rows = (student ? data.history : data.attendance).filter((a) => matchesFilters(a, query, house, status));
  const choices = data.season ? dateOptions(data.season.startDate, data.today < data.season.startDate ? data.season.startDate : data.today < data.season.endDate ? data.today : data.season.endDate, data.day) : [{ value: data.day, label: dateLabel(data.day) }];
  const stats = data.stats;
  const isOpenEvent = !!data.season && data.season.state === "active" && data.today >= data.season.startDate && data.today <= data.season.endDate;
  const owed = data.attendanceAccess.sanctions.filter((s) => s.status === "outstanding").reduce((total, s) => total + s.amountCentavos, 0);
  const ratio = stats.students ? Math.round((stats.present + stats.late) / stats.students * 100) : 0;
  const gen = () => open({ title: "Generate attendance QR", description: "Open a short-lived QR session. If enabled, this also shows a PIN for students with approved face enrollment.", action: "attendance.generate", payload: { eventId }, defaults: { type: "in", minutes: 5, withFace: false }, fields: [
    { name: "type", label: "Session type", type: "select", required: true, options: [{ value: "in", label: "TIME IN" }, { value: "out", label: "TIME OUT" }] }, { name: "minutes", label: "Expires in (minutes)", type: "number", min: 1, max: 15, required: true },
    ...(data.attendanceAccess.faceReady ? [{ name: "withFace", label: "Also issue a face verification PIN", type: "checkbox" as const, full: true }] : []),
  ], submit: "Open attendance session", onSuccess: (result) => open({ title: `${result.type === "out" ? "TIME OUT" : "TIME IN"} ${result.pin ? "QR and face PIN" : "QR code"}`, description: data.season?.title, content: <ActiveCode result={result} /> }) });
  return <><SectionHeading title={student ? "My Attendance" : admin ? "Attendance" : "House Attendance"} description={student ? "Review your official TIME IN, TIME OUT, and attendance history." : admin ? "Monitor check-ins, run an RFID station, and verify attendance across your houses." : "Monitor daily attendance, check-ins, and time out for your assigned houses."} actions={student ? <><Link className="btn" href={href("face")}><ScanFace size={17} /> Face verification</Link><Link className="btn btn-primary" href={href("scan")}><QrCode size={17} /> Scan QR code</Link></> : <><Link className="btn" href={href("reports", { day: data.day })}><FileText size={16} /> Reports</Link>{admin && <button className="btn btn-primary" disabled={!isOpenEvent} onClick={gen}><QrCode size={17} /> Generate QR</button>}</>} />
    {admin && <div className="attendance-tabs"><Tabs tabs={[{ value: "daily", label: "Daily records" }, { value: "rfid", label: "RFID station" }, { value: "credentials", label: "Credentials" }]} active={tab} change={(value) => { if (tab === "rfid" && value === "daily" && !data.preview) router.refresh(); setTab(value); }} /></div>}
    {admin && tab === "rfid" ? <RFIDStation /> : admin && tab === "credentials" ? <CredentialsPanel /> : <>
    {student && <section className="panel student-sanction-strip"><div><strong>{owed ? `${pesos(owed)} outstanding` : "No outstanding sanctions"}</strong><p>Sanctions apply only to unexcused absences after staff review.</p></div><Link href={href("sanctions")} className="text-link">View sanctions</Link></section>}
    {!student && <><div className="stats-grid attendance-stats"><Stat label="Present" value={stats.present} hint={`${ratio}% checked in, including late`} icon={UserRoundCheck} tone="green" /><Stat label="Late" value={stats.late} hint="After the official cut-off" icon={Clock3} tone="gold" /><Stat label="Absent" value={stats.absent} hint={`${stats.students} registered students`} icon={UserMinus} tone="red" /><Stat label="Pending TIME OUT" value={stats.pending} hint={`${stats.excused} excused on this date`} icon={ClipboardCheck} tone="blue" /></div>
    <div className={`overview-grid attendance-panels ${admin ? "" : "single-overview"}`}><Panel title="House attendance" description="Compare the selected day across houses." className="chart-panel" action={<Picker label="Attendance date" calendar value={data.day} options={choices} change={(day) => router.push(href("attendance", { day }))} />}><AttendanceChart groups={data.groups} /></Panel>{admin && <Panel title="QR sessions" description="QR scans and optional face PINs share the same expiry.">{data.qrSessions.length ? <div className="session-list">{data.qrSessions.map((s) => <div className="session-row" key={s.id}><span className="icon-tile tile-gold"><QrCode size={17} /></span><span className="stacked"><strong>TIME {s.type.toUpperCase()}</strong><small>{dateLabel(s.date, { month: "short", day: "numeric" })} · Until {timeLabel(s.expiresAt, data.timezone)}</small></span><Badge dot tone={s.active ? "green" : "gray"}>{s.active ? "Open" : "Closed"}</Badge>{s.active && <button className="icon-button" aria-label="Close QR session" onClick={() => open({ title: "Close QR session?", description: "Students will no longer be able to submit scans with this code.", action: "attendance.close", payload: { id: s.id, eventId }, danger: true, submit: "Close session" })}><X size={17} /></button>}</div>)}</div> : <Empty title="No QR sessions yet" hint="Open a short-lived TIME IN or TIME OUT QR session." />}</Panel>}</div></>}
    {admin && <FinalizeAttendance />}
    <Panel title={student ? "Attendance history" : "Daily records"} description={student ? `${rows.length} official records` : `${dateLabel(data.day)} · ${rows.length} students`} className="records-panel">
      <div className="filter-row">{!student && <><SearchBox value={query} change={setQuery} placeholder="Search students…" /><Picker label="Filter by house" value={house} change={setHouse} options={[{ value: "all", label: "All houses" }, ...data.houses.filter((h) => data.scopedHouseIds.includes(h.id)).map((h) => ({ value: h.id, label: h.name }))]} /></>}<Picker label="Attendance status" value={status} change={setStatus} options={statusOptions} /></div>
      <AttendanceTable rows={rows} correction={admin && !!eventId && data.season?.state !== "draft" && data.day <= data.today} />
    </Panel></>}</>;
}

export function ScannerPage() {
  const { data, run, href, open } = useWorkspace();
  const [camera, setCamera] = useState("off"), [code, setCode] = useState(""), [error, setError] = useState(""), [success, setSuccess] = useState(""), [busy, setBusy] = useState(false);
  const id = `mma-camera-${useId().replace(/[^a-z0-9-]/gi, "")}`;
  const reader = useRef<Html5Qrcode | null>(null), pending = useRef(false), mounted = useRef(false);
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; const rq = reader.current; if (rq?.isScanning) void rq.stop().then(() => rq.clear()).catch(() => undefined); };
  }, []);
  async function stop() {
    try { if (reader.current?.isScanning) await reader.current.stop(); reader.current?.clear(); } catch { /* already stopped */ }
    if (mounted.current) setCamera("off");
  }
  async function send(value: string) {
    if (pending.current) return;
    if (data.preview) { open({ title: "Submit a QR scan", action: "attendance.scan" }); return; }
    if (!value.trim()) { setError("Enter or scan an attendance code."); return; }
    pending.current = true; setBusy(true); setError(""); setSuccess("");
    if (reader.current?.isScanning) void stop();
    try { const result = await run("attendance.scan", { code: value.trim() }); setSuccess(result.message || "Attendance recorded."); setCode(""); }
    catch (ex) { setError((ex as Error).message); }
    finally { pending.current = false; setBusy(false); }
  }
  async function getReader() {
    if (reader.current) return reader.current;
    const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
    if (!mounted.current) throw new Error("Scanner was closed.");
    reader.current = new Html5Qrcode(id, { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
    return reader.current;
  }
  async function start() {
    if (data.preview) { open({ title: "Start QR scanner", action: "attendance.scan" }); return; }
    setCamera("starting"); setError("");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices) throw new Error("Camera access requires HTTPS or localhost.");
      const qr = await getReader();
      await qr.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 210, height: 210 } }, (text) => void send(text), () => undefined);
      if (!mounted.current) { if (qr.isScanning) await qr.stop(); return; }
      setCamera(qr.isScanning ? "on" : "off");
    } catch { if (mounted.current) { setCamera("off"); setError("The camera could not start. Allow camera access on HTTPS, or use a QR image or code instead."); } }
  }
  async function readImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (data.preview) { open({ title: "Scan QR image", action: "attendance.scan" }); return; }
    if (file.size > 8 * 1024 * 1024) { setError("Select an image under 8 MB."); return; }
    try { await stop(); const qr = await getReader(); const result = await qr.scanFile(file, false); qr.clear(); await send(result); }
    catch { setError("No attendance QR code was found in that image."); }
  }
  return <><SectionHeading title="Scan Attendance QR" description="Use the active TIME IN or TIME OUT code displayed by event staff." actions={<Link className="btn" href={href("attendance")}><ClipboardCheck size={16} /> Attendance history</Link>} />
    <div className="settings-grid scanner-grid"><Panel title="QR scanner" description="Center the QR inside the camera guide."><div className="scan-panel"><div className={`scan-target-wrap ${camera !== "off" ? "camera-active" : ""}`}><div id={id} className="camera-element" />{camera === "off" && <div className="scanner-target"><ScanLine size={55} strokeWidth={1.4} /><strong>Ready to scan</strong><span>Your camera is off</span></div>}{camera === "starting" && <div className="scanner-target">Starting camera…</div>}</div><div className="row-actions">{camera === "on" ? <button className="btn" onClick={() => void stop()}><X size={17} /> Stop camera</button> : <button className="btn btn-primary" disabled={!ready || camera === "starting" || busy} onClick={() => void start()}><Camera size={17} /> Start camera</button>}<label className="btn file-label"><ImagePlus size={16} /> Scan an image<input className="sr-only" type="file" disabled={!ready || camera === "starting" || busy} accept="image/*" onChange={readImage} /></label></div></div></Panel>
    <Panel title="Enter an attendance code" description="Use this option if your camera is unavailable."><div className="padded"><form className="scan-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void send(code); }}><label className="field"><span>QR attendance code</span><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the full code" maxLength={80} required /></label><button className="btn btn-primary" disabled={!ready || busy}>{busy ? "Submitting…" : "Submit code"} <ArrowRight size={16} /></button></form>{error && <p className="form-alert" role="alert">{error}</p>}{success && <p className="form-success" role="status"><CircleCheck size={17} />{success}</p>}<p className="page-tip"><ShieldCheck size={16} /> Attendance uses the official server time.</p></div></Panel></div></>;
}

export function ReportsPage() {
  const { data, href, notify } = useWorkspace();
  const router = useRouter();
  const [mode, setMode] = useState<"attendance" | "participation">("attendance"), [house, setHouse] = useState("all"), [status, setStatus] = useState("all"), [query, setQuery] = useState(""), [verified, setVerified] = useState(""), [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(() => data.history.at(-1)?.date || data.day), [until, setUntil] = useState(data.day);
  const appliedFrom = data.history.at(-1)?.date || data.day;
  const rows = data.history.filter((a) => matchesFilters(a, query, house, status));
  const houseOptions = [{ value: "all", label: "All assigned houses" }, ...data.houses.filter((h) => data.scopedHouseIds.includes(h.id)).map((h) => ({ value: h.id, label: h.name }))];
  const participation = data.athletes.flatMap((a) => { const student = data.students.find((s) => s.id === a.studentId); const sport = data.sports.find((s) => s.id === a.sportId); return student && sport && (house === "all" || String(student.houseId) === house) ? [{ student, sport }] : []; });
  async function pdf() {
    setBusy(true);
    try { await downloadReport(data, mode, rows, appliedFrom, data.day, house, verified); notify("PDF report downloaded."); }
    catch { notify("The PDF could not be created. Please try again.", true); }
    finally { setBusy(false); }
  }
  function dates(e: FormEvent) {
    e.preventDefault();
    if (from > until || Date.parse(until) - Date.parse(from) > 30 * 86400000) { notify("Choose a valid date range of up to 31 days.", true); return; }
    router.push(href("reports", { from, day: until }));
  }
  function csv() {
    const h = (id: number | null) => data.houses.find((x) => x.id === id)?.name;
    if (mode === "attendance") return downloadCsv("mma-attendance.csv", ["Date", "Student ID", "Full name", "House", "TIME IN", "TIME OUT", "Status", "Duration", "TIME IN method", "TIME OUT method"], rows.map((a) => [a.date, a.number, a.name, h(a.houseId), timeLabel(a.timeIn, data.timezone), timeLabel(a.timeOut, data.timezone), isPending(a) ? `${attendanceLabel[a.status]} / Pending TIME OUT` : attendanceLabel[a.status], durationLabel(a.timeIn, a.timeOut), a.inMethod ? methodLabel[a.inMethod] : "", a.outMethod ? methodLabel[a.outMethod] : ""]));
    downloadCsv("mma-participation.csv", ["Student ID", "Full name", "House", "Sport", "Division"], participation.map(({ student, sport }) => [student.number, student.name, h(student.houseId), sport.name, sport.division]));
  }
  return <><SectionHeading title="Reports" description="Filter official event records and export them as PDF or CSV." actions={<><button className="btn" onClick={csv}><Download size={16} /> Export CSV</button><button className="btn btn-primary" disabled={busy} onClick={() => void pdf()}><FileText size={17} /> {busy ? "Creating PDF…" : "Download PDF"}</button></>} /><Tabs active={mode} change={(m) => setMode(m as typeof mode)} tabs={[{ value: "attendance", label: "Attendance report" }, { value: "participation", label: "Team participation" }]} />
    <Panel title={mode === "attendance" ? "Attendance report" : "Participation report"} description={mode === "attendance" ? `${dateLabel(appliedFrom)} – ${dateLabel(data.day)} · ${rows.length} records` : `${participation.length} athlete registrations`} className="records-panel">
      <div className="report-controls">{mode === "attendance" && <form className="filter-row" onSubmit={dates}><label className="field"><span>From</span><input type="date" required value={from} min={data.season?.startDate} max={data.season?.endDate} onChange={(e) => setFrom(e.target.value)} /></label><label className="field"><span>Through</span><input type="date" required value={until} min={data.season?.startDate} max={data.season?.endDate} onChange={(e) => setUntil(e.target.value)} /></label><button className="btn" type="submit">Apply dates</button></form>}
      <div className="filter-row">{mode === "attendance" && <><SearchBox value={query} change={setQuery} placeholder="Find a student…" /><Picker label="Attendance status" value={status} change={setStatus} options={statusOptions} /></>}<Picker label="Report house" value={house} change={setHouse} options={houseOptions} /><label className="field field-verify"><input value={verified} onChange={(e) => setVerified(e.target.value)} placeholder="Verified by (optional)" aria-label="Verified by" maxLength={120} /></label></div></div>
      {mode === "attendance" ? <AttendanceTable rows={rows} /> : participation.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Student</th><th>House</th><th>Sport</th><th>Division</th></tr></thead><tbody>{participation.map(({ student, sport }) => <tr key={`${student.id}/${sport.id}`}><td><span className="stacked"><strong>{student.name}</strong><small>{student.number}</small></span></td><td><HouseName house={data.houses.find((h) => h.id === student.houseId)} /></td><td>{sport.name}</td><td className="capitalize">{sport.division}</td></tr>)}</tbody></table></div> : <Empty title="No registrations match this filter" />}
    </Panel></>;
}

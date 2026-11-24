"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CircleAlert, CircleCheck, Clock3, CreditCard, KeyRound, ScanFace, ShieldCheck, Trash2, Wifi, X } from "lucide-react";
import { dateLabel, localDate, timeLabel, type FaceEnrollment, type Student } from "@/lib/model";
import { Avatar, Badge, Empty, HouseName, Panel, SearchBox, Tabs, useWorkspace } from "@/components/ui";

type Station = { id: number; expiresAt: string; direction: "in" | "out" };
type Tap = { id: number; name: string; number: string; time: string; direction: string };
const directions = [{ value: "in", label: "TIME IN" }, { value: "out", label: "TIME OUT" }];
function closeDepartedStation(eventId: number | undefined, id: number, csrf: string) {
  if (!eventId || !csrf) return;
  void fetch("/api/workspace/rfid.close", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", "X-MMA-Request": "1", "X-MMA-CSRF": csrf }, body: JSON.stringify({ eventId, stationId: id }) }).catch(() => undefined);
}

export function RFIDStation() {
  const { data, run } = useWorkspace();
  const [direction, setDirection] = useState<"in" | "out">("in"), [station, setStation] = useState<Station | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [taps, setTaps] = useState<Tap[]>([]);
  const [clock, setClock] = useState(0);
  const input = useRef<HTMLInputElement>(null), busyRef = useRef(false), tapCount = useRef(0);
  const alive = useRef(false), openStation = useRef<Station | null>(null);
  const eventId = data.season?.id, csrf = data.csrf;
  const useDemo = data.preview;
  const allowed = !!data.season && data.season.state === "active" && data.today >= data.season.startDate && data.today <= data.season.endDate;
  const open = !!station && Date.parse(station.expiresAt) > clock;
  const duration = open && station ? Math.max(0, Math.ceil((Date.parse(station.expiresAt) - clock) / 1000)) : 0;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const live = openStation.current;
      openStation.current = null;
      if (!useDemo && live) closeDepartedStation(eventId, live.id, csrf);
    };
  }, [useDemo, eventId, csrf]);
  useEffect(() => {
    if (!station) return;
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [station]);
  useEffect(() => { if (open && !busy) input.current?.focus(); }, [open, busy]);
  async function start() {
    if (busyRef.current || !allowed) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const now = Date.now();
      const result = useDemo ? { id: now, expiresAt: new Date(now + 45 * 60_000).toISOString() } : await run("rfid.open", { eventId: data.season?.id, type: direction }, false);
      if (!result.id || !result.expiresAt) throw new Error("Could not start the station. Please retry.");
      if (!alive.current) { if (!useDemo) closeDepartedStation(eventId, result.id, csrf); return; }
      const opened = { id: result.id, expiresAt: result.expiresAt, direction };
      openStation.current = opened;
      setClock(now); setStation(opened);
    } catch (ex) { setError((ex as Error).message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function close() {
    if (busyRef.current || !station) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      if (!useDemo) await run("rfid.close", { eventId: data.season?.id, stationId: station.id });
      openStation.current = null; setStation(null);
    } catch (ex) { setError((ex as Error).message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function tap(uid: string) {
    if (busyRef.current || !station || !open) return;
    if (!uid.trim()) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const count = ++tapCount.current;
      const sample = data.students[(count - 1) % data.students.length];
      const result = useDemo ? { studentName: sample?.name || "Sample student", studentNumber: sample?.number || "2026-1001", recordedAt: new Date().toISOString() } : await run("rfid.scan", { eventId: data.season?.id, stationId: station.id, uid }, false);
      setTaps((list) => [{ id: count, name: result.studentName || "Student", number: result.studentNumber || "", time: result.recordedAt || new Date().toISOString(), direction: station.direction }, ...list].slice(0, 7));
    } catch (ex) { setError((ex as Error).message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const uid = input.current?.value || "";
    if (input.current) input.current.value = "";
    void tap(uid);
  }
  const latest = taps[0];
  return <div className="settings-grid capture-layout">
    <Panel title="RFID reader" description="Run a staff-supervised station for this event." action={<Badge tone={open ? "green" : "gray"} dot>{open ? "Station ready" : "Station closed"}</Badge>}>
      <div className="capture-inner">
        <div className={`capture-display rfid-display ${open ? "capture-ready" : ""}`}><div className="capture-orbit"><Wifi size={28} className="rfid-wave" /><CreditCard size={36} strokeWidth={1.55} /></div><h3>{open ? `Ready for TIME ${station?.direction.toUpperCase()}` : "Tap in. Tap out."}</h3><p>{open ? "Keep the card field focused and tap one student card at a time." : "Select a direction and open the reader before scanning."}</p>{open && <span className="capture-timer"><Clock3 size={14} /> {Math.floor(duration / 60)}:{String(duration % 60).padStart(2, "0")} remaining</span>}</div>
        {!open ? <div className="station-settings"><Tabs tabs={directions} active={direction} change={(value) => setDirection(value as "in" | "out")} /><button className="btn btn-primary" onClick={() => void start()} disabled={busy || !allowed || !data.attendanceAccess.rfidReady}><Wifi size={16} />{busy ? "Opening…" : "Open station"}</button></div> : <><form className="station-scan" onSubmit={submit}><label className="field"><span>RFID card scan</span><input ref={input} type="password" placeholder="Tap a student card" autoComplete="off" autoCapitalize="off" maxLength={96} spellCheck={false} readOnly={busy} /></label><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Recording…" : "Record tap"}</button></form><div className="station-bottom">{useDemo ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void tap("demo")}>Try sample tap <ArrowRight size={14} /></button> : <button type="button" className="btn btn-sm" onClick={() => input.current?.focus()}>Focus reader field</button>}<button type="button" className="btn btn-sm" disabled={busy} onClick={() => void close()}><X size={14} /> Close station</button></div></>}
        {error && <p className="form-alert" role="alert"><CircleAlert size={16} />{error}</p>}{!data.attendanceAccess.rfidReady && <p className="form-alert"><KeyRound size={16} />RFID setup is not enabled on this server. Ask the system administrator to configure the RFID secret.</p>}
        {data.attendanceAccess.rfidReady && !allowed && <p className="page-tip"><CircleAlert size={16} /> The selected event must be active and in progress today.</p>}
        {useDemo && <p className="page-tip"><ShieldCheck size={15} /> Preview taps are simulated and never saved.</p>}
      </div>
    </Panel>
    <div className="stack-panels"><Panel title="Recent taps" description="Successful scans on this browser tab." className="recent-taps">
      {latest ? <><div className="station-last" role="status"><span className="icon-tile tile-green"><CircleCheck size={18} /></span><div><strong>{latest.name}</strong><p>TIME {latest.direction.toUpperCase()} saved at {timeLabel(latest.time, data.timezone)}</p></div></div><div className="resource-list">{taps.slice(1).map((t) => <div className="resource-row" key={t.id}><Avatar name={t.name} tone="navy" /><span className="stacked"><strong>{t.name}</strong><small>{t.number}</small></span><Badge tone="green">{timeLabel(t.time, data.timezone)}</Badge></div>)}</div></> : <Empty title="Waiting for a tap" hint="A successful tap will show the student and official timestamp here." />}
    </Panel><Panel title="Reader setup" description="USB keyboard mode, no extra driver in the app."><ol className="reader-steps"><li>Plug a keyboard-emulating USB RFID reader into this workstation.</li><li>Configure the reader to send the card ID followed by <kbd>Enter</kbd>.</li><li>Assign cards under <strong>Credentials</strong>, then keep the scan field focused.</li></ol><p className="reader-note"><ShieldCheck size={16} /> Card IDs can be copied. Keep the station supervised and confirm the student’s identity.</p></Panel></div>
  </div>;
}

export function CredentialsPanel() {
  const { data, open } = useWorkspace();
  const [query, setQuery] = useState(""), [mode, setMode] = useState("all"), [page, setPage] = useState(0);
  const { profiles, rfidStudentIds, rfidReady } = data.attendanceAccess;
  const profileFor = new Map(profiles.map((p) => [p.studentId, p]));
  const onFile = new Set(rfidStudentIds);
  const students = data.students.filter((s) => `${s.name} ${s.number}`.toLowerCase().includes(query.trim().toLowerCase()) && (mode === "all" || (mode === "pending" ? profileFor.get(s.id)?.state === "pending" : onFile.has(s.id)))).sort((a, b) => Number(profileFor.get(b.id)?.state === "pending") - Number(profileFor.get(a.id)?.state === "pending") || a.name.localeCompare(b.name));
  const index = Math.min(page, Math.max(0, Math.ceil(students.length / 12) - 1));
  function bind(s: Student) {
    open({ title: onFile.has(s.id) ? "Replace RFID card" : "Assign RFID card", description: `${s.name} · ${s.number}. Scan the physical card into the field below; a replacement immediately revokes the old card.`, action: "rfid.bind", payload: { studentId: s.id }, fields: [{ name: "uid", label: "Scan card ID", type: "password", full: true, required: true, maxLength: 96, hint: "With the field focused, tap the card on a USB reader. The reader’s Enter suffix may submit the form." }], submit: "Save card" });
  }
  function approve(s: Student, profile: FaceEnrollment) {
    open({ title: "Approve face enrollment", description: `Verify ${s.name} (${s.number}) in person and ask the student to show the code on their own signed-in device.`, action: "face.approve", payload: { studentId: s.id }, content: <p className="page-tip">The pending enrollment expires at {timeLabel(profile.expiresAt, data.timezone)}.</p>, fields: [{ name: "code", label: "Student’s eight-digit review code", full: true, required: true, maxLength: 8 }, { name: "inPerson", label: "I checked the student’s identity and witnessed the live enrollment.", type: "checkbox", required: true, full: true }], submit: "Approve enrollment" });
  }
  return <Panel title="Student credentials" description="Card assignment and voluntary face enrollment. Templates and raw card IDs are never displayed." action={profiles.some((p) => p.state === "expired") && <button className="btn btn-sm" onClick={() => open({ title: "Delete expired enrollments?", description: "Expired templates cannot be used. Only expired records will be removed.", action: "face.purge", submit: "Delete expired", danger: true })}><Trash2 size={15} /> Purge expired</button>} className="records-panel">
    <div className="filter-row"><SearchBox value={query} change={(q) => { setQuery(q); setPage(0); }} placeholder="Search name or Student ID…" /><Tabs tabs={[{ value: "all", label: "All students" }, { value: "pending", label: "Awaiting face review" }, { value: "cards", label: "Cards assigned" }]} active={mode} change={(m) => { setMode(m); setPage(0); }} /></div>
    {students.length ? <><div className="table-wrap"><table className="data-table credential-table"><thead><tr><th>Student</th><th>House</th><th>RFID card</th><th>Face verification</th><th>Actions</th></tr></thead><tbody>{students.slice(index * 12, index * 12 + 12).map((s) => {
      const face = profileFor.get(s.id);
      const card = onFile.has(s.id);
      return <tr key={s.id}><td><span className="person-cell"><Avatar name={s.name} tone="navy" /><span><strong>{s.name}</strong><small>{s.number}</small></span></span></td><td><HouseName house={data.houses.find((h) => h.id === s.houseId)} /></td><td><Badge tone={card ? "green" : "gray"} dot>{card ? "Assigned" : "Not assigned"}</Badge></td><td><div className="stacked"><Badge tone={face?.state === "approved" ? "green" : face?.state === "pending" ? "gold" : "gray"} dot>{face?.state === "approved" ? "Approved" : face?.state === "pending" ? "Pending review" : face?.state === "expired" ? "Expired" : "Not enrolled"}</Badge>{face?.state === "approved" && <small>Until {dateLabel(localDate(new Date(face.expiresAt), data.timezone))}</small>}</div></td><td><div className="row-actions"><button className="btn btn-sm" disabled={!s.active || !rfidReady} onClick={() => bind(s)}><CreditCard size={15} /> {card ? "Replace card" : "Assign card"}</button>{card && <button className="icon-button" aria-label={`Revoke card for ${s.name}`} title="Revoke card" onClick={() => open({ title: "Revoke RFID card?", description: `${s.name} can still check in using QR. This does not remove past attendance.`, action: "rfid.revoke", payload: { studentId: s.id }, danger: true, submit: "Revoke card" })}><Trash2 size={15} /></button>}{face?.state === "pending" && <button className="btn btn-primary btn-sm" disabled={!s.active || !data.attendanceAccess.faceReady} onClick={() => approve(s, face)}><ScanFace size={15} /> Approve face</button>}{face && <button className="icon-button" aria-label={`Delete face enrollment for ${s.name}`} title="Delete face enrollment" onClick={() => open({ title: "Delete face enrollment?", description: "The stored template will be deleted. This does not alter attendance history.", action: "face.revoke", payload: { studentId: s.id }, danger: true, submit: "Delete template" })}><ShieldCheck size={16} /></button>}</div></td></tr>;
    })}</tbody></table></div><div className="table-footer"><span>Showing {index * 12 + 1}–{Math.min(index * 12 + 12, students.length)} of {students.length}</span><div><button className="btn btn-sm" disabled={!index} onClick={() => setPage(index - 1)}>Previous</button><button className="btn btn-sm" disabled={(index + 1) * 12 >= students.length} onClick={() => setPage(index + 1)}>Next</button></div></div></> : <Empty title="No matching students" hint="Change the search or select a different credential filter." />}
  </Panel>;
}

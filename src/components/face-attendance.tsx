"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, CircleAlert, CircleCheck, Clock3, Fingerprint, LockKeyhole, QrCode, ScanFace, ShieldCheck, Trash2, X } from "lucide-react";
import { dateLabel, localDate, timeLabel } from "@/lib/model";
import { Badge, Panel, SectionHeading, useWorkspace } from "@/components/ui";

export function FaceAttendancePage() {
  const { data, href, open, run } = useWorkspace();
  const [camera, setCamera] = useState<"off" | "starting" | "on">("off"), [pin, setPin] = useState(""), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), alive = useRef(false), flight = useRef(false);
  const face = data.attendanceAccess.myFace;
  const approved = face?.state === "approved", pending = face?.state === "pending";
  const active = !!data.season && data.season.state === "active" && data.today >= data.season.startDate && data.today <= data.season.endDate;
  const configured = data.attendanceAccess.faceReady;
  const canCapture = !pending && configured && !!data.profileId && (approved ? active : consent);
  useEffect(() => {
    alive.current = true;
    const pause = () => {
      if (!document.hidden) return;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      if (video.current) video.current.srcObject = null;
      setCamera("off");
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", pause);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, []);
  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera("off");
  }
  async function start() {
    if (data.preview) { open({ title: "Use face verification", action: "face.verify" }); return; }
    if (camera !== "off" || busy || !canCapture) return;
    setError(""); setMessage("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setError("Camera access requires HTTPS or localhost. Use QR or the staffed RFID station instead."); return; }
    setCamera("starting");
    try {
      const current = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } } });
      if (!alive.current || !video.current || document.hidden) { current.getTracks().forEach((t) => t.stop()); if (alive.current) setCamera("off"); return; }
      stream.current = current;
      video.current.srcObject = current;
      await video.current.play();
      if (alive.current && stream.current) setCamera("on");
    } catch {
      if (alive.current) { stop(); setError("The camera could not start. Allow camera access, or choose QR or RFID attendance."); }
    }
  }
  async function capture() {
    if (flight.current || !video.current || camera !== "on" || !canCapture) return;
    if (approved && !/^\d{6}$/.test(pin)) { setError("Enter the six-digit attendance PIN first."); return; }
    const player = video.current;
    if (player.readyState < 2 || !player.videoWidth || !player.videoHeight) { setError("Wait for the camera to load, then try again."); return; }
    flight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const frame = document.createElement("canvas"), scale = Math.min(1, 768 / Math.max(player.videoWidth, player.videoHeight));
      frame.width = Math.floor(player.videoWidth * scale); frame.height = Math.floor(player.videoHeight * scale);
      const ctx = frame.getContext("2d");
      if (!ctx) throw new Error("This browser could not capture a frame.");
      ctx.drawImage(player, 0, 0, frame.width, frame.height);
      const blob = await new Promise<Blob | null>((resolve) => frame.toBlob(resolve, "image/jpeg", .82));
      ctx.clearRect(0, 0, frame.width, frame.height);
      if (!blob || !alive.current) return;
      const form = new FormData();
      form.set("frame", blob, "capture.jpg");
      if (approved) { form.set("pin", pin); form.set("eventId", String(data.season?.id)); }
      else form.set("consent", String(consent));
      const result = await run(approved ? "face.verify" : "face.enroll", form);
      if (alive.current) { stop(); setPin(""); setConsent(false); setMessage(result.message || "Capture saved."); }
    } catch (ex) { if (alive.current) setError((ex as Error).message); }
    finally { flight.current = false; if (alive.current) setBusy(false); }
  }
  function withdraw() {
    open({ title: "Delete your face template?", description: "Face verification will stop immediately. Your attendance history stays intact, and you can still use QR or the RFID station.", action: "face.withdraw", danger: true, submit: "Delete my template", onSuccess: () => { stop(); setConsent(false); setMessage(""); setError(""); } });
  }
  const state = approved ? "Approved" : pending ? "Pending staff approval" : face ? "Expired" : "Not enrolled";
  return <><SectionHeading title="Face Verification" description="An optional, one-to-one face check for your intramurals attendance." actions={<><Link href={href("scan")} className="btn"><QrCode size={16} /> Use QR instead</Link><Link href={href("attendance")} className="btn">Attendance history <ArrowRight size={15} /></Link></>} />
    <div className="settings-grid capture-layout face-layout"><Panel title={approved ? "Verify attendance" : pending ? "Review your enrollment" : "Enroll your face"} description={approved ? "Enter the PIN shown at the staffed attendance desk and capture a live camera frame." : "Verify your identity with event staff. Enrollment is never required."} action={<Badge tone={approved ? "green" : pending ? "gold" : "gray"} dot>{state}</Badge>}>
      <div className="capture-inner">
        {pending ? <div className="review-code"><span className="icon-tile tile-gold"><LockKeyhole size={20} /></span><h3>Show this code to event staff</h3><strong className="review-digits" aria-label="Enrollment review code">{face.reviewCode || "—"}</strong><p><Clock3 size={14} /> Valid until {timeLabel(face.expiresAt, data.timezone)}</p><p>Show your school ID and this screen in person. Staff must witness the live enrollment before approving it.</p></div> : <>
          <div className={`capture-display face-display ${camera !== "off" ? "face-live" : ""}`}><video ref={video} muted playsInline aria-label="Live camera preview" /><span aria-hidden="true" className="face-guide" />{camera !== "on" && <div className="face-placeholder"><span className="capture-orbit"><ScanFace size={38} strokeWidth={1.5} /></span><h3>{camera === "starting" ? "Starting camera…" : "Camera is off"}</h3><p>{camera === "starting" ? "Allow access when prompted." : "Only starts when you choose to begin."}</p></div>}</div>
          {approved ? <div className="capture-control"><label className="field"><span>Attendance PIN</span><input type="text" className="attendance-pin" inputMode="numeric" pattern="[0-9]{6}" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Six digits" autoComplete="off" /></label>{!active && <p className="page-tip">An active event is needed to verify today’s attendance.</p>}</div> : <label className="consent-box"><input type="checkbox" disabled={!configured || busy || camera !== "off"} checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span><strong>I opt in to face verification.</strong><small>I agree to create an encrypted face template for attendance. I can delete it at any time and use QR or a staffed RFID reader instead.</small></span></label>}
          <div className="row-actions">{camera === "off" ? <button className="btn btn-primary" disabled={!canCapture} onClick={() => void start()}><Camera size={16} /> Start camera</button> : <><button className="btn btn-primary" disabled={busy || camera !== "on"} onClick={() => void capture()}><ScanFace size={17} />{busy ? "Checking…" : approved ? "Verify and record" : "Capture enrollment"}</button><button className="btn" disabled={busy || camera === "starting"} onClick={stop}><X size={15} /> Stop camera</button></>}</div>
        </>}
        {error && <p className="form-alert" role="alert"><CircleAlert size={17} /> {error}</p>}{message && <p className="form-success" role="status"><CircleCheck size={17} /> {message}</p>}
        {!configured && <p className="form-alert"><LockKeyhole size={16} /> Face verification is not enabled on this server. QR and RFID remain available.</p>}
        {data.preview && <p className="page-tip"><ShieldCheck size={16} /> The preview does not access the camera or save face data.</p>}
      </div></Panel>
      <div className="stack-panels"><Panel title="Your face profile" description="Only your own profile can be verified."><div className="profile-privacy"><span className="icon-tile tile-blue"><Fingerprint size={20} /></span><div><strong>{state}</strong><p>{face ? approved ? `Renew by ${dateLabel(localDate(new Date(face.expiresAt), data.timezone))}.` : "You can remove this enrollment and start again." : "No face template is stored for your account."}</p></div></div>{face && <div className="padded profile-delete"><button className="btn btn-sm btn-quiet-danger" disabled={busy} onClick={withdraw}><Trash2 size={15} /> Delete face template</button></div>}</Panel>
      <Panel title="Privacy and alternatives" description="Face verification is optional."><ul className="privacy-points"><li><ShieldCheck size={17} />The server checks against your own enrollment only. It does not search other students.</li><li><LockKeyhole size={17} />Camera images are processed and not saved. An approved encrypted template expires after 180 days.</li><li><CircleAlert size={17} />If a check fails, use QR or RFID. A failed check never marks you absent or creates a sanction.</li></ul></Panel></div>
    </div></>;
}

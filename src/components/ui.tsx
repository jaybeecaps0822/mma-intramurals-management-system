"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, ChevronDown, CircleAlert, CircleCheck, Flame, Inbox, Leaf, LockKeyhole, Search, Shield, Waves, X, Zap } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { dateLabel, initials, scopedPath, type House, type WorkspaceData } from "@/lib/model";

export type Option = { value: string | number; label: string };
export type Field = { name: string; label: string; type?: "text" | "number" | "password" | "email" | "textarea" | "select" | "checkbox" | "multi" | "file" | "date" | "time" | "color"; options?: Option[]; placeholder?: string; hint?: string; required?: boolean; full?: boolean; min?: string | number; max?: string | number; accept?: string; maxLength?: number };
export type Result = { message?: string; error?: string; redirect?: string; code?: string; image?: string; pin?: string; expiresAt?: string; type?: string; id?: number; slug?: string; studentName?: string; studentNumber?: string; recordedAt?: string };
export type FormSpec = {
  title: string; description?: string; action?: string; fields?: Field[]; defaults?: Record<string, string | number | boolean | number[] | string[] | null | undefined>;
  payload?: Record<string, unknown>; content?: ReactNode; submit?: string; danger?: boolean; onSuccess?: (result: Result) => void;
};
type WorkspaceValue = {
  data: WorkspaceData; section: string; href: (section: string, extra?: Record<string, string | null | undefined>) => string;
  open: (spec: FormSpec) => void; close: () => void; run: (action: string, payload: FormData | Record<string, unknown>, refresh?: boolean) => Promise<Result>;
  notify: (message: string, error?: boolean) => void;
};
const Context = createContext<WorkspaceValue | null>(null);
export function useWorkspace() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("Workspace context is missing");
  return ctx;
}
export function WorkspaceProvider({ data, section, children }: { data: WorkspaceData; section: string; children: ReactNode }) {
  const router = useRouter();
  const [dialog, showDialog] = useState<{ spec: FormSpec; key: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogId = useRef(0);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const notify = (message: string, error = false) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, error });
    timer.current = setTimeout(() => setToast(null), 6200);
  };
  const close = () => showDialog(null);
  const open = (spec: FormSpec) => {
    const blocked = data.preview && spec.action;
    showDialog({ key: ++dialogId.current, spec: blocked ? { title: spec.title, description: "The preview uses fictional records and is read-only.", content: <div className="preview-message"><span className="icon-tile tile-gold"><LockKeyhole size={19} /></span><div><h3>Sign in to make changes</h3><p>Use your school account to manage events and official records.</p></div><Link href="/login" className="btn btn-primary" onClick={close}>Sign in <ArrowRight size={16} /></Link></div> } : spec });
  };
  const href = (target: string, extra: Record<string, string | null | undefined> = {}) => {
    const q = new URLSearchParams();
    const params = { event: data.season?.slug, ...extra };
    for (const [key, value] of Object.entries(params)) if (value) q.set(key, value);
    const path = scopedPath(data.role, data.preview, target);
    if (path === "/" && params.event === "2026" && q.size === 1) return path;
    return `${path}${q.size ? `?${q}` : ""}`;
  };
  const run = async (action: string, payload: FormData | Record<string, unknown>, refresh = true) => {
    const multipart = payload instanceof FormData;
    const res = await fetch(action === "logout" ? "/api/auth/logout" : `/api/workspace/${action}`, {
      method: "POST", cache: "no-store", headers: { "X-MMA-Request": "1", "X-MMA-CSRF": data.csrf, ...(multipart ? {} : { "Content-Type": "application/json" }) }, body: multipart ? payload : JSON.stringify(payload),
    });
    const result: Result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || "The request failed. Please try again.");
    if (result.message) notify(result.message);
    if (result.redirect) window.location.assign(result.redirect);
    else if (refresh) router.refresh();
    return result;
  };
  return <Context.Provider value={{ data, section, href, open, close, run, notify }}>
    {children}
    {dialog && <FormDialog key={dialog.key} spec={dialog.spec} />}
    {toast && <div role={toast.error ? "alert" : "status"} className={`toast ${toast.error ? "toast-error" : ""}`}>
      {toast.error ? <CircleAlert size={20} /> : <CircleCheck size={20} />}<span>{toast.message}</span><button type="button" className="icon-button" aria-label="Dismiss message" onClick={() => setToast(null)}><X size={16} /></button>
    </div>}
  </Context.Provider>;
}

function FormDialog({ spec }: { spec: FormSpec }) {
  const { close, run } = useWorkspace();
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => { if (d?.open) d.close(); };
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!spec.action || busy) return;
    const form = new FormData(e.currentTarget);
    const multipart = spec.fields?.some((f) => f.type === "file");
    const payload: Record<string, unknown> = { ...spec.payload };
    for (const f of spec.fields || []) {
      if (f.type === "checkbox") payload[f.name] = form.has(f.name);
      else if (f.type === "multi") payload[f.name] = form.getAll(f.name);
      else payload[f.name] = form.get(f.name);
    }
    if (multipart) for (const [key, value] of Object.entries(spec.payload || {})) form.set(key, String(value ?? ""));
    setBusy(true); setError("");
    try {
      const result = await run(spec.action, multipart ? form : payload);
      close(); spec.onSuccess?.(result);
    } catch (err) { setError(err instanceof Error ? err.message : "The request could not be completed."); setBusy(false); }
  }
  return <dialog ref={ref} className="modal" aria-labelledby="modal-heading" onCancel={(e) => { e.preventDefault(); if (!busy) close(); }} onClick={(e) => { if (e.target === e.currentTarget && !busy) { const b = e.currentTarget.getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) close(); } }}>
    <div className="modal-head"><div><h2 id="modal-heading">{spec.title}</h2>{spec.description && <p>{spec.description}</p>}</div><button type="button" className="icon-button" onClick={close} disabled={busy} aria-label="Close dialog"><X size={20} /></button></div>
    {spec.action ? <form onSubmit={submit}>
      <div className="modal-body">
        {spec.content}
        <div className="field-grid">{spec.fields?.map((field) => <InputField key={field.name} field={field} value={spec.defaults?.[field.name]} />)}</div>
        {error && <div className="form-alert" role="alert"><CircleAlert size={17} />{error}</div>}
      </div>
      <div className="modal-foot"><button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button><button className={`btn ${spec.danger ? "btn-danger" : "btn-primary"}`} disabled={busy}>{busy && <span className="spinner" />}{busy ? "Saving…" : spec.submit || "Save changes"}</button></div>
    </form> : <div className="modal-body">{spec.content}</div>}
  </dialog>;
}
function InputField({ field: f, value }: { field: Field; value: NonNullable<FormSpec["defaults"]>[string] }) {
  const cls = f.full || f.type === "textarea" || f.type === "multi" || f.type === "file" ? "field full" : "field";
  const common = { name: f.name, required: f.required, placeholder: f.placeholder };
  const def = typeof value === "string" || typeof value === "number" ? value : undefined;
  if (f.type === "multi") return <fieldset className={cls}><legend>{f.label}</legend><div className="multi-options">{f.options?.length ? f.options.map((o) => <label className="check-field" key={o.value}><input type="checkbox" name={f.name} value={o.value} defaultChecked={Array.isArray(value) && value.map(String).includes(String(o.value))} />{o.label}</label>) : <small>No options available.</small>}</div>{f.hint && <small>{f.hint}</small>}</fieldset>;
  if (f.type === "checkbox") return <label className={`${cls} check-field`}><input name={f.name} type="checkbox" required={f.required} defaultChecked={!!value} /><span>{f.label}{f.hint && <small>{f.hint}</small>}</span></label>;
  return <label className={cls}><span>{f.label}{f.required && <sup> *</sup>}</span>
    {f.type === "textarea" ? <textarea {...common} defaultValue={def} rows={4} maxLength={f.maxLength} /> : f.type === "select" ? <select {...common} defaultValue={def ?? ""}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <input {...common} type={f.type || "text"} defaultValue={f.type === "file" ? undefined : def} min={f.min} max={f.max} maxLength={f.maxLength} accept={f.accept} autoComplete={f.type === "password" ? "new-password" : undefined} />}
    {f.hint && <small>{f.hint}</small>}
  </label>;
}

export function Brand({ publicBrand = false }: { publicBrand?: boolean }) {
  return <span className={`brand ${publicBrand ? "brand-light" : ""}`}><span className="brand-mark" aria-hidden="true"><svg width="26" height="27" viewBox="0 0 28 29" fill="none"><path d="M14 2.8 24 6.6v7.1c0 5.8-4.4 10.1-10 12.4-5.6-2.3-10-6.6-10-12.4V6.6L14 2.8Z" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round"/><path d="m14 7.6 1.5 3.7 4 .3-3.1 2.6 1 3.9-3.4-2.1-3.4 2.1 1-3.9-3.1-2.6 4-.3L14 7.6Z" fill="currentColor"/></svg></span><span className="brand-words"><strong>MMA</strong><small>INTRAMURALS</small></span></span>;
}
const emblems = { flame: Flame, waves: Waves, leaf: Leaf, zap: Zap, shield: Shield };
export function HouseMark({ house, size = "small" }: { house?: Pick<House, "name" | "emblem" | "color" | "logoUrl">; size?: "small" | "large" }) {
  const Icon = emblems[house?.emblem as keyof typeof emblems] || Shield;
  const hue = house?.color || "#6d7b90";
  return <span className={`house-mark house-mark-${size}`} style={{ "--house-color": hue, "--house-tint": `${hue}18` } as CSSProperties} aria-hidden="true">{house?.logoUrl ? <Image src={house.logoUrl} alt="" width={35} height={35} unoptimized /> : <Icon size={size === "large" ? 24 : 15} strokeWidth={2.15} />}</span>;
}
export function HouseName({ house }: { house?: House }) { return <span className="house-name">{house ? <><HouseMark house={house} /><span>{house.name}</span></> : <span className="muted">Unassigned</span>}</span>; }
export function Avatar({ name, tone = "gold", photo }: { name: string; tone?: "gold" | "navy"; photo?: string | null }) { return <span className={`avatar avatar-${tone}`} aria-hidden="true">{photo ? <Image src={photo} alt="" width={80} height={80} unoptimized /> : initials(name)}</span>; }
export function Badge({ children, tone = "gray", dot = false }: { children: ReactNode; tone?: string; dot?: boolean }) { return <span className={`badge badge-${tone}`}>{dot && <i />}{children}</span>; }
export function SectionHeading({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <div className="section-head"><div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>;
}
export function Panel({ title, description, action, children, className = "" }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return <div className="empty"><span className="empty-icon"><Inbox size={22} /></span><strong>{title}</strong>{hint && <p>{hint}</p>}</div>;
}
export function SearchBox({ value, change, placeholder = "Search records…" }: { value: string; change: (q: string) => void; placeholder?: string }) {
  return <label className="searchbox"><Search size={17} /><input aria-label={placeholder} placeholder={placeholder} type="search" value={value} onChange={(e) => change(e.target.value)} /></label>;
}
export function Picker({ label, value, options, change, calendar = false }: { label: string; value: string | number; options: Option[]; change: (s: string) => void; calendar?: boolean }) {
  return <label className={`picker ${calendar ? "picker-calendar" : ""}`}>{calendar && <CalendarDays size={16} />}<select aria-label={label} value={value} onChange={(e) => change(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select><ChevronDown size={14} className="picker-arrow" /></label>;
}
export function dateOptions(start: string, end: string, selected?: string) {
  const out: Option[] = [];
  for (let date = new Date(`${end}T12:00:00Z`); date.toISOString().slice(0, 10) >= start && out.length < 31; date.setUTCDate(date.getUTCDate() - 1)) {
    const day = date.toISOString().slice(0, 10);
    out.push({ value: day, label: dateLabel(day, { month: "short", day: "numeric" }) });
  }
  if (selected && !out.some((o) => o.value === selected)) out.push({ value: selected, label: dateLabel(selected, { month: "short", day: "numeric" }) });
  return out;
}
export function DetailGrid({ fields }: { fields: { label: string; value: ReactNode }[] }) { return <dl className="detail-grid">{fields.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value || "—"}</dd></div>)}</dl>; }
export function Tabs({ tabs, active, change }: { tabs: Option[]; active: string; change: (value: string) => void }) { return <div className="tabs" aria-label="Filter view">{tabs.map((t) => <button type="button" key={t.value} aria-pressed={String(t.value) === active} className={String(t.value) === active ? "selected" : ""} onClick={() => change(String(t.value))}>{t.label}</button>)}</div>; }

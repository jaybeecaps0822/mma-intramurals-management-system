"use client";

import Link from "next/link";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "X-MMA-Request": "1" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !["/admin", "/student", "/adviser"].includes(body.redirect)) throw new Error(body.error || "Could not sign in. Please try again.");
      window.location.assign(body.redirect);
    } catch (ex) { setError((ex as Error).message); setBusy(false); }
  }
  return <><form onSubmit={submit} className="login-form">
    <label className="field"><span>Student ID or username</span><span className="login-input"><UserRound size={18} /><input name="username" autoComplete="username" autoCapitalize="none" placeholder="Enter your Student ID or username" required maxLength={80} /></span></label>
    <label className="field"><span>Password</span><span className="login-input"><LockKeyhole size={17} /><input name="password" type={visible ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required maxLength={256} /><button className="icon-button" aria-label={visible ? "Hide password" : "Show password"} type="button" onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
    {error && <div role="alert" className="form-alert">{error}</div>}
    <button className="btn btn-primary login-submit" disabled={busy}>{busy ? <><span className="spinner" /> Signing in…</> : <>Sign in <ArrowRight size={18} /></>}</button>
    <p className="login-help"><ShieldCheck size={15} /> Contact your school administrator for account help.</p>
  </form><div className="login-preview-links"><strong>Just exploring?</strong><p>Try a read-only preview with fictional records.</p><div><Link href="/">Administrator</Link><Link href="/preview/student">Student</Link><Link href="/preview/adviser">Team Adviser</Link></div></div></>;
}

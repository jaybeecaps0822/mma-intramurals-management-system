"use client";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
export default function AppErrorPage({ reset }: { reset: () => void }) {
  return <main className="fallback-page"><section className="panel"><span className="public-section-label">MMA Intramurals</span><h1>We couldn’t load this page</h1><p>Try again. If the issue continues, contact your school administrator.</p><div className="row-actions"><Link className="btn" href="/"><ArrowLeft size={16} /> Overview</Link><button className="btn btn-primary" onClick={reset}><RotateCcw size={16} /> Try again</button></div></section></main>;
}

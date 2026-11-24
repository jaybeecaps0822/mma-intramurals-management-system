import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export default function NotFound() {
  return <main className="fallback-page"><section className="panel"><span className="public-section-label">404 · MMA Intramurals</span><h1>Page not found</h1><p>This page doesn’t exist or isn’t available in your workspace.</p><Link href="/" className="btn btn-primary"><ArrowLeft size={16} /> Back to overview</Link></section></main>;
}

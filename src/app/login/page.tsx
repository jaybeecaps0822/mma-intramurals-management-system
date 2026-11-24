import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import { Brand } from "@/components/ui";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in | MMA Intramurals" };
export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(`/${session.role}`);
  return <main className="login-page"><section className="login-art"><Link href="/" aria-label="MMA Intramurals preview"><Brand /></Link><div className="login-story"><span className="public-kicker"><i /> MMA INTRAMURALS</span><h1>School spirit.<br />On and off the court.</h1><p>One workspace for the people, games, and moments that make intramurals.</p></div><Link href="/public" className="login-public-link">Visit the public website <ArrowUpRight size={16} /></Link></section><section className="login-area"><Link className="login-back" href="/"><ArrowLeft size={16} /> Back to preview</Link><div className="login-box"><div className="mobile-login-brand"><Brand publicBrand /></div><h2>Sign in to your workspace</h2><p>Use your school account to continue.</p><LoginForm /></div><footer>MMA Intramurals Management System</footer></section></main>;
}

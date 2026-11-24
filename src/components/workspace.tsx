"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bell, CalendarDays, CalendarRange, ChevronDown, ChevronRight, ClipboardList, ExternalLink, Globe, GraduationCap, LayoutGrid, LogIn, LogOut, Medal, Megaphone, Menu, QrCode, Receipt, ScanFace, Settings, Shield, Trophy, UserRound, UsersRound, X, type LucideIcon } from "lucide-react";
import { nav, sectionName } from "@/lib/navigation";
import { dateLabel, localDate, roleName, scopedPath, type Role, type WorkspaceData } from "@/lib/model";
import { Avatar, Brand, Picker, WorkspaceProvider, useWorkspace } from "@/components/ui";
import { Overview } from "@/components/overview";
import { AdvisersPage, EventsPage, HousesPage, ProfilePage, SettingsPage, StudentsPage } from "@/components/directory";
import { AnnouncementsPage, SchedulePage, ScoresPage, SportsPage } from "@/components/play";
import { AttendancePage, ReportsPage, ScannerPage } from "@/components/operations";
import { FaceAttendancePage } from "@/components/face-attendance";
import { SanctionsPage } from "@/components/sanction-ledger";

const icons: Record<string, LucideIcon> = { overview: LayoutGrid, students: UsersRound, houses: Shield, advisers: GraduationCap, events: CalendarRange, sports: Trophy, schedule: CalendarDays, scores: Medal, attendance: QrCode, announcements: Megaphone, reports: ClipboardList, settings: Settings, profile: UserRound, scan: QrCode, face: ScanFace, sanctions: Receipt };
const sections: Record<string, () => React.JSX.Element> = { overview: Overview, students: StudentsPage, houses: HousesPage, advisers: AdvisersPage, events: EventsPage, sports: SportsPage, schedule: SchedulePage, scores: ScoresPage, attendance: AttendancePage, announcements: AnnouncementsPage, reports: ReportsPage, settings: SettingsPage, profile: ProfilePage, scan: ScannerPage, face: FaceAttendancePage, sanctions: SanctionsPage };

function Shell() {
  const { data, section, href, run, notify } = useWorkspace();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false), [popover, setPopover] = useState<"account" | "bell" | null>(null), [signingOut, setSigningOut] = useState(false);
  const right = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function click(e: PointerEvent) { if (e.target instanceof Node && !right.current?.contains(e.target)) setPopover(null); }
    function escape(e: KeyboardEvent) { if (e.key === "Escape") { setPopover(null); setMenuOpen(false); } }
    document.addEventListener("pointerdown", click); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", click); document.removeEventListener("keydown", escape); };
  }, []);
  const Current = sections[section] || Overview;
  const notices = data.announcements.filter((n) => n.publishedAt).slice(0, 3);
  const publicHref = `/public${data.season?.published ? `?event=${encodeURIComponent(data.season.slug)}` : ""}`;
  const toggle = (type: "account" | "bell") => setPopover((p) => p === type ? null : type);
  return <div className="app-frame">
    <a href="#main" className="skip-link">Skip to content</a>
    {menuOpen && <button className="nav-backdrop" type="button" aria-label="Close sidebar" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`} id="workspace-menu">
      <div className="sidebar-brand"><Link href={href("overview")} aria-label="MMA Intramurals overview" onClick={() => setMenuOpen(false)}><Brand /></Link><button type="button" className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X size={20} /></button></div>
      <nav className="sidebar-nav" aria-label="Workspace navigation">{nav[data.role].map((group) => <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map((item) => {
        const Icon = icons[item];
        return <Link key={item} className={`nav-link ${item === section ? "nav-active" : ""}`} aria-current={item === section ? "page" : undefined} href={href(item)} onClick={() => setMenuOpen(false)}><Icon size={18} strokeWidth={1.8} /><span>{sectionName(item, data.role)}</span></Link>;
      })}</div>)}</nav>
      <div className="side-bottom"><Link className="nav-link site-link" href={publicHref}><Globe size={18} strokeWidth={1.8} /><span>Public Website</span><ExternalLink size={14} className="side-external" /></Link><div className="side-foot"><span className="side-indicator" />{data.season ? `S.Y. ${data.season.schoolYear}` : "Intramurals workspace"}</div></div>
    </aside>
    <div className="main-frame">
      <header className="topbar"><div className="topbar-left"><button type="button" className="icon-button menu-toggle" aria-label="Open sidebar" aria-expanded={menuOpen} aria-controls="workspace-menu" onClick={() => setMenuOpen(!menuOpen)}><Menu size={22} /></button><nav className="breadcrumb" aria-label="Breadcrumb"><Link href={href("overview")}>Workspace</Link><ChevronRight size={13} /><span aria-current="page">{sectionName(section, data.role)}</span></nav></div>
        <div className="topbar-right" ref={right}>
          {data.preview && <Link className="preview-chip" href="/login" title="This workspace shows fictional records. Sign in for official data."><span /> Preview</Link>}
          <div className="topbar-item"><button className="icon-button bell-button" aria-label="Notifications" aria-expanded={popover === "bell"} type="button" onClick={() => toggle("bell")}><Bell size={20} strokeWidth={1.8} />{notices.length > 0 && <i />}</button>
            {popover === "bell" && <div className="top-popover notifications-popover"><div className="popover-title"><strong>Notifications</strong><small>Latest event announcements</small></div>{notices.length ? notices.map((n) => <Link href={href("announcements")} key={n.id} onClick={() => setPopover(null)}><span className="icon-tile tile-gold"><Megaphone size={15} /></span><span><strong>{n.title}</strong><small>{dateLabel(localDate(new Date(n.publishedAt!), data.timezone), { month: "short", day: "numeric" })}</small></span></Link>) : <p>You’re all caught up.</p>}</div>}
          </div>
          <span className="topbar-divider" />
          <div className="topbar-item"><button className="account-button" type="button" aria-label="Account menu" aria-expanded={popover === "account"} onClick={() => toggle("account")}><Avatar name={data.viewer.name} /><span className="account-info"><strong>{data.viewer.name}</strong><small>{roleName[data.role]}</small></span><ChevronDown size={15} className="account-chevron" /></button>
            {popover === "account" && <div className="top-popover account-popover"><div className="popover-title"><strong>{data.preview ? "Workspace preview" : data.viewer.name}</strong><small>{data.preview ? "Explore with fictional records" : data.viewer.username}</small></div>
              {data.preview ? <>{(["admin", "student", "adviser"] as Role[]).map((role) => <Link key={role} href={scopedPath(role, true)} onClick={() => setPopover(null)}><UserRound size={16} /><span>{roleName[role]}</span>{role === data.role && <span className="current-dot" />}</Link>)}<Link className="popover-call" href="/login"><LogIn size={16} /> Sign in to workspace</Link></> : <>{data.role === "admin" && <Link href={href("settings")} onClick={() => setPopover(null)}><Settings size={16} /> Settings</Link>}{data.role === "student" && <Link href={href("profile")} onClick={() => setPopover(null)}><UserRound size={16} /> My profile</Link>}<button type="button" className="popover-call" disabled={signingOut} onClick={async () => { setSigningOut(true); try { await run("logout", {}); } catch (error) { notify((error as Error).message, true); setSigningOut(false); } }}><LogOut size={16} /> {signingOut ? "Signing out…" : "Sign out"}</button></>}
            </div>}
          </div>
        </div></header>
      <main id="main" className="workspace-main">
        {section !== "overview" && data.seasons.length > 0 && <div className="context-row"><span><CalendarDays size={14} /> Selected event</span><Picker label="Selected intramurals event" value={data.season?.slug || ""} options={data.seasons.map((e) => ({ value: e.slug, label: e.title }))} change={(event) => router.push(href(section, { event }))} /></div>}
        <Current />
        <footer className="workspace-footer"><span>MMA Intramurals Management System</span>{data.preview ? <Link href="/login">Fictional preview · Sign in <ArrowUpRight size={13} /></Link> : <span>{data.schoolName} · {data.timezone}</span>}</footer>
      </main>
    </div>
  </div>;
}
export default function Workspace({ data, section = "overview" }: { data: WorkspaceData; section?: string }) {
  return <WorkspaceProvider key={`${data.preview}/${data.role}/${section}/${data.season?.slug || "none"}`} data={data} section={section}><Shell /></WorkspaceProvider>;
}

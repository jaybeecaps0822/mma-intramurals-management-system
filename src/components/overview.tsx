"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Award, CalendarDays, CircleCheck, ClipboardCheck, Clock3, MapPin, Megaphone, QrCode, Shield, Trophy, UsersRound, type LucideIcon } from "lucide-react";
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from "chart.js";
import { dateLabel, dateRange, durationLabel, localDate, matchLabel, timeLabel, type Announcement, type AttendanceGroup, type House, type Match, type Season, type Standing } from "@/lib/model";
import { Avatar, Badge, dateOptions, Empty, HouseMark, HouseName, Panel, Picker, useWorkspace } from "@/components/ui";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);
const number = new Intl.NumberFormat("en-US");
const chartColors = ["#253c63", "#f2aa47", "#dbe2ec"];
const series = ["Present", "Late", "Absent"];
export const divisionName: Record<string, string> = { male: "Men’s", female: "Women’s", mixed: "Mixed" };

export function Hero({ season, compact = false }: { season: Season; compact?: boolean }) {
  return <section className={`event-hero ${compact ? "event-hero-compact" : ""}`} aria-label="Selected event">
    <div className="event-hero-inner"><span className={`event-tag event-tag-${season.state}`}><i />{season.state === "active" ? "Active event" : season.state === "completed" ? "Past event" : "Draft event"}</span>
      <h2>{season.title}</h2><p>{season.description || "The home of school sports and house competition."}</p>
      <div className="event-meta"><span><CalendarDays size={16} />{dateRange(season.startDate, season.endDate)}</span><span><MapPin size={16} />{season.location}</span></div>
    </div>
  </section>;
}

export function Stat({ label, value, hint, icon: Icon, tone, extra }: { label: string; value: string | number; hint: string; icon: LucideIcon; tone: string; extra?: React.ReactNode }) {
  return <section className="stat-card"><div className="stat-top"><span className={`icon-tile tile-${tone}`}><Icon size={19} strokeWidth={1.95} /></span><h2>{label}</h2></div><div className="stat-value">{typeof value === "number" ? number.format(value) : value}</div><div className="stat-bottom"><span>{hint}</span>{extra}</div></section>;
}

export function AttendanceChart({ groups }: { groups: AttendanceGroup[] }) {
  const el = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!el.current || !groups.length) return;
    const peak = Math.max(1, ...groups.flatMap((g) => [g.present, g.late, g.absent]));
    const interval = peak > 160 ? (peak <= 320 ? 80 : Math.ceil(peak / 400) * 100) : peak > 40 ? Math.ceil(peak / 20) * 5 : Math.max(1, Math.ceil(peak / 4));
    const graph = new Chart(el.current, {
      type: "bar", data: { labels: groups.map((h) => h.name), datasets: ["present", "late", "absent"].map((key, i) => ({
        label: series[i], data: groups.map((h) => h[key as "present" | "late" | "absent"]), backgroundColor: chartColors[i], borderRadius: 4, borderSkipped: "bottom" as const, barPercentage: .84, categoryPercentage: .72, maxBarThickness: 25,
      })) },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
        layout: { padding: { left: 0, right: 1 } },
        scales: { x: { grid: { display: false, drawTicks: false }, border: { display: false }, ticks: { minRotation: 0, maxRotation: groups.length > 5 ? 25 : 0, padding: 10, color: "#607086", font: { family: "Inter", size: 11, weight: 500 } } },
          y: { min: 0, max: interval * 4, border: { display: false, dash: [4, 4] }, grid: { color: "#e9edf3", drawTicks: false }, ticks: { stepSize: interval, padding: 10, color: "#79869a", font: { family: "Inter", size: 10 } } } },
        plugins: { tooltip: { backgroundColor: "#16243c", padding: 11, boxPadding: 4, displayColors: true, usePointStyle: true, titleFont: { family: "Inter" }, bodyFont: { family: "Inter" } } },
      },
    });
    return () => graph.destroy();
  }, [groups]);
  if (!groups.length) return <Empty title="No attendance to compare" hint="Enroll houses in an event to see attendance here." />;
  return <><div className="chart-legend">{series.map((name, i) => <span key={name}><i style={{ background: chartColors[i] }} />{name}</span>)}</div><div className="chart-canvas"><canvas ref={el} role="img" aria-label={`Attendance by house. ${groups.map((g) => `${g.name}: ${g.present} present, ${g.late} late, ${g.absent} absent`).join("; ")}`} /></div></>;
}

export function StandingsTable({ standings, houses, full = false }: { standings: Standing[]; houses: House[]; full?: boolean }) {
  if (!standings.length) return <Empty title="No standings yet" hint="House rankings will appear here as results are recorded." />;
  return <div className="table-wrap"><table className={`standings-table ${full ? "standings-full" : ""}`}><thead><tr><th scope="col" className="rank-col">#</th><th scope="col">House</th><th scope="col" title="Gold medals"><span className="medal medal-gold"><Award size={14} /><span className="sr-only">Gold</span></span></th><th scope="col" title="Silver medals"><span className="medal medal-silver"><Award size={14} /><span className="sr-only">Silver</span></span></th><th scope="col" title="Bronze medals"><span className="medal medal-bronze"><Award size={14} /><span className="sr-only">Bronze</span></span></th>{full && <th scope="col">Wins</th>}<th scope="col" title="Competition points">Pts</th></tr></thead>
    <tbody>{standings.map((standing) => <tr key={standing.houseId}><td className="rank-col"><span className={`rank-num ${standing.rank === 1 ? "rank-one" : ""}`}>{standing.rank}</span></td><td><HouseName house={houses.find((h) => h.id === standing.houseId)} /></td><td>{standing.gold}</td><td>{standing.silver}</td><td>{standing.bronze}</td>{full && <td>{standing.wins}</td>}<td><strong>{number.format(standing.points)}</strong></td></tr>)}</tbody></table></div>;
}

export function MatchTeam({ id }: { id: number }) {
  const { data } = useWorkspace();
  return <HouseName house={data.houses.find((h) => h.id === id)} />;
}
export function MatchStatus({ match }: { match: Match }) { return <Badge tone={{ scheduled: "blue", live: "red", completed: "green", cancelled: "gray" }[match.status]} dot>{matchLabel[match.status]}</Badge>; }
export function MatchList({ games }: { games: Match[] }) {
  const { data } = useWorkspace();
  if (!games.length) return <Empty title="No upcoming matches" hint="New fixtures will appear here when they are scheduled." />;
  return <div className="match-list">{games.map((m) => <div className="match-row" key={m.id}>
    <div className="match-sport"><strong>{m.sport}</strong><small>{divisionName[m.division] || m.division} division · {m.stage}</small></div>
    <div className="match-pair"><HouseMark house={data.houses.find((h) => h.id === m.homeId)} /><span>vs</span><HouseMark house={data.houses.find((h) => h.id === m.awayId)} /><span className="sr-only">{data.houses.find((h) => h.id === m.homeId)?.name} versus {data.houses.find((h) => h.id === m.awayId)?.name}</span></div>
    <div className="match-when"><strong>{timeLabel(m.startTime)}</strong><small>{m.date === data.today ? "Today" : dateLabel(m.date, { month: "short", day: "numeric" })} · {m.venue}</small></div>
  </div>)}</div>;
}
export function NoticeList({ notices }: { notices: Announcement[] }) {
  const { data, open } = useWorkspace();
  if (!notices.length) return <Empty title="You’re all caught up" hint="School announcements will appear here." />;
  return <div className="notice-list">{notices.map((n, i) => <button className="notice-row" type="button" key={n.id} onClick={() => open({ title: n.title, description: n.publishedAt ? dateLabel(localDate(new Date(n.publishedAt), data.timezone)) : "Draft announcement", content: <p className="notice-body">{n.body}</p> })}>
    <span className={`icon-tile tile-${i % 2 ? "blue" : "gold"}`}><Megaphone size={16} /></span><span><strong>{n.title}</strong><small>{n.publishedAt ? dateLabel(localDate(new Date(n.publishedAt), data.timezone), { month: "short", day: "numeric" }) : "Draft"}</small></span><ArrowRight size={15} className="notice-arrow" />
  </button>)}</div>;
}
function StudentSummary() {
  const { data, href } = useWorkspace();
  const person = data.students.find((s) => s.id === data.profileId);
  const house = data.houses.find((h) => h.id === person?.houseId);
  const row = data.attendance[0];
  const place = data.standings.find((r) => r.houseId === house?.id);
  return <div className="overview-grid student-summary">
    <Panel title="My attendance" description={dateLabel(data.day, { weekday: "long", month: "short", day: "numeric" })} action={<Link href={href("scan")} className="btn btn-primary btn-sm"><QrCode size={16} /> Scan QR</Link>}>
      <div className="student-time"><div><small>TIME IN</small><strong>{timeLabel(row?.timeIn || null, data.timezone)}</strong></div><div><small>TIME OUT</small><strong>{timeLabel(row?.timeOut || null, data.timezone)}</strong></div><div><small>DURATION</small><strong>{durationLabel(row?.timeIn || null, row?.timeOut || null)}</strong></div></div>
      <Link className="text-link inline-panel-link" href={href("attendance")}>View attendance history <ArrowRight size={14} /></Link>
    </Panel>
    <Panel title="My house" description="Your team for this season" action={<Link href={href("houses")} className="text-link">View house <ArrowRight size={14} /></Link>}>
      <div className="student-house"><HouseMark house={house} size="large" /><div><h3>{house?.name || "No house assigned"}</h3><p>{house?.advisers.join(", ") || "No adviser assigned"}</p></div>{place && <Badge tone="gold">Rank #{place.rank}</Badge>}</div>
      <div className="profile-strip"><Avatar name={data.viewer.name} photo={person?.photoUrl} /><div><strong>{data.viewer.name}</strong><small>{person?.number || data.viewer.username}</small></div><Link className="text-link" href={href("profile")}>My profile <ArrowRight size={14} /></Link></div>
    </Panel>
  </div>;
}

export function Overview() {
  const { data, href } = useWorkspace();
  const router = useRouter();
  const { role, season, stats } = data;
  const overviewTitle = role === "admin" ? "Dashboard Overview" : role === "student" ? "Student Dashboard" : "Adviser Dashboard";
  const upcoming = data.matches.filter((m) => m.status === "scheduled").sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const current = data.day === data.today;
  const percent = stats.students ? Math.round(stats.present / stats.students * 100) : 0;
  const lastSeason = data.preview && season?.slug === "2026" && role === "admin";
  const dateEnd = season ? (data.today > season.endDate ? season.endDate : data.today < season.startDate ? season.startDate : data.today) : data.today;
  const dateChoices = season ? dateOptions(season.startDate, dateEnd, data.day) : [{ value: data.day, label: dateLabel(data.day, { month: "short", day: "numeric" }) }];
  const headingDay = data.preview && season?.state === "completed" ? data.day : data.today;
  return <>
    <div className="dashboard-intro">
      <div><div className="date-eyebrow"><CalendarDays size={13} strokeWidth={2} />{dateLabel(headingDay, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div><h1>{overviewTitle}</h1><p>{role === "admin" ? "Here’s what’s happening across your intramurals today." : role === "student" ? `Welcome, ${data.viewer.name.split(" ")[0]}. Find your house, games, and attendance here.` : `Welcome, ${data.viewer.name.split(" ")[0]}. Monitor your houses and their event participation.`}</p></div>
      {data.seasons.length ? <Picker label="Intramurals season" calendar value={season?.slug || ""} options={data.seasons.map((e) => ({ value: e.slug, label: e.title.replace(/^MMA /, "") }))} change={(event) => router.push(href("overview", { event }))} /> : role === "admin" && <Link href={href("events")} className="btn btn-primary"><CalendarDays size={16} /> Manage events</Link>}
    </div>
    {season ? <Hero season={season} /> : <Panel title="Your intramurals workspace" description="Create an event and enroll houses to begin organizing your season."><div className="welcome-panel">{role === "admin" ? <Link className="btn btn-primary" href={href("events")}>Set up an event <ArrowRight size={16} /></Link> : <p>You aren’t assigned to an event yet. Check with your intramurals administrator.</p>}</div></Panel>}
    {role === "student" ? <StudentSummary /> : <>
      <div className="stats-grid">
        <Stat label={role === "adviser" ? "House Members" : "Total Students"} value={stats.students} hint={role === "adviser" ? "Across your assigned houses" : "Registered for this event"} icon={UsersRound} tone="blue" extra={lastSeason && <span className="trend"><ArrowUpRight size={13} /> 12.2%</span>} />
        {role === "admin" ? <><Stat label="Active Houses" value={stats.houses} hint="Competing this season" icon={Shield} tone="gold" extra={<span className="house-dots" aria-hidden="true">{data.houses.filter((h) => h.inSeason).slice(0, 4).map((h) => <i key={h.id} style={{ background: h.color }} />)}</span>} /><Stat label="Sports Events" value={stats.sports} hint="Team & individual sports" icon={Trophy} tone="violet" /></> : <><Stat label="Late Arrivals" value={stats.late} hint={`After ${timeLabel(season?.cutoff || "08:00")}`} icon={Clock3} tone="gold" /><Stat label="Pending TIME OUT" value={stats.pending} hint="Checked in, not yet out" icon={ClipboardCheck} tone="violet" /></>}
        <Stat label={current && season?.state !== "completed" ? "Present Today" : "Present on Selected Day"} value={stats.present} hint={`${percent}% of registered students`} icon={CircleCheck} tone="green" />
      </div>
      <div className="overview-grid main-overview">
        <Panel title="Attendance Overview" description="Daily attendance across houses" className="chart-panel" action={<Picker label="Attendance chart date" calendar value={data.day} options={dateChoices} change={(day) => router.push(href("overview", { day }))} />}>
          <AttendanceChart groups={data.groups} />
        </Panel>
        <Panel title="House Standings" description="Overall medal and points tally" className="ranking-panel" action={<Link className="text-link" href={href("scores")}>View all <ArrowRight size={14} /></Link>}>
          <StandingsTable standings={data.standings} houses={data.houses} />
        </Panel>
      </div>
    </>}
    <div className="overview-grid lower-overview">
      <Panel title="Upcoming Matches" description={upcoming.length ? `${upcoming.length} scheduled ${upcoming.length === 1 ? "fixture" : "fixtures"}` : "The next games on the calendar"} action={<Link className="text-link" href={href("schedule")}>View schedule <ArrowRight size={14} /></Link>}><MatchList games={upcoming.slice(0, 3)} /></Panel>
      <Panel title="Announcements" description="The latest from event organizers" action={<Link className="text-link" href={href("announcements")}>View all <ArrowRight size={14} /></Link>}><NoticeList notices={data.announcements.filter((n) => n.publishedAt).slice(0, 3)} /></Panel>
    </div>
    {role !== "student" && <div className="overview-summary"><span><UsersRound size={15} /> <strong>{stats.advisers}</strong> team advisers</span><span><ArrowDownRight size={15} /> <strong>{stats.absent}</strong> absent on {dateLabel(data.day, { month: "short", day: "numeric" })}</span><span><Trophy size={15} /> <strong>{data.matches.length}</strong> total matches</span><span><i className="live-dot" /><strong>{data.matches.filter((m) => m.status === "live").length}</strong> live</span><span><CircleCheck size={15} /><strong>{data.matches.filter((m) => m.status === "completed").length}</strong> completed</span></div>}
  </>;
}

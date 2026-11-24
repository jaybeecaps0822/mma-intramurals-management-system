"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Download, FileSpreadsheet, ImagePlus, ListChecks, MapPin, Pencil, Plus, Shield, Upload, UserRound, UsersRound } from "lucide-react";
import { dateLabel, dateRange, roleName, type Account, type Adviser, type House, type Season, type Student } from "@/lib/model";
import { Avatar, Badge, DetailGrid, Empty, HouseMark, HouseName, Panel, Picker, SearchBox, SectionHeading, Tabs, useWorkspace, type Field, type Option } from "@/components/ui";
import { downloadCsv } from "@/components/exports";
import { useUploadImage } from "@/components/media-tools";

const all = (label: string): Option => ({ value: "all", label });
const unset = (label: string): Option => ({ value: "", label });
const passwordField = (required: boolean): Field => ({ name: "password", label: required ? "Initial password" : "Reset password", type: "password", required, maxLength: 128, hint: required ? "Use 12 or more characters. Share it privately." : "Leave blank to keep the current password." });
const activeField: Field = { name: "active", label: "Account enabled", type: "checkbox" };
const seasonEdit = (season: Season | null) => season && season.state !== "completed" ? season.id : null;
const importHeader = ["Student ID", "First Name", "Middle Name", "Last Name", "Course", "Year Level", "Gender", "Phone", "Email", "House"];

export function StudentsPage() {
  const { data, open } = useWorkspace();
  const uploadImage = useUploadImage();
  const [q, setQ] = useState(""), [house, setHouse] = useState("all"), [course, setCourse] = useState("all"), [year, setYear] = useState("all"), [page, setPage] = useState(0);
  const admin = data.role === "admin";
  const eventId = seasonEdit(data.season);
  const choices = data.houses.filter((h) => h.inSeason && data.scopedHouseIds.includes(h.id));
  const shown = data.students.filter((s) => `${s.name} ${s.number} ${s.course}`.toLowerCase().includes(q.trim().toLowerCase()) && (house === "all" || (house === "unassigned" ? s.houseId === null : String(s.houseId) === house)) && (course === "all" || s.course === course) && (year === "all" || String(s.year) === year));
  const idx = Math.min(page, Math.max(0, Math.ceil(shown.length / 12) - 1));
  function edit(s?: Student) {
    const fields: Field[] = [
      { name: "number", label: "Student ID", required: true, maxLength: 80 }, { name: "firstName", label: "First name", required: true, maxLength: 75 }, { name: "middleName", label: "Middle name", maxLength: 75 }, { name: "lastName", label: "Last name", required: true, maxLength: 75 },
      { name: "course", label: "Course or department", required: true, maxLength: 100 }, { name: "year", label: "Year level", type: "number", required: true, min: 1, max: 12 },
      { name: "gender", label: "Gender", maxLength: 24 }, { name: "phone", label: "Contact number", maxLength: 32 }, { name: "email", label: "Email address", type: "email", maxLength: 254 },
      ...(eventId ? [{ name: "houseId", label: "House assignment", type: "select" as const, options: [unset("Unassigned"), ...choices.map((h) => ({ value: h.id, label: h.name }))] }] : []), passwordField(!s), activeField,
    ];
    open({ title: s ? "Edit student" : "Register student", description: "The Student ID is the username for this account.", action: "student.save", fields, defaults: s ? { ...s } : { active: true, year: 1 }, payload: { id: s?.id, eventId }, submit: s ? "Save student" : "Register student" });
  }
  function view(s: Student) {
    const team = data.houses.find((h) => h.id === s.houseId);
    const sports = data.athletes.filter((x) => x.studentId === s.id).map((x) => data.sports.find((p) => p.id === x.sportId)?.name).filter(Boolean);
    open({ title: s.name, description: `Student profile · ${s.number}`, content: <><div className="modal-profile"><Avatar name={s.name} tone="navy" photo={s.photoUrl} /><div><h3>{s.name}</h3><p>{s.course} · Year {s.year}</p></div><Badge tone={s.active ? "green" : "gray"} dot>{s.active ? "Active" : "Disabled"}</Badge></div><DetailGrid fields={[{ label: "Student ID", value: s.number }, { label: "Gender", value: s.gender }, { label: "Email", value: s.email }, { label: "Contact number", value: s.phone }, { label: "Assigned house", value: <HouseName house={team} /> }, { label: "Registered sports", value: sports.join(", ") }]} /></> });
  }
  function openImport() {
    open({ title: "Import students", description: "Upload up to 500 new students. Imported accounts are disabled until you set their passwords.", action: "student.import", payload: { eventId }, fields: [{ name: "file", label: "Student spreadsheet", type: "file", accept: ".csv,.xlsx", required: true, hint: "CSV or XLSX · Maximum 2 MB · Student IDs must be unique." }], content: <button className="btn btn-sm import-template" type="button" onClick={() => downloadCsv("mma-student-template.csv", importHeader, [])}><FileSpreadsheet size={16} /> Download template</button>, submit: "Import records" });
  }
  const doExport = () => downloadCsv("mma-students.csv", [...importHeader, "Account Status"], shown.map((s) => [s.number, s.firstName, s.middleName, s.lastName, s.course, s.year, s.gender, s.phone, s.email, data.houses.find((h) => h.id === s.houseId)?.name, s.active ? "Active" : "Disabled"]));
  return <>
    <SectionHeading title={admin ? "Students" : "House Members"} description={admin ? "Register students, manage school accounts, and assign members to houses." : "View profiles and sports participation for the houses you advise."} actions={<>{admin && <button className="btn" onClick={openImport}><Upload size={16} /> Import</button>}<button className="btn" disabled={!shown.length} onClick={doExport}><Download size={16} /> Export CSV</button>{admin && <button className="btn btn-primary" onClick={() => edit()}><Plus size={17} /> Add student</button>}</>} />
    <Panel title="Student directory" description={`${shown.length.toLocaleString()} of ${data.students.length.toLocaleString()} records`} className="records-panel">
      <div className="filter-row"><SearchBox value={q} change={(x) => { setQ(x); setPage(0); }} placeholder="Search name or Student ID…" /><Picker label="Filter by house" value={house} change={(x) => { setHouse(x); setPage(0); }} options={[all("All houses"), ...choices.map((h) => ({ value: h.id, label: h.name })), ...(admin ? [{ value: "unassigned", label: "Unassigned" }] : [])]} /><Picker label="Filter by course" value={course} change={(x) => { setCourse(x); setPage(0); }} options={[all("All courses"), ...[...new Set(data.students.map((s) => s.course))].sort().map((x) => ({ value: x, label: x }))]} /><Picker label="Filter by year" value={year} change={(x) => { setYear(x); setPage(0); }} options={[all("All years"), ...[...new Set(data.students.map((s) => s.year))].sort((a, b) => a - b).map((x) => ({ value: x, label: `Year ${x}` }))]} /></div>
      {shown.length ? <><div className="table-wrap"><table className="data-table"><thead><tr><th>Student</th><th>Course</th><th>Year</th><th>House</th><th>Account</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{shown.slice(idx * 12, idx * 12 + 12).map((s) => <tr key={s.id}><td><button className="person-cell" type="button" onClick={() => view(s)}><Avatar name={s.name} tone="navy" photo={s.photoUrl} /><span><strong>{s.name}</strong><small>{s.number}</small></span></button></td><td>{s.course}</td><td>Year {s.year}</td><td><HouseName house={choices.find((h) => h.id === s.houseId)} /></td><td><Badge tone={s.active ? "green" : "gray"} dot>{s.active ? "Active" : "Disabled"}</Badge></td><td><div className="row-actions">{admin && <button className="icon-button" aria-label={`Update photo for ${s.name}`} title="Update student photo" onClick={() => uploadImage("student", s.id, s.name)}><ImagePlus size={16} /></button>}<button className="icon-button" title={admin ? `Edit ${s.name}` : `View ${s.name}`} aria-label={admin ? `Edit ${s.name}` : `View ${s.name}`} onClick={() => admin ? edit(s) : view(s)}>{admin ? <Pencil size={16} /> : <ArrowRight size={16} />}</button></div></td></tr>)}</tbody></table></div><div className="table-footer"><span>Showing {idx * 12 + 1}–{Math.min(idx * 12 + 12, shown.length)} of {shown.length}</span><div><button type="button" className="btn btn-sm" disabled={idx === 0} onClick={() => setPage(idx - 1)}><ArrowLeft size={15} /> Previous</button><button type="button" className="btn btn-sm" disabled={(idx + 1) * 12 >= shown.length} onClick={() => setPage(idx + 1)}>Next <ArrowRight size={15} /></button></div></div></> : <Empty title="No matching students" hint="Try a different search or clear your filters." />}
    </Panel>
  </>;
}

export function HousesPage() {
  const { data, open, href } = useWorkspace();
  const uploadImage = useUploadImage();
  const admin = data.role === "admin";
  const eventId = seasonEdit(data.season);
  const houses = data.houses.filter((h) => admin || data.scopedHouseIds.includes(h.id));
  function edit(h?: House) {
    open({ title: h ? "Edit house" : "Create house", description: "House identities are shared across seasons; enroll them in each event separately.", action: "house.save", payload: { id: h?.id, eventId }, defaults: h || { color: "#4279e1", emblem: "shield", active: true, inSeason: !!eventId }, fields: [
      { name: "name", label: "House name", required: true }, { name: "color", label: "House color", type: "color", required: true },
      { name: "emblem", label: "Emblem", type: "select", required: true, options: ["shield", "flame", "waves", "leaf", "zap"].map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) })) },
      { name: "active", label: "House enabled", type: "checkbox" }, { name: "description", label: "House description", type: "textarea", maxLength: 1500 },
      ...(eventId ? [{ name: "inSeason", label: "Participates in the selected event", type: "checkbox" as const, full: true }] : []),
    ] });
  }
  function show(h: House) {
    const people = data.students.filter((s) => s.houseId === h.id);
    open({ title: `${h.name} members`, description: `${h.advisers.length ? `Advised by ${h.advisers.join(", ")}` : "No adviser assigned"}${data.preview ? " · Sample roster" : ""}`, content: people.length ? <div className="mini-people">{people.map((s) => <div key={s.id}><Avatar name={s.name} tone="navy" photo={s.photoUrl} /><span><strong>{s.name}</strong><small>{s.course} · Year {s.year}</small></span></div>)}</div> : <Empty title="No house members yet" /> });
  }
  return <><SectionHeading title={admin ? "Team Houses" : data.role === "adviser" ? "My Houses" : "My House"} description={admin ? "Manage house identities, event participation, and house rosters." : "Meet the people and advisers on your intramurals team."} actions={admin && <button className="btn btn-primary" onClick={() => edit()}><Plus size={17} /> Create house</button>} />
    {houses.length ? <div className="tile-grid house-grid">{houses.map((h) => {
      const standing = data.standings.find((s) => s.houseId === h.id);
      return <article className="panel house-card" key={h.id} style={{ "--house-color": h.color } as CSSProperties}><div className="card-heading"><HouseMark house={h} size="large" />{standing ? <Badge tone="gold">Rank #{standing.rank}</Badge> : <Badge>{h.inSeason ? "Competing" : "Not enrolled"}</Badge>}</div><h2>{h.name}</h2><p>{h.description || "No description added."}</p><div className="card-facts"><span><UsersRound size={16} /> {h.members.toLocaleString()} members</span><span><UserRound size={16} /> {h.advisers.join(", ") || "No adviser assigned"}</span>{standing && <span><Shield size={16} /> {standing.points} points · {standing.gold + standing.silver + standing.bronze} medals</span>}</div><div className="card-actions"><button className="btn btn-sm" onClick={() => show(h)}>View members <ArrowRight size={14} /></button>{admin && <div className="row-actions"><button className="icon-button" aria-label={`Upload logo for ${h.name}`} title="Upload house logo" onClick={() => uploadImage("house", h.id, h.name)}><ImagePlus size={16} /></button><button className="icon-button" title="Edit house" aria-label={`Edit ${h.name}`} onClick={() => edit(h)}><Pencil size={16} /></button></div>}</div></article>;
    })}</div> : <div className="panel"><Empty title="No assigned houses" hint={admin ? "Use Create house to add a house." : "An administrator can assign your house for this event."} /></div>}
    {admin && <p className="page-tip"><ListChecks size={16} /> Assign individual members from the <Link className="text-link" href={href("students")}>student directory</Link>.</p>}</>;
}

export function AdvisersPage() {
  const { data, open } = useWorkspace();
  const [query, setQuery] = useState("");
  const eventId = seasonEdit(data.season);
  const match = data.advisers.filter((a) => `${a.name} ${a.department} ${a.username}`.toLowerCase().includes(query.toLowerCase()));
  function edit(a?: Adviser) {
    open({ title: a ? "Edit team adviser" : "Add team adviser", description: "An adviser can oversee one or more houses in this event.", action: "adviser.save", payload: { id: a?.id, eventId }, defaults: a || { active: true }, fields: [
      { name: "name", label: "Full name", required: true }, { name: "username", label: "Username", required: true }, { name: "department", label: "Department", required: true }, { name: "email", label: "Email", type: "email" }, passwordField(!a), activeField,
      ...(eventId ? [{ name: "houseIds", label: "Assigned houses", type: "multi" as const, options: data.houses.filter((h) => h.inSeason).map((h) => ({ value: h.id, label: h.name })) }] : []),
    ] });
  }
  return <><SectionHeading title="Team Advisers" description="Manage adviser accounts and permissions for participating houses." actions={<button className="btn btn-primary" onClick={() => edit()}><Plus size={17} /> Add adviser</button>} /><Panel title="Adviser directory" description={`${match.length} team advisers`} className="records-panel"><div className="filter-row"><SearchBox value={query} change={setQuery} placeholder="Search advisers or departments…" /></div>{match.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Adviser</th><th>Department</th><th>Assigned houses</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{match.map((a) => <tr key={a.id}><td><span className="person-cell"><Avatar name={a.name} /><span><strong>{a.name}</strong><small>{a.username}</small></span></span></td><td>{a.department}</td><td><div className="chip-row">{a.houseIds.length ? a.houseIds.map((id) => <HouseName key={id} house={data.houses.find((h) => h.id === id)} />) : <span className="muted">Unassigned</span>}</div></td><td><Badge tone={a.active ? "green" : "gray"} dot>{a.active ? "Active" : "Disabled"}</Badge></td><td><button className="icon-button" aria-label={`Edit ${a.name}`} onClick={() => edit(a)}><Pencil size={16} /></button></td></tr>)}</tbody></table></div> : <Empty title="No advisers found" hint="Add an adviser or try a different search." />}</Panel></>;
}

export function EventsPage() {
  const { data, open, href } = useWorkspace();
  const router = useRouter();
  function edit(e?: Season) {
    open({ title: e ? "Edit intramurals event" : "Create intramurals event", description: "Select the event dates and configure the attendance cut-off before opening QR sessions.", action: "season.save", payload: { id: e?.id }, defaults: e ? { ...e, cutoff: e.cutoff.slice(0, 5) } : { state: "draft", startDate: data.today, endDate: data.today, cutoff: "08:00" }, fields: [
      { name: "title", label: "Event title", required: true, maxLength: 150 }, { name: "slug", label: "URL key", required: true, maxLength: 80, placeholder: "intramurals-2026" }, { name: "schoolYear", label: "School year", required: true, maxLength: 24 }, { name: "location", label: "Location", required: true },
      { name: "startDate", label: "Start date", type: "date", required: true }, { name: "endDate", label: "End date", type: "date", required: true }, { name: "cutoff", label: "Late arrival cut-off", type: "time", required: true }, { name: "state", label: "Event status", type: "select", required: true, options: [{ value: "draft", label: "Draft" }, { value: "active", label: "Active" }, { value: "completed", label: "Completed (archived)" }].filter((o) => e?.state !== "completed" || o.value === "completed") },
      { name: "description", label: "Event description", type: "textarea", maxLength: 1500 }, { name: "published", label: "Show on the public website", type: "checkbox", full: true },
    ], onSuccess: (result) => { if (result.slug) router.push(href("events", { event: result.slug })); } });
  }
  return <><SectionHeading title="Intramurals Events" description="Organize active and historical seasons without overwriting their records." actions={<button className="btn btn-primary" onClick={() => edit()}><Plus size={17} /> Create event</button>} />
    {data.seasons.length ? <div className="tile-grid">{data.seasons.map((e) => <article className="panel directory-card" key={e.id}><div className="card-heading"><span className="icon-tile tile-gold"><CalendarDays size={21} /></span><Badge tone={e.state === "active" ? "green" : e.state === "completed" ? "blue" : "gray"} dot>{e.state[0].toUpperCase() + e.state.slice(1)}</Badge></div><h2>{e.title}</h2><p>{e.description || `School year ${e.schoolYear}`}</p><div className="card-facts"><span><CalendarDays size={16} /> {dateRange(e.startDate, e.endDate)}</span><span><MapPin size={16} /> {e.location}</span></div><div className="card-actions"><Link className="btn btn-sm" href={href("overview", { event: e.slug })}>Open dashboard <ArrowRight size={14} /></Link><button className="icon-button" aria-label={`Edit ${e.title}`} onClick={() => edit(e)}><Pencil size={16} /></button></div></article>)}</div> : <div className="panel"><Empty title="No intramurals events yet" hint="Create the first event to enroll houses and schedule games." /></div>}
  </>;
}

export function ProfilePage() {
  const { data, href } = useWorkspace();
  const person = data.students.find((s) => s.id === data.profileId);
  const house = data.houses.find((h) => h.id === person?.houseId);
  return <><SectionHeading title="My Profile" description="Your student account and intramurals information." />{person ? <Panel title="Student information" description="Your school administrator manages official profile details."><div className="page-profile"><div className="modal-profile"><Avatar name={person.name} tone="navy" photo={person.photoUrl} /><div><h3>{person.name}</h3><p>{person.number}</p></div><Badge tone="green" dot>Active</Badge></div><DetailGrid fields={[{ label: "Course or department", value: person.course }, { label: "Year level", value: `Year ${person.year}` }, { label: "Gender", value: person.gender }, { label: "Email address", value: person.email }, { label: "Contact number", value: person.phone }, { label: "House", value: <HouseName house={house} /> }, { label: "Adviser", value: house?.advisers.join(", ") }]} /><Link href={href("houses")} className="text-link">See my house <ArrowRight size={15} /></Link></div></Panel> : <div className="panel"><Empty title="No student profile" hint="Ask the administrator to link your account to a student record." /></div>}</>;
}

export function SettingsPage() {
  const { data, href, open } = useWorkspace();
  const uploadImage = useUploadImage();
  const [tab, setTab] = useState("general"), [query, setQuery] = useState("");
  const accounts = data.accounts.filter((a) => `${a.name} ${a.username} ${roleName[a.role]}`.toLowerCase().includes(query.toLowerCase()));
  function edit(a?: Account) {
    open({ title: a ? "Edit administrator" : "Create administrator", description: "Administrators can access and manage all official records.", action: "account.save", payload: { id: a?.id }, defaults: a || { active: true }, fields: [{ name: "name", label: "Full name", required: true }, { name: "username", label: "Username", required: true }, passwordField(!a), activeField] });
  }
  return <><SectionHeading title="Settings" description="Manage the intramurals workspace, accounts, and sensitive changes." /><Tabs active={tab} change={setTab} tabs={[{ value: "general", label: "General" }, { value: "accounts", label: "User accounts" }, { value: "audit", label: "Audit log" }]} />
    {tab === "general" ? <div className="settings-grid"><Panel title="School settings" description="Used in exports and for official attendance timestamps." action={<button className="btn btn-sm" onClick={() => open({ title: "Edit school settings", action: "school.save", description: "The time zone cannot change while an event is active.", defaults: { schoolName: data.schoolName, timezone: data.timezone }, fields: [{ name: "schoolName", label: "School name", required: true }, { name: "timezone", label: "IANA time zone", required: true, placeholder: "Asia/Manila" }] })}><Pencil size={15} /> Edit</button>}><div className="padded"><DetailGrid fields={[{ label: "School name", value: data.schoolName }, { label: "Official time zone", value: data.timezone }]} /><div className="school-logo-row">{data.schoolLogoUrl ? <Avatar name={data.schoolName} photo={data.schoolLogoUrl} /> : <span className="icon-tile tile-gold"><ImagePlus size={17} /></span>}<div><strong>School report logo</strong><small>Shown on PDF exports</small></div><button className="btn btn-sm" onClick={() => uploadImage("school")}>{data.schoolLogoUrl ? "Replace logo" : "Upload logo"}</button></div></div></Panel><Panel title="Event settings" description="Attendance cut-off and public visibility are configured per event."><div className="padded"><Link className="text-link" href={href("events")}>Manage events <ArrowRight size={15} /></Link></div></Panel></div> : tab === "accounts" ? <Panel title="User accounts" description="Edit student and adviser accounts from their directories." action={<button className="btn btn-primary btn-sm" onClick={() => edit()}><Plus size={15} /> Add administrator</button>} className="records-panel"><div className="filter-row"><SearchBox value={query} change={setQuery} placeholder="Search user accounts…" /></div>{accounts.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Management</th></tr></thead><tbody>{accounts.map((a) => <tr key={a.id}><td><span className="person-cell"><Avatar name={a.name} /><span><strong>{a.name}</strong><small>{a.username}</small></span></span></td><td>{roleName[a.role]}</td><td><Badge tone={a.active ? "green" : "gray"} dot>{a.active ? "Active" : "Disabled"}</Badge></td><td><div className="row-actions">{a.role === "admin" ? <button className="btn btn-sm" onClick={() => edit(a)}>Edit</button> : <Link className="btn btn-sm" href={href(a.role === "student" ? "students" : "advisers")}>Manage</Link>}{a.active && a.id !== data.viewer.id && <button className="btn btn-sm btn-quiet-danger" onClick={() => open({ title: "Deactivate account?", description: `${a.name} will be signed out and will not be able to log in until re-enabled. History will remain intact.`, action: "account.deactivate", danger: true, payload: { id: a.id }, fields: [{ name: "reason", label: "Reason", type: "textarea", required: true, maxLength: 400 }], submit: "Deactivate account" })}>Deactivate</button>}</div></td></tr>)}</tbody></table></div> : <Empty title="No matching accounts" />}</Panel> : <Panel title="Audit log" description="The 80 most recent sensitive administrative actions." className="records-panel">{data.audit.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Action</th><th>Entity</th><th>Administrator</th><th>Reason</th><th>When</th></tr></thead><tbody>{data.audit.map((a) => <tr key={a.id}><td><strong>{a.action}</strong></td><td>{a.entity}</td><td>{a.actor}</td><td>{a.reason || "—"}</td><td>{new Intl.DateTimeFormat("en-US", { timeZone: data.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(a.date))}</td></tr>)}</tbody></table></div> : <Empty title="No audit entries in this view" hint="Attendance corrections, account changes, and other sensitive actions are logged here." />}</Panel>}
    <p className="page-tip"><CalendarDays size={15} /> Workspace date: {dateLabel(data.today)}</p>
  </>;
}

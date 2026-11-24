export const rolesList = ["admin", "student", "adviser"] as const;
export type Role = typeof rolesList[number];
export const roleName: Record<Role, string> = { admin: "Administrator", student: "Student", adviser: "Team Adviser" };

export type Season = {
  id: number; title: string; slug: string; schoolYear: string; startDate: string; endDate: string;
  location: string; description: string; state: "draft" | "active" | "completed"; published: boolean; cutoff: string;
};
export type House = { id: number; name: string; color: string; emblem: string; description: string; active: boolean; inSeason: boolean; members: number; advisers: string[]; logoUrl?: string | null };
export type Student = {
  id: number; userId: number; number: string; name: string; firstName: string; middleName: string; lastName: string;
  course: string; year: number; gender: string; email: string; phone: string; active: boolean; houseId: number | null; photoUrl?: string | null;
};
export type Adviser = { id: number; userId: number; username: string; name: string; department: string; email: string; active: boolean; houseIds: number[] };
export type Account = { id: number; name: string; role: Role; username: string; active: boolean };
export type Sport = {
  id: number; name: string; category: string; division: "male" | "female" | "mixed"; kind: "individual" | "team";
  description: string; rules: string; active: boolean; inSeason: boolean; houseIds: number[];
};
export type Venue = { id: number; name: string; location: string; active: boolean };
export type Official = { id: number; name: string; active: boolean };
export type Match = {
  id: number; sportId: number; sport: string; division: string; stage: string; homeId: number; awayId: number;
  date: string; startTime: string; endTime: string; venueId: number; venue: string; status: "scheduled" | "live" | "completed" | "cancelled";
  officialId: number | null; official: string; format: "single" | "double" | "round_robin"; homeScore: number | null; awayScore: number | null;
};
export type Announcement = { id: number; title: string; body: string; publishedAt: string | null; audience: "public" | "workspace"; pinned: boolean };
export type Standing = { houseId: number; gold: number; silver: number; bronze: number; points: number; wins: number; rank: number };
export type Award = { id: number; sportId: number; houseId: number; label: string; placement: number };
export type AttendanceKind = "present" | "late" | "absent" | "excused" | "unrecorded";
export type AttendanceMethod = "qr" | "rfid" | "face" | "manual";
export const methodLabel: Record<AttendanceMethod, string> = { qr: "QR code", rfid: "RFID", face: "Face check", manual: "Manual" };
export const ABSENCE_CENTAVOS = 5000;
export type SanctionStatus = "outstanding" | "settled" | "waived" | "voided" | "refund_due";
export const sanctionLabel: Record<SanctionStatus, string> = { outstanding: "Outstanding", settled: "Settled", waived: "Waived", voided: "Voided", refund_due: "Refund review" };
export type Sanction = { id: number; studentId: number; number: string; name: string; houseId: number; date: string; amountCentavos: number; status: SanctionStatus; reason: string | null };
export type FaceEnrollment = { studentId: number; state: "pending" | "approved" | "expired"; expiresAt: string; consentedAt: string; reviewCode?: string };
export type AttendanceAccess = {
  rfidReady: boolean; faceReady: boolean; rfidStudentIds: number[]; profiles: FaceEnrollment[]; myFace: FaceEnrollment | null;
  finalizedAt: string | null; sanctions: Sanction[];
};
export function pesos(centavos: number) { return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(centavos / 100); }
export type AttendanceRow = { studentId: number; number: string; name: string; houseId: number | null; date: string; status: AttendanceKind; timeIn: string | null; timeOut: string | null; inMethod?: AttendanceMethod | null; outMethod?: AttendanceMethod | null };
export type QRSession = { id: number; type: "in" | "out"; date: string; expiresAt: string; active: boolean };
export type AttendanceGroup = { houseId: number; name: string; present: number; late: number; absent: number; pending: number; excused: number };
export type Audit = { id: number; action: string; entity: string; reason: string | null; actor: string; date: string };
export type GalleryPhoto = { id: number; url: string; caption: string; published?: boolean };
export type Competition = {
  houses: House[]; sports: Sport[]; matches: Match[]; standings: Standing[]; awards: Award[];
  announcements: Announcement[]; gallery: GalleryPhoto[];
};
export type WorkspaceData = Competition & {
  role: Role; viewer: { id: number; name: string; username: string }; preview: boolean; csrf: string;
  seasons: Season[]; season: Season | null; schoolName: string; schoolLogoUrl?: string | null; timezone: string; today: string; day: string;
  students: Student[]; advisers: Adviser[]; accounts: Account[]; scopedHouseIds: number[]; profileId: number | null;
  venues: Venue[]; officials: Official[]; athletes: { studentId: number; sportId: number }[];
  attendance: AttendanceRow[]; history: AttendanceRow[]; groups: AttendanceGroup[]; qrSessions: QRSession[]; attendanceAccess: AttendanceAccess;
  points: { placement: number; points: number }[]; audit: Audit[];
  stats: { students: number; houses: number; advisers: number; sports: number; present: number; absent: number; late: number; excused: number; pending: number };
};

export function safePhotoUrl(value: string | null | undefined) {
  return value && (/^\/api\/media\/[a-f0-9]{32}$/.test(value) || /^\/images\/[a-z0-9/_-]+\.(jpg|jpeg|png|webp)$/i.test(value)) ? value : null;
}
export function scopedPath(role: Role, preview: boolean, section = "overview") {
  if (preview && role === "admin" && section === "overview") return "/";
  const base = preview ? `/preview/${role}` : `/${role}`;
  return section === "overview" ? base : `${base}/${section}`;
}
export function localDate(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const pick = (part: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === part)?.value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}
export function localTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
}
export function dateLabel(day: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}
export function dateRange(start: string, end: string) {
  if (start === end) return dateLabel(start);
  const shortDay = (value: string) => dateLabel(value, { month: "short", day: "numeric" });
  if (start.slice(0, 7) === end.slice(0, 7)) return `${shortDay(start)}–${Number(end.slice(-2))}, ${end.slice(0, 4)}`;
  return `${start.slice(0, 4) === end.slice(0, 4) ? shortDay(start) : dateLabel(start)} – ${dateLabel(end)}`;
}
export function timeLabel(time: string | null, zone?: string) {
  if (!time) return "—";
  const d = new Date(time.includes("T") ? time : `2000-01-01T${time.slice(0, 5)}:00Z`);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone || "UTC" }).format(d);
}
export function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase()).join(""); }
export function durationLabel(start: string | null, end: string | null) {
  if (!start || !end) return "—";
  const minutes = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export const attendanceLabel: Record<AttendanceKind, string> = { present: "Present", late: "Late", absent: "Absent", excused: "Excused", unrecorded: "Not recorded" };
export const matchLabel: Record<Match["status"], string> = { scheduled: "Upcoming", live: "Live now", completed: "Completed", cancelled: "Cancelled" };
export const formatLabel: Record<Match["format"], string> = { single: "Single elimination", double: "Double elimination", round_robin: "Round robin" };

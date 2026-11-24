import type { Role } from "./model";

export const names: Record<string, string> = {
  overview: "Overview", profile: "My Profile", students: "Students", houses: "Houses", advisers: "Advisers",
  events: "Intramurals Events", sports: "Sports", schedule: "Game Schedule", scores: "Scores & Rankings",
  attendance: "Attendance", scan: "Scan QR Code", face: "Face Verification", sanctions: "Sanctions", reports: "Reports", announcements: "Announcements", settings: "Settings",
};
export const nav: Record<Role, { label: string; items: string[] }[]> = {
  admin: [{ label: "Workspace", items: ["overview", "students", "houses", "advisers"] }, { label: "Competition", items: ["events", "sports", "schedule", "scores"] }, { label: "Operations", items: ["attendance", "sanctions", "announcements", "reports", "settings"] }],
  student: [{ label: "Workspace", items: ["overview", "profile", "houses"] }, { label: "Competition", items: ["sports", "schedule", "scores"] }, { label: "Campus", items: ["scan", "face", "attendance", "sanctions", "announcements"] }],
  adviser: [{ label: "Workspace", items: ["overview", "houses", "students"] }, { label: "Competition", items: ["sports", "schedule", "scores"] }, { label: "Operations", items: ["attendance", "sanctions", "reports", "announcements"] }],
};
export function sectionName(section: string, role: Role) {
  if (section === "houses" && role !== "admin") return role === "student" ? "My House" : "My Houses";
  if (section === "sanctions" && role === "student") return "My Sanctions";
  if (section === "attendance" && role === "student") return "My Attendance";
  if (section === "attendance" && role === "adviser") return "House Attendance";
  if (section === "students" && role === "adviser") return "House Members";
  if (section === "sports" && role === "student") return "My Sports";
  return names[section] || section;
}
export const canView = (role: Role, section: string) => nav[role].some((g) => g.items.includes(section));

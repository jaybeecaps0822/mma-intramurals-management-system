import type { Adviser, Announcement, AttendanceRow, Award, Competition, House, Match, Role, Season, Sport, Standing, Student, WorkspaceData } from "./model";

const timezone = "Asia/Manila";
export const sampleSeasons: Season[] = [
  { id: 1, title: "MMA Intramurals 2026", slug: "2026", schoolYear: "2026–2027", startDate: "2026-09-14", endDate: "2026-09-19", description: "A week of sports, school spirit, and house pride.", location: "MMA Sports Complex", state: "active", published: true, cutoff: "08:00" },
  { id: 2, title: "MMA Intramurals 2025", slug: "2025", schoolYear: "2025–2026", startDate: "2025-09-15", endDate: "2025-09-20", description: "Look back on a season of teamwork and friendly competition.", location: "MMA Sports Complex", state: "completed", published: true, cutoff: "08:00" },
];
export const sampleHouses: House[] = [
  { id: 1, name: "Red House", color: "#e64f5e", emblem: "flame", description: "Courage in competition, determination in every game.", active: true, inSeason: true, members: 322, advisers: ["Mariana Santos"] },
  { id: 2, name: "Blue House", color: "#4279e1", emblem: "waves", description: "Stronger together, focused from the first whistle.", active: true, inSeason: true, members: 324, advisers: ["Daniel Navarro"] },
  { id: 3, name: "Green House", color: "#24a477", emblem: "leaf", description: "Resilience, fair play, and a drive to keep growing.", active: true, inSeason: true, members: 292, advisers: ["Camille Flores"] },
  { id: 4, name: "Yellow House", color: "#e6a21e", emblem: "zap", description: "Energy, optimism, and a bright school spirit.", active: true, inSeason: true, members: 310, advisers: ["Gabriel Cruz"] },
];
export const sampleAdvisers: Adviser[] = sampleHouses.map((h, i) => ({ id: 200 + i, userId: 200 + i, username: ["msantos", "dnavarro", "cflores", "gcruz"][i], name: h.advisers[0], department: ["Student Affairs", "Physical Education", "Humanities", "Mathematics"][i], email: `${["msantos", "dnavarro", "cflores", "gcruz"][i]}@example.test`, active: true, houseIds: [h.id] }));
const studentNames = ["Sofia Mendoza", "Liam Villanueva", "Isabel Reyes", "Noah Santos", "Alyssa Rivera", "Ethan Garcia", "Mia Dela Cruz", "Lucas Torres", "Zoe Aquino", "Elijah Ramos", "Amara Bautista", "Miguel Flores", "Jasmine Lim", "Rafael Reyes", "Ella Castillo", "Joshua Diaz", "Bianca Cruz", "Caleb Tan", "Kiara De Leon", "Mateo Ramos", "Jana Garcia", "Levi Flores", "Hannah Torres", "Leo Navarro"];
export const sampleStudents: Student[] = studentNames.map((name, i) => {
  const [firstName, ...last] = name.split(" ");
  const number = `2026-${String(1001 + i).padStart(4, "0")}`;
  const course = ["Information Technology", "Business Administration", "Education", "Hospitality Management"][(i + Math.floor(i / 4)) % 4];
  return { id: i + 1, userId: i + 100, name, number, firstName, lastName: last.join(" "), middleName: "", course, year: 1 + ((i + Math.floor(i / 4)) % 4), gender: "", email: `${firstName.toLowerCase()}.${last.join("").toLowerCase()}@example.test`, phone: "", houseId: [2, 1, 3, 4][i % 4], active: true };
});
export const sampleSports: Sport[] = [
  ["Basketball", "Court sports", "male", "team"], ["Volleyball", "Court sports", "female", "team"],
  ["Badminton", "Racket sports", "mixed", "individual"], ["Table Tennis", "Racket sports", "mixed", "individual"],
  ["Chess", "Mind sports", "mixed", "individual"], ["Athletics", "Track & field", "mixed", "individual"],
  ["Futsal", "Court sports", "male", "team"], ["Sepak Takraw", "Court sports", "mixed", "team"],
  ["Dance Competition", "Performance", "mixed", "team"], ["Cheerdance", "Performance", "mixed", "team"],
  ["Mobile Legends", "Esports", "mixed", "team"], ["Mr. & Ms. Intramurals", "School spirit", "mixed", "individual"],
].map(([name, category, division, kind], i) => ({ id: i + 1, name, category, division: division as Sport["division"], kind: kind as Sport["kind"], description: `${name} brings our houses together in a spirit of fair competition.`, rules: "Check in with the game official before the scheduled start. House colors and good sportsmanship are required.", active: true, inSeason: true, houseIds: [1, 2, 3, 4] }));
export const sampleVenues = [{ id: 1, name: "Main Gymnasium", location: "MMA Sports Complex", active: true }, { id: 2, name: "Covered Court", location: "East Campus", active: true }, { id: 3, name: "Activity Hall", location: "Student Center", active: true }, { id: 4, name: "Track Oval", location: "MMA Sports Complex", active: true }];
export const sampleOfficials = [{ id: 1, name: "Coach Rivera", active: true }, { id: 2, name: "Coach Tan", active: true }];
export const sampleAthletes = sampleStudents.flatMap((s, i) => [{ studentId: s.id, sportId: (i % 8) + 1 }, ...(i % 3 === 0 ? [{ studentId: s.id, sportId: 11 }] : [])]);

const matchRows: [number, number, number, string, string, number, Match["status"], number | null, number | null, string][] = [
  [1, 1, 2, "16", "10:00", 1, "scheduled", null, null, "Semifinal"],
  [2, 3, 4, "16", "11:30", 2, "scheduled", null, null, "Group stage"],
  [3, 2, 3, "16", "13:00", 3, "scheduled", null, null, "Quarterfinal"],
  [7, 4, 1, "16", "09:00", 2, "live", 2, 1, "Group stage"],
  [1, 2, 4, "15", "14:00", 1, "completed", 68, 54, "Group stage"],
  [2, 1, 3, "15", "10:30", 2, "completed", 25, 19, "Group stage"],
  [5, 2, 1, "14", "11:00", 3, "completed", 3, 1, "Final"],
  [4, 3, 4, "17", "14:30", 3, "scheduled", null, null, "Quarterfinal"],
  [8, 2, 1, "18", "11:30", 2, "scheduled", null, null, "Group stage"],
  [9, 1, 3, "19", "15:00", 1, "scheduled", null, null, "Final"],
];
export const sampleMatches: Match[] = matchRows.map(([sportId, homeId, awayId, day, startTime, venueId, status, homeScore, awayScore, stage], i) => ({
  id: i + 1, sportId, sport: sampleSports[sportId - 1].name, division: sampleSports[sportId - 1].division,
  date: `2026-09-${day}`, startTime, endTime: `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, "0")}:${startTime.slice(3)}`, venueId, venue: sampleVenues[venueId - 1].name,
  status, stage, format: stage === "Group stage" ? "round_robin" : "single", homeId, awayId, homeScore, awayScore, officialId: (i % 2) + 1, official: sampleOfficials[i % 2].name,
}));
const pub = (day: number, hour = "08:00") => `2026-09-${String(day).padStart(2, "0")}T${hour}:00+08:00`;
export const sampleNotices: Announcement[] = [
  { id: 1, title: "Day 3 schedule is now available", body: "Check the updated game schedule for court assignments and start times. Athletes should arrive 20 minutes before their match.", publishedAt: pub(16, "07:30"), audience: "public", pinned: true },
  { id: 2, title: "A reminder to log your TIME OUT", body: "Use the attendance QR at the registration desk before leaving the sports complex. Contact your house adviser if you need help.", publishedAt: pub(15, "15:00"), audience: "workspace", pinned: false },
  { id: 3, title: "Closing ceremony on Saturday", body: "Join all four houses at the Main Gymnasium at 4:00 PM for the awarding ceremony and a celebration of this year’s athletes.", publishedAt: pub(14, "09:00"), audience: "public", pinned: false },
];
const currentStandings: Standing[] = [
  { houseId: 2, gold: 8, silver: 5, bronze: 4, points: 146, wins: 6, rank: 1 },
  { houseId: 1, gold: 6, silver: 7, bronze: 3, points: 129, wins: 5, rank: 2 },
  { houseId: 3, gold: 5, silver: 4, bronze: 6, points: 108, wins: 4, rank: 3 },
  { houseId: 4, gold: 3, silver: 5, bronze: 7, points: 86, wins: 3, rank: 4 },
];
const sampleAwards: Award[] = [{ id: 1, sportId: 5, houseId: 2, label: "Open division", placement: 1 }, { id: 2, sportId: 5, houseId: 1, label: "Open division", placement: 2 }, { id: 3, sportId: 5, houseId: 3, label: "Open division", placement: 3 }];
function sampleRows(students: Student[], day: string, historical = false): AttendanceRow[] {
  return students.map((s) => {
    const i = s.id - 1;
    const status = (i === 0 && sampleSeasons.some((event) => event.startDate === day)) || i % 7 === 5 ? "absent" : i % 9 === 7 ? "excused" : i % 6 === 3 ? "late" : "present";
    const timeIn = status === "absent" || status === "excused" ? null : `${day}T${status === "late" ? "08:17" : `07:${String(24 + i).padStart(2, "0")}`}:00+08:00`;
    return { studentId: s.id, number: s.number, name: s.name, houseId: s.houseId, date: day, status, timeIn, inMethod: timeIn ? (["qr", "rfid", "face"] as const)[i % 3] : null, outMethod: timeIn && (i % 4 === 2 || historical) ? (["qr", "rfid", "face"] as const)[i % 3] : null, timeOut: timeIn && (i % 4 === 2 || historical) ? `${day}T15:42:00+08:00` : null };
  });
}
export function demoWorkspace(role: Role = "admin", seasonSlug?: string, selectedDay?: string, fromDay?: string): WorkspaceData {
  const season = sampleSeasons.find((s) => s.slug === seasonSlug) || sampleSeasons[0];
  const previous = season.id === 2;
  const today = previous ? season.endDate : "2026-09-16";
  const validDay = (value?: string): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
  const day = validDay(selectedDay) && selectedDay >= season.startDate && selectedDay <= today ? selectedDay : today;
  const scope = role === "adviser" ? [1] : role === "student" ? [2] : [1, 2, 3, 4];
  const viewer = role === "admin" ? { id: 1, name: "Alex Reyes", username: "admin.preview" } : role === "student" ? { id: 100, name: sampleStudents[0].name, username: sampleStudents[0].number } : { id: 200, name: sampleAdvisers[0].name, username: sampleAdvisers[0].username };
  const houses = sampleHouses.map((h) => ({ ...h, members: scope.includes(h.id) ? (previous ? h.members - 34 : h.members) : 0 }));
  const members = sampleStudents.filter((s) => scope.includes(s.houseId!)).map((s) => role !== "student" || s.id === 1 ? s : { ...s, number: "", email: "", phone: "", userId: 0 });
  const attendanceStudents = role === "student" ? members.filter((s) => s.id === 1) : members;
  const attendance = sampleRows(attendanceStudents, day, day !== today || previous);
  const dayIndex = Number(day.slice(8));
  const change = (Number(today.slice(8)) - dayIndex) * 11 + (previous ? 24 : 0);
  const groups = houses.filter((h) => scope.includes(h.id)).map((h) => {
    const present = [256, 272, 238, 220][h.id - 1] - change;
    const late = [23, 31, 19, 34][h.id - 1];
    const excused = [4, 3, 6, 5][h.id - 1];
    return { houseId: h.id, name: h.name, present, late, absent: h.members - present - late - excused, excused, pending: day === today && !previous ? [85, 76, 63, 71][h.id - 1] : 0 };
  });
  const dateWindow: string[] = [];
  for (let cursor = new Date(`${validDay(fromDay) && fromDay >= season.startDate && fromDay < day ? fromDay : season.startDate}T12:00Z`); cursor.toISOString().slice(0, 10) <= day; cursor.setUTCDate(cursor.getUTCDate() + 1)) dateWindow.push(cursor.toISOString().slice(0, 10));
  return {
    role, viewer, preview: true, csrf: "", seasons: sampleSeasons, season, today, day, schoolName: "MMA", timezone,
    students: members, advisers: sampleAdvisers.filter((a) => a.houseIds.some((h) => scope.includes(h))), accounts: role === "admin" ? [{ ...viewer, role, active: true }, ...sampleStudents.map((s) => ({ id: s.userId, name: s.name, username: s.number, role: "student" as const, active: true })), ...sampleAdvisers.map((a) => ({ id: a.userId, name: a.name, username: a.username, role: "adviser" as const, active: true }))] : [],
    houses, scopedHouseIds: scope, profileId: role === "student" ? 1 : null, sports: sampleSports,
    venues: sampleVenues, officials: sampleOfficials, athletes: sampleAthletes.filter((a) => role === "student" ? a.studentId === 1 : members.some((s) => s.id === a.studentId)),
    matches: sampleMatches.filter((m) => role !== "adviser" || scope.includes(m.homeId) || scope.includes(m.awayId)).map((m) => previous ? { ...m, date: m.date.replace("2026", "2025"), status: "completed", homeScore: m.homeScore ?? 2, awayScore: m.awayScore ?? 0 } : m),
    standings: previous ? [currentStandings[1], currentStandings[0], ...currentStandings.slice(2)].map((s, i) => ({ ...s, rank: i + 1, points: [153, 138, 101, 93][i] })) : currentStandings,
    awards: sampleAwards, gallery: [{ id: 1, url: "/images/arena-hero.jpg", caption: "Opening day at the Main Gymnasium" }, { id: 2, url: "/images/track-day.jpg", caption: "Track and field at the MMA Sports Complex" }, { id: 3, url: "/images/volleyball-day.jpg", caption: "Volleyball action on the covered court" }],
    announcements: sampleNotices.map((n) => previous ? { ...n, publishedAt: n.publishedAt?.replace("2026", "2025") || null } : n),
    attendance, history: dateWindow.flatMap((date) => sampleRows(attendanceStudents, date, date !== today || previous)).reverse(), groups,
    qrSessions: [], attendanceAccess: {
      rfidReady: true, faceReady: true, rfidStudentIds: role === "admin" ? [1, 2, 6, 9, 10] : [], profiles: [],
      myFace: role === "student" ? { studentId: 1, state: "approved", consentedAt: `${season.startDate}T00:30:00Z`, expiresAt: `${season.endDate}T16:00:00Z` } : null,
      finalizedAt: day < today || previous ? `${today}T01:30:00Z` : null,
      sanctions: (role === "student" ? [{ id: 50, studentId: 1, number: sampleStudents[0].number, name: sampleStudents[0].name, houseId: 2, date: season.startDate, amountCentavos: 5000, status: "outstanding" as const, reason: null }] : [1, 2].flatMap((back) => {
        const date = `${today.slice(0, 8)}${String(Number(today.slice(8)) - back).padStart(2, "0")}`;
        return sampleRows(attendanceStudents, date, true).filter((row) => row.status === "absent").map((row, i) => ({ id: back * 100 + i, studentId: row.studentId, number: row.number, name: row.name, houseId: row.houseId!, date, amountCentavos: 5000, status: i % 3 === 2 ? "waived" as const : i % 3 === 1 ? "settled" as const : "outstanding" as const, reason: i % 3 === 2 ? "Approved after staff review" : null }));
      })),
    }, points: [{ placement: 1, points: 10 }, { placement: 2, points: 6 }, { placement: 3, points: 4 }], audit: [],
    stats: { students: houses.reduce((sum, h) => sum + h.members, 0), houses: scope.length, advisers: scope.length, sports: sampleSports.length,
      present: groups.reduce((sum, g) => sum + g.present, 0), late: groups.reduce((sum, g) => sum + g.late, 0), absent: groups.reduce((sum, g) => sum + g.absent, 0),
      excused: groups.reduce((sum, g) => sum + g.excused, 0), pending: groups.reduce((sum, g) => sum + g.pending, 0) },
  };
}
export function demoPublic(seasonSlug?: string): { season: Season; seasons: Season[]; competition: Competition; example: true } {
  const ws = demoWorkspace("admin", seasonSlug);
  return { season: ws.season!, seasons: ws.seasons, example: true, competition: { houses: ws.houses, sports: ws.sports, matches: ws.matches, standings: ws.standings, awards: ws.awards, gallery: ws.gallery, announcements: ws.announcements.filter((a) => a.audience === "public") } };
}

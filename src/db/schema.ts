import { sql } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, smallint, text, time, timestamp, unique, uniqueIndex, varchar } from "drizzle-orm/pg-core";

const stamp = (name: string) => timestamp(name, { withTimezone: true });
const created = () => stamp("created_at").defaultNow().notNull();
const updated = () => stamp("updated_at").defaultNow().notNull();

export const roleKey = pgEnum("role_key", ["admin", "student", "adviser"]);
export const eventState = pgEnum("event_state", ["draft", "active", "completed"]);
export const attendanceType = pgEnum("attendance_type", ["in", "out"]);
export const attendanceMethod = pgEnum("attendance_method", ["qr", "rfid", "face", "manual"]);
export const sanctionStatus = pgEnum("sanction_status", ["outstanding", "settled", "waived", "voided", "refund_due"]);
export const attendanceStatus = pgEnum("attendance_status", ["present", "late", "absent", "excused"]);
export const sportDivision = pgEnum("sport_division", ["male", "female", "mixed"]);
export const sportKind = pgEnum("sport_kind", ["individual", "team"]);
export const tournamentFormat = pgEnum("tournament_format", ["single", "double", "round_robin"]);
export const matchStatus = pgEnum("match_status", ["scheduled", "live", "completed", "cancelled"]);
export const audience = pgEnum("announcement_audience", ["public", "workspace"]);

export const roles = pgTable("roles", {
  key: roleKey("role_key").primaryKey(), label: varchar("label", { length: 40 }).notNull(),
});
export const users = pgTable("users", {
  id: serial("id").primaryKey(), role: roleKey("role_key").notNull().references(() => roles.key),
  username: varchar("username", { length: 80 }).notNull().unique(),
  name: varchar("display_name", { length: 150 }).notNull(), email: varchar("email", { length: 254 }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(), active: boolean("active").default(true).notNull(),
  createdAt: created(), updatedAt: updated(),
}, (t) => [index("users_role_active").on(t.role, t.active), check("users_normal_username", sql`${t.username} = lower(${t.username})`)]);
export const mediaScope = pgEnum("media_scope", ["student", "house", "school", "gallery"]);
export const mediaAssets = pgTable("media_assets", {
  key: varchar("media_key", { length: 32 }).primaryKey(), scope: mediaScope("scope").notNull(), data: text("image_base64").notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id), createdAt: created(),
}, (t) => [check("media_data_size", sql`length(${t.data}) between 1 and 2796204`)]);
export const authSessions = pgTable("auth_sessions", {
  hash: varchar("token_hash", { length: 64 }).primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: stamp("expires_at").notNull(), createdAt: created(),
}, (t) => [index("auth_sessions_user").on(t.userId), index("auth_sessions_expiry").on(t.expiresAt)]);
export const loginLimits = pgTable("login_limits", {
  key: varchar("limit_key", { length: 64 }).primaryKey(), attempts: integer("attempts").default(1).notNull(), expiresAt: stamp("expires_at").notNull(),
}, (t) => [index("login_limits_expiry").on(t.expiresAt)]);

export const students = pgTable("students", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().unique().references(() => users.id),
  studentNumber: varchar("student_number", { length: 80 }).notNull().unique(),
  firstName: varchar("first_name", { length: 75 }).notNull(), middleName: varchar("middle_name", { length: 75 }),
  lastName: varchar("last_name", { length: 75 }).notNull(), gender: varchar("gender", { length: 24 }),
  course: varchar("course", { length: 100 }).notNull(), yearLevel: smallint("year_level").notNull(), phone: varchar("phone", { length: 32 }),
  photoUrl: varchar("photo_url", { length: 255 }), createdAt: created(), updatedAt: updated(),
}, (t) => [index("student_course_year").on(t.course, t.yearLevel), index("student_name").on(t.lastName, t.firstName), check("student_year_range", sql`${t.yearLevel} between 1 and 12`)]);
export const advisers = pgTable("advisers", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().unique().references(() => users.id),
  department: varchar("department", { length: 100 }).notNull(), createdAt: created(), updatedAt: updated(),
});
export const settings = pgTable("system_settings", {
  key: varchar("settings_key", { length: 24 }).primaryKey(), schoolName: varchar("school_name", { length: 150 }).notNull(),
  timezone: varchar("timezone", { length: 80 }).notNull(), logoUrl: varchar("school_logo_url", { length: 255 }), updatedAt: updated(),
});
export const intramurals = pgTable("intramurals", {
  id: serial("id").primaryKey(), slug: varchar("slug", { length: 80 }).notNull().unique(), title: varchar("title", { length: 150 }).notNull(),
  schoolYear: varchar("school_year", { length: 24 }).notNull(), description: text("description").default("").notNull(),
  location: varchar("location", { length: 125 }).notNull(), startDate: date("start_date").notNull(), endDate: date("end_date").notNull(),
  cutoff: time("cutoff_time").default("08:00").notNull(), state: eventState("state").default("draft").notNull(),
  published: boolean("published").default(false).notNull(), createdAt: created(), updatedAt: updated(),
}, (t) => [uniqueIndex("event_single_active").on(t.state).where(sql`${t.state} = 'active'`), index("event_public_start").on(t.published, t.startDate), check("event_date_order", sql`${t.endDate} >= ${t.startDate}`)]);
export const houses = pgTable("houses", {
  id: serial("id").primaryKey(), name: varchar("name", { length: 100 }).notNull().unique(), color: varchar("color", { length: 7 }).notNull(),
  emblem: varchar("emblem", { length: 24 }).default("shield").notNull(), description: text("description").default("").notNull(),
  logoUrl: varchar("logo_url", { length: 255 }), active: boolean("active").default(true).notNull(), createdAt: created(), updatedAt: updated(),
}, (t) => [check("house_hex_color", sql`${t.color} ~ '^#[0-9a-fA-F]{6}$'`)]);
export const eventHouses = pgTable("event_houses", {
  eventId: integer("intramurals_id").notNull().references(() => intramurals.id), houseId: integer("house_id").notNull().references(() => houses.id),
}, (t) => [primaryKey({ columns: [t.eventId, t.houseId] })]);
export const teamMembers = pgTable("team_members", {
  eventId: integer("intramurals_id").notNull(), studentId: integer("student_id").notNull().references(() => students.id), houseId: integer("house_id").notNull(),
  assignedAt: stamp("assigned_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.eventId, t.studentId] }), foreignKey({ name: "member_event_house_fk", columns: [t.eventId, t.houseId], foreignColumns: [eventHouses.eventId, eventHouses.houseId] }), index("event_members_house").on(t.eventId, t.houseId)]);
export const houseAdvisers = pgTable("house_advisers", {
  eventId: integer("intramurals_id").notNull(), houseId: integer("house_id").notNull(), adviserId: integer("adviser_id").notNull().references(() => advisers.id),
}, (t) => [primaryKey({ columns: [t.eventId, t.houseId, t.adviserId] }), foreignKey({ name: "adviser_event_house_fk", columns: [t.eventId, t.houseId], foreignColumns: [eventHouses.eventId, eventHouses.houseId] }), index("adviser_event_lookup").on(t.adviserId, t.eventId)]);
export const rfidCards = pgTable("rfid_cards", {
  studentId: integer("student_id").primaryKey().references(() => students.id), digest: varchar("card_digest", { length: 64 }).unique().notNull(),
  issuedBy: integer("issued_by").notNull().references(() => users.id), issuedAt: stamp("issued_at").defaultNow().notNull(),
});
export const faceProfiles = pgTable("face_profiles", {
  studentId: integer("student_id").primaryKey().references(() => students.id), template: varchar("encrypted_template", { length: 850 }).notNull(),
  version: varchar("version", { length: 32 }).notNull(), consentedAt: stamp("consented_at").notNull(), expiresAt: stamp("expires_at").notNull(),
  reviewCode: varchar("review_code", { length: 8 }), approvedAt: stamp("approved_at"), approvedBy: integer("approved_by").references(() => users.id),
}, (t) => [index("face_profiles_expiry").on(t.expiresAt), check("face_profile_approval_state", sql`(${t.reviewCode} is not null and ${t.approvedAt} is null and ${t.approvedBy} is null) or (${t.reviewCode} is null and ${t.approvedAt} is not null and ${t.approvedBy} is not null)`)]);
export const rfidStations = pgTable("rfid_stations", {
  id: serial("id").primaryKey(), eventId: integer("intramurals_id").notNull().references(() => intramurals.id), date: date("attendance_date").notNull(),
  type: attendanceType("session_type").notNull(), operatorId: integer("operator_id").notNull().references(() => users.id),
  operatorSession: varchar("operator_session_hash", { length: 64 }).notNull(), active: boolean("active").notNull().default(true), expiresAt: stamp("expires_at").notNull(), createdAt: created(),
}, (t) => [index("rfid_station_event_active").on(t.eventId, t.active), index("rfid_station_operator_active").on(t.operatorId, t.active)]);
export const finalizedAttendanceDays = pgTable("finalized_attendance_days", {
  eventId: integer("intramurals_id").notNull().references(() => intramurals.id), date: date("attendance_date").notNull(),
  finalizedBy: integer("finalized_by").notNull().references(() => users.id), finalizedAt: stamp("finalized_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.eventId, t.date] })]);
export const attendanceSessions = pgTable("attendance_sessions", {
  id: serial("id").primaryKey(), eventId: integer("intramurals_id").notNull().references(() => intramurals.id), date: date("attendance_date").notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(), facePinHash: varchar("face_pin_hash", { length: 64 }), type: attendanceType("session_type").notNull(), active: boolean("active").default(true).notNull(),
  expiresAt: stamp("expires_at").notNull(), createdBy: integer("created_by").notNull().references(() => users.id), createdAt: created(),
}, (t) => [uniqueIndex("one_active_attendance_direction").on(t.eventId, t.type).where(sql`${t.active}`), index("qr_session_expiry").on(t.expiresAt), index("attendance_face_pin_lookup").on(t.eventId, t.facePinHash)]);
export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(), eventId: integer("intramurals_id").notNull(), studentId: integer("student_id").notNull(), date: date("attendance_date").notNull(),
  timeIn: stamp("time_in"), timeOut: stamp("time_out"), inSessionId: integer("in_session_id").references(() => attendanceSessions.id),
  outSessionId: integer("out_session_id").references(() => attendanceSessions.id),
  inStationId: integer("in_station_id").references(() => rfidStations.id), outStationId: integer("out_station_id").references(() => rfidStations.id),
  inMethod: attendanceMethod("in_method"), outMethod: attendanceMethod("out_method"), sanctionEligible: boolean("sanction_eligible").default(false).notNull(), status: attendanceStatus("status").notNull(), updatedAt: updated(),
}, (t) => [unique("attendance_once_daily").on(t.studentId, t.eventId, t.date), foreignKey({ name: "attendance_member_fk", columns: [t.eventId, t.studentId], foreignColumns: [teamMembers.eventId, teamMembers.studentId] }), check("attendance_time_order", sql`${t.timeOut} is null or (${t.timeIn} is not null and ${t.timeOut} >= ${t.timeIn})`), index("attendance_event_day_status").on(t.eventId, t.date, t.status)]);

export const attendanceSanctions = pgTable("attendance_sanctions", {
  id: serial("id").primaryKey(), eventId: integer("intramurals_id").notNull(), studentId: integer("student_id").notNull(), date: date("attendance_date").notNull(),
  amountCentavos: integer("amount_centavos").notNull(), status: sanctionStatus("status").notNull().default("outstanding"), assessedAt: stamp("assessed_at").notNull().defaultNow(),
  revisedBy: integer("revised_by").references(() => users.id), reason: varchar("review_reason", { length: 400 }), updatedAt: updated(),
}, (t) => [unique("sanction_once_daily").on(t.studentId, t.eventId, t.date),
  foreignKey({ name: "sanction_finalized_day_fk", columns: [t.eventId, t.date], foreignColumns: [finalizedAttendanceDays.eventId, finalizedAttendanceDays.date] }),
  foreignKey({ name: "sanction_attendance_fk", columns: [t.studentId, t.eventId, t.date], foreignColumns: [attendance.studentId, attendance.eventId, attendance.date] }),
  check("sanction_positive_amount", sql`${t.amountCentavos} > 0`), index("sanction_event_date_status").on(t.eventId, t.date, t.status)]);

export const sports = pgTable("sports", {
  id: serial("id").primaryKey(), name: varchar("name", { length: 100 }).notNull().unique(), category: varchar("category", { length: 70 }).notNull(),
  division: sportDivision("division").default("mixed").notNull(), kind: sportKind("kind").default("team").notNull(),
  description: text("description").default("").notNull(), rules: text("rules").default("").notNull(), active: boolean("active").default(true).notNull(), createdAt: created(), updatedAt: updated(),
});
export const eventSports = pgTable("event_sports", {
  eventId: integer("intramurals_id").notNull().references(() => intramurals.id), sportId: integer("sport_id").notNull().references(() => sports.id),
}, (t) => [primaryKey({ columns: [t.eventId, t.sportId] })]);
export const sportHouses = pgTable("sport_houses", {
  eventId: integer("intramurals_id").notNull(), sportId: integer("sport_id").notNull(), houseId: integer("house_id").notNull(),
}, (t) => [primaryKey({ columns: [t.eventId, t.sportId, t.houseId] }), foreignKey({ name: "sport_house_event_fk", columns: [t.eventId, t.houseId], foreignColumns: [eventHouses.eventId, eventHouses.houseId] }), foreignKey({ name: "sport_house_sport_fk", columns: [t.eventId, t.sportId], foreignColumns: [eventSports.eventId, eventSports.sportId] })]);
export const athleteSports = pgTable("athlete_sports", {
  eventId: integer("intramurals_id").notNull(), sportId: integer("sport_id").notNull(), studentId: integer("student_id").notNull(), registeredAt: stamp("registered_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.eventId, t.sportId, t.studentId] }), foreignKey({ name: "athlete_event_sport_fk", columns: [t.eventId, t.sportId], foreignColumns: [eventSports.eventId, eventSports.sportId] }), foreignKey({ name: "athlete_event_member_fk", columns: [t.eventId, t.studentId], foreignColumns: [teamMembers.eventId, teamMembers.studentId] })]);
export const venues = pgTable("venues", {
  id: serial("id").primaryKey(), name: varchar("name", { length: 100 }).notNull().unique(), location: varchar("location", { length: 125 }).notNull(), active: boolean("active").default(true).notNull(),
});
export const officials = pgTable("game_officials", {
  id: serial("id").primaryKey(), name: varchar("name", { length: 125 }).notNull().unique(), active: boolean("active").default(true).notNull(),
});
export const tournaments = pgTable("tournaments", {
  id: serial("id").primaryKey(), eventId: integer("intramurals_id").notNull(), sportId: integer("sport_id").notNull(),
  name: varchar("name", { length: 125 }).notNull(), format: tournamentFormat("format").notNull(),
}, (t) => [foreignKey({ name: "tournament_event_sport_fk", columns: [t.eventId, t.sportId], foreignColumns: [eventSports.eventId, eventSports.sportId] }), unique("tournament_event_name").on(t.eventId, t.sportId, t.name), unique("tournament_context").on(t.id, t.eventId, t.sportId)]);
export const matches = pgTable("matches", {
  id: serial("id").primaryKey(), eventId: integer("intramurals_id").notNull(), sportId: integer("sport_id").notNull(), tournamentId: integer("tournament_id"),
  stage: varchar("round_label", { length: 80 }).notNull(), format: tournamentFormat("format").default("round_robin").notNull(),
  homeId: integer("home_house_id").notNull(), awayId: integer("away_house_id").notNull(),
  venueId: integer("venue_id").notNull().references(() => venues.id), officialId: integer("official_id").references(() => officials.id),
  date: date("match_date").notNull(), startTime: time("start_time").notNull(), endTime: time("end_time").notNull(),
  status: matchStatus("status").default("scheduled").notNull(), createdAt: created(), updatedAt: updated(),
}, (t) => [foreignKey({ name: "match_tournament_fk", columns: [t.tournamentId, t.eventId, t.sportId], foreignColumns: [tournaments.id, tournaments.eventId, tournaments.sportId] }), foreignKey({ name: "match_home_fk", columns: [t.eventId, t.sportId, t.homeId], foreignColumns: [sportHouses.eventId, sportHouses.sportId, sportHouses.houseId] }), foreignKey({ name: "match_away_fk", columns: [t.eventId, t.sportId, t.awayId], foreignColumns: [sportHouses.eventId, sportHouses.sportId, sportHouses.houseId] }), check("match_two_houses", sql`${t.homeId} <> ${t.awayId}`), check("match_time_order", sql`${t.endTime} > ${t.startTime}`), index("match_event_date").on(t.eventId, t.date, t.startTime), index("match_conflict_date").on(t.date, t.startTime, t.endTime)]);
export const matchScores = pgTable("match_scores", {
  matchId: integer("match_id").primaryKey().references(() => matches.id), home: integer("home_score").notNull(), away: integer("away_score").notNull(),
  recordedBy: integer("recorded_by").notNull().references(() => users.id), updatedAt: updated(),
}, (t) => [check("score_nonnegative", sql`${t.home} >= 0 and ${t.away} >= 0`)]);
export const pointSettings = pgTable("point_settings", {
  eventId: integer("intramurals_id").notNull().references(() => intramurals.id), placement: smallint("placement").notNull(), points: integer("points").default(0).notNull(),
}, (t) => [primaryKey({ columns: [t.eventId, t.placement] }), check("placement_points_range", sql`${t.placement} > 0 and ${t.points} >= 0`)]);
export const medalAwards = pgTable("medal_awards", {
  id: serial("id").primaryKey(), eventId: integer("intramurals_id").notNull(), sportId: integer("sport_id").notNull(), houseId: integer("house_id").notNull(),
  label: varchar("award_label", { length: 100 }).notNull(), placement: smallint("placement").notNull(),
}, (t) => [foreignKey({ name: "award_sport_house_fk", columns: [t.eventId, t.sportId, t.houseId], foreignColumns: [sportHouses.eventId, sportHouses.sportId, sportHouses.houseId] }), unique("award_unique_place").on(t.eventId, t.sportId, t.label, t.placement), check("award_place_positive", sql`${t.placement} > 0`)]);
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(), eventId: integer("intramurals_id").notNull().references(() => intramurals.id),
  title: varchar("title", { length: 160 }).notNull(), body: text("body").notNull(), audience: audience("audience").default("workspace").notNull(),
  pinned: boolean("pinned").default(false).notNull(), publishedAt: stamp("published_at"), createdBy: integer("created_by").notNull().references(() => users.id), createdAt: created(), updatedAt: updated(),
}, (t) => [index("announcements_event_published").on(t.eventId, t.publishedAt)]);
export const galleryPhotos = pgTable("gallery_photos", {
  id: serial("id").primaryKey(), eventId: integer("intramurals_id").notNull().references(() => intramurals.id),
  url: varchar("file_url", { length: 255 }).notNull(), caption: varchar("caption", { length: 200 }).notNull(), published: boolean("published").default(false).notNull(), createdAt: created(),
});
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(), actorId: integer("actor_id").notNull().references(() => users.id), eventId: integer("intramurals_id").references(() => intramurals.id),
  action: varchar("action", { length: 60 }).notNull(), entity: varchar("entity_type", { length: 60 }).notNull(), entityId: varchar("entity_id", { length: 80 }),
  reason: varchar("reason", { length: 400 }), snapshot: jsonb("snapshot"), createdAt: created(),
}, (t) => [index("audit_event_time").on(t.eventId, t.createdAt)]);

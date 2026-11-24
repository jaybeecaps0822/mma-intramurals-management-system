CREATE TYPE "public"."attendance_method" AS ENUM('qr', 'rfid', 'face', 'manual');
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'late', 'absent', 'excused');
CREATE TYPE "public"."attendance_type" AS ENUM('in', 'out');
CREATE TYPE "public"."announcement_audience" AS ENUM('public', 'workspace');
CREATE TYPE "public"."event_state" AS ENUM('draft', 'active', 'completed');
CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'live', 'completed', 'cancelled');
CREATE TYPE "public"."media_scope" AS ENUM('student', 'house', 'school', 'gallery');
CREATE TYPE "public"."role_key" AS ENUM('admin', 'student', 'adviser');
CREATE TYPE "public"."sanction_status" AS ENUM('outstanding', 'settled', 'waived', 'voided', 'refund_due');
CREATE TYPE "public"."sport_division" AS ENUM('male', 'female', 'mixed');
CREATE TYPE "public"."sport_kind" AS ENUM('individual', 'team');
CREATE TYPE "public"."tournament_format" AS ENUM('single', 'double', 'round_robin');
CREATE TABLE "advisers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"department" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advisers_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"intramurals_id" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"audience" "announcement_audience" DEFAULT 'workspace' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "athlete_sports" (
	"intramurals_id" integer NOT NULL,
	"sport_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_sports_intramurals_id_sport_id_student_id_pk" PRIMARY KEY("intramurals_id","sport_id","student_id")
);

CREATE TABLE "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"intramurals_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"attendance_date" date NOT NULL,
	"time_in" timestamp with time zone,
	"time_out" timestamp with time zone,
	"in_session_id" integer,
	"out_session_id" integer,
	"in_station_id" integer,
	"out_station_id" integer,
	"in_method" "attendance_method",
	"out_method" "attendance_method",
	"sanction_eligible" boolean DEFAULT false NOT NULL,
	"status" "attendance_status" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_once_daily" UNIQUE("student_id","intramurals_id","attendance_date"),
	CONSTRAINT "attendance_time_order" CHECK ("attendance"."time_out" is null or ("attendance"."time_in" is not null and "attendance"."time_out" >= "attendance"."time_in"))
);

CREATE TABLE "attendance_sanctions" (
	"id" serial PRIMARY KEY NOT NULL,
	"intramurals_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"attendance_date" date NOT NULL,
	"amount_centavos" integer NOT NULL,
	"status" "sanction_status" DEFAULT 'outstanding' NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revised_by" integer,
	"review_reason" varchar(400),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sanction_once_daily" UNIQUE("student_id","intramurals_id","attendance_date"),
	CONSTRAINT "sanction_positive_amount" CHECK ("attendance_sanctions"."amount_centavos" > 0)
);

CREATE TABLE "attendance_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"intramurals_id" integer NOT NULL,
	"attendance_date" date NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"face_pin_hash" varchar(64),
	"session_type" "attendance_type" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_sessions_token_hash_unique" UNIQUE("token_hash")
);

CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer NOT NULL,
	"intramurals_id" integer,
	"action" varchar(60) NOT NULL,
	"entity_type" varchar(60) NOT NULL,
	"entity_id" varchar(80),
	"reason" varchar(400),
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "auth_sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "event_houses" (
	"intramurals_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	CONSTRAINT "event_houses_intramurals_id_house_id_pk" PRIMARY KEY("intramurals_id","house_id")
);

CREATE TABLE "event_sports" (
	"intramurals_id" integer NOT NULL,
	"sport_id" integer NOT NULL,
	CONSTRAINT "event_sports_intramurals_id_sport_id_pk" PRIMARY KEY("intramurals_id","sport_id")
);

CREATE TABLE "face_profiles" (
	"student_id" integer PRIMARY KEY NOT NULL,
	"encrypted_template" varchar(850) NOT NULL,
	"version" varchar(32) NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"review_code" varchar(8),
	"approved_at" timestamp with time zone,
	"approved_by" integer,
	CONSTRAINT "face_profile_approval_state" CHECK (("face_profiles"."review_code" is not null and "face_profiles"."approved_at" is null and "face_profiles"."approved_by" is null) or ("face_profiles"."review_code" is null and "face_profiles"."approved_at" is not null and "face_profiles"."approved_by" is not null))
);

CREATE TABLE "finalized_attendance_days" (
	"intramurals_id" integer NOT NULL,
	"attendance_date" date NOT NULL,
	"finalized_by" integer NOT NULL,
	"finalized_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finalized_attendance_days_intramurals_id_attendance_date_pk" PRIMARY KEY("intramurals_id","attendance_date")
);

CREATE TABLE "gallery_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"intramurals_id" integer NOT NULL,
	"file_url" varchar(255) NOT NULL,
	"caption" varchar(200) NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "house_advisers" (
	"intramurals_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	"adviser_id" integer NOT NULL,
	CONSTRAINT "house_advisers_intramurals_id_house_id_adviser_id_pk" PRIMARY KEY("intramurals_id","house_id","adviser_id")
);

CREATE TABLE "houses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(7) NOT NULL,
	"emblem" varchar(24) DEFAULT 'shield' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"logo_url" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "houses_name_unique" UNIQUE("name"),
	CONSTRAINT "house_hex_color" CHECK ("houses"."color" ~ '^#[0-9a-fA-F]{6}$')
);

CREATE TABLE "intramurals" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(80) NOT NULL,
	"title" varchar(150) NOT NULL,
	"school_year" varchar(24) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" varchar(125) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"cutoff_time" time DEFAULT '08:00' NOT NULL,
	"state" "event_state" DEFAULT 'draft' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intramurals_slug_unique" UNIQUE("slug"),
	CONSTRAINT "event_date_order" CHECK ("intramurals"."end_date" >= "intramurals"."start_date")
);

CREATE TABLE "login_limits" (
	"limit_key" varchar(64) PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE "match_scores" (
	"match_id" integer PRIMARY KEY NOT NULL,
	"home_score" integer NOT NULL,
	"away_score" integer NOT NULL,
	"recorded_by" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_nonnegative" CHECK ("match_scores"."home_score" >= 0 and "match_scores"."away_score" >= 0)
);

CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"intramurals_id" integer NOT NULL,
	"sport_id" integer NOT NULL,
	"tournament_id" integer,
	"round_label" varchar(80) NOT NULL,
	"format" "tournament_format" DEFAULT 'round_robin' NOT NULL,
	"home_house_id" integer NOT NULL,
	"away_house_id" integer NOT NULL,
	"venue_id" integer NOT NULL,
	"official_id" integer,
	"match_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_two_houses" CHECK ("matches"."home_house_id" <> "matches"."away_house_id"),
	CONSTRAINT "match_time_order" CHECK ("matches"."end_time" > "matches"."start_time")
);

CREATE TABLE "medal_awards" (
	"id" serial PRIMARY KEY NOT NULL,
	"intramurals_id" integer NOT NULL,
	"sport_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	"award_label" varchar(100) NOT NULL,
	"placement" smallint NOT NULL,
	CONSTRAINT "award_unique_place" UNIQUE("intramurals_id","sport_id","award_label","placement"),
	CONSTRAINT "award_place_positive" CHECK ("medal_awards"."placement" > 0)
);

CREATE TABLE "media_assets" (
	"media_key" varchar(32) PRIMARY KEY NOT NULL,
	"scope" "media_scope" NOT NULL,
	"image_base64" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_data_size" CHECK (length("media_assets"."image_base64") between 1 and 2796204)
);

CREATE TABLE "game_officials" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(125) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "game_officials_name_unique" UNIQUE("name")
);

CREATE TABLE "point_settings" (
	"intramurals_id" integer NOT NULL,
	"placement" smallint NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "point_settings_intramurals_id_placement_pk" PRIMARY KEY("intramurals_id","placement"),
	CONSTRAINT "placement_points_range" CHECK ("point_settings"."placement" > 0 and "point_settings"."points" >= 0)
);

CREATE TABLE "rfid_cards" (
	"student_id" integer PRIMARY KEY NOT NULL,
	"card_digest" varchar(64) NOT NULL,
	"issued_by" integer NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfid_cards_card_digest_unique" UNIQUE("card_digest")
);

CREATE TABLE "rfid_stations" (
	"id" serial PRIMARY KEY NOT NULL,
	"intramurals_id" integer NOT NULL,
	"attendance_date" date NOT NULL,
	"session_type" "attendance_type" NOT NULL,
	"operator_id" integer NOT NULL,
	"operator_session_hash" varchar(64) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "roles" (
	"role_key" "role_key" PRIMARY KEY NOT NULL,
	"label" varchar(40) NOT NULL
);

CREATE TABLE "system_settings" (
	"settings_key" varchar(24) PRIMARY KEY NOT NULL,
	"school_name" varchar(150) NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"school_logo_url" varchar(255),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "sport_houses" (
	"intramurals_id" integer NOT NULL,
	"sport_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	CONSTRAINT "sport_houses_intramurals_id_sport_id_house_id_pk" PRIMARY KEY("intramurals_id","sport_id","house_id")
);

CREATE TABLE "sports" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"category" varchar(70) NOT NULL,
	"division" "sport_division" DEFAULT 'mixed' NOT NULL,
	"kind" "sport_kind" DEFAULT 'team' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"rules" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sports_name_unique" UNIQUE("name")
);

CREATE TABLE "students" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"student_number" varchar(80) NOT NULL,
	"first_name" varchar(75) NOT NULL,
	"middle_name" varchar(75),
	"last_name" varchar(75) NOT NULL,
	"gender" varchar(24),
	"course" varchar(100) NOT NULL,
	"year_level" smallint NOT NULL,
	"phone" varchar(32),
	"photo_url" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "students_student_number_unique" UNIQUE("student_number"),
	CONSTRAINT "student_year_range" CHECK ("students"."year_level" between 1 and 12)
);

CREATE TABLE "team_members" (
	"intramurals_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_intramurals_id_student_id_pk" PRIMARY KEY("intramurals_id","student_id")
);

CREATE TABLE "tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"intramurals_id" integer NOT NULL,
	"sport_id" integer NOT NULL,
	"name" varchar(125) NOT NULL,
	"format" "tournament_format" NOT NULL,
	CONSTRAINT "tournament_event_name" UNIQUE("intramurals_id","sport_id","name"),
	CONSTRAINT "tournament_context" UNIQUE("id","intramurals_id","sport_id")
);

CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_key" "role_key" NOT NULL,
	"username" varchar(80) NOT NULL,
	"display_name" varchar(150) NOT NULL,
	"email" varchar(254),
	"password_hash" varchar(255) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_normal_username" CHECK ("users"."username" = lower("users"."username"))
);

CREATE TABLE "venues" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"location" varchar(125) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "venues_name_unique" UNIQUE("name")
);

ALTER TABLE "advisers" ADD CONSTRAINT "advisers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_intramurals_id_intramurals_id_fk" FOREIGN KEY ("intramurals_id") REFERENCES "public"."intramurals"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "athlete_sports" ADD CONSTRAINT "athlete_event_sport_fk" FOREIGN KEY ("intramurals_id","sport_id") REFERENCES "public"."event_sports"("intramurals_id","sport_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "athlete_sports" ADD CONSTRAINT "athlete_event_member_fk" FOREIGN KEY ("intramurals_id","student_id") REFERENCES "public"."team_members"("intramurals_id","student_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_in_session_id_attendance_sessions_id_fk" FOREIGN KEY ("in_session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_out_session_id_attendance_sessions_id_fk" FOREIGN KEY ("out_session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_in_station_id_rfid_stations_id_fk" FOREIGN KEY ("in_station_id") REFERENCES "public"."rfid_stations"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_out_station_id_rfid_stations_id_fk" FOREIGN KEY ("out_station_id") REFERENCES "public"."rfid_stations"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_member_fk" FOREIGN KEY ("intramurals_id","student_id") REFERENCES "public"."team_members"("intramurals_id","student_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance_sanctions" ADD CONSTRAINT "attendance_sanctions_revised_by_users_id_fk" FOREIGN KEY ("revised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance_sanctions" ADD CONSTRAINT "sanction_finalized_day_fk" FOREIGN KEY ("intramurals_id","attendance_date") REFERENCES "public"."finalized_attendance_days"("intramurals_id","attendance_date") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance_sanctions" ADD CONSTRAINT "sanction_attendance_fk" FOREIGN KEY ("student_id","intramurals_id","attendance_date") REFERENCES "public"."attendance"("student_id","intramurals_id","attendance_date") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_intramurals_id_intramurals_id_fk" FOREIGN KEY ("intramurals_id") REFERENCES "public"."intramurals"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_intramurals_id_intramurals_id_fk" FOREIGN KEY ("intramurals_id") REFERENCES "public"."intramurals"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_houses" ADD CONSTRAINT "event_houses_intramurals_id_intramurals_id_fk" FOREIGN KEY ("intramurals_id") REFERENCES "public"."intramurals"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "event_houses" ADD CONSTRAINT "event_houses_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "event_sports" ADD CONSTRAINT "event_sports_intramurals_id_intramurals_id_fk" FOREIGN KEY ("intramurals_id") REFERENCES "public"."intramurals"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "event_sports" ADD CONSTRAINT "event_sports_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "face_profiles" ADD CONSTRAINT "face_profiles_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "face_profiles" ADD CONSTRAINT "face_profiles_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "finalized_attendance_days" ADD CONSTRAINT "finalized_attendance_days_intramurals_id_intramurals_id_fk" FOREIGN KEY ("intramurals_id") REFERENCES "public"."intramurals"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "finalized_attendance_days" ADD CONSTRAINT "finalized_attendance_days_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "gallery_photos" ADD CONSTRAINT "gallery_photos_intramurals_id_intramurals_id_fk" FOREIGN KEY ("intramurals_id") REFERENCES "public"."intramurals"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "house_advisers" ADD CONSTRAINT "house_advisers_adviser_id_advisers_id_fk" FOREIGN KEY ("adviser_id") REFERENCES "public"."advisers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "house_advisers" ADD CONSTRAINT "adviser_event_house_fk" FOREIGN KEY ("intramurals_id","house_id") REFERENCES "public"."event_houses"("intramurals_id","house_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "matches" ADD CONSTRAINT "matches_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "matches" ADD CONSTRAINT "matches_official_id_game_officials_id_fk" FOREIGN KEY ("official_id") REFERENCES "public"."game_officials"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "matches" ADD CONSTRAINT "match_tournament_fk" FOREIGN KEY ("tournament_id","intramurals_id","sport_id") REFERENCES "public"."tournaments"("id","intramurals_id","sport_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "matches" ADD CONSTRAINT "match_home_fk" FOREIGN KEY ("intramurals_id","sport_id","home_house_id") REFERENCES "public"."sport_houses"("intramurals_id","sport_id","house_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "matches" ADD CONSTRAINT "match_away_fk" FOREIGN KEY ("intramurals_id","sport_id","away_house_id") REFERENCES "public"."sport_houses"("intramurals_id","sport_id","house_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "medal_awards" ADD CONSTRAINT "award_sport_house_fk" FOREIGN KEY ("intramurals_id","sport_id","house_id") REFERENCES "public"."sport_houses"("intramurals_id","sport_id","house_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "point_settings" ADD CONSTRAINT "point_settings_intramurals_id_intramurals_id_fk" FOREIGN KEY ("intramurals_id") REFERENCES "public"."intramurals"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "rfid_cards" ADD CONSTRAINT "rfid_cards_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "rfid_cards" ADD CONSTRAINT "rfid_cards_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "rfid_stations" ADD CONSTRAINT "rfid_stations_intramurals_id_intramurals_id_fk" FOREIGN KEY ("intramurals_id") REFERENCES "public"."intramurals"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "rfid_stations" ADD CONSTRAINT "rfid_stations_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "sport_houses" ADD CONSTRAINT "sport_house_event_fk" FOREIGN KEY ("intramurals_id","house_id") REFERENCES "public"."event_houses"("intramurals_id","house_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "sport_houses" ADD CONSTRAINT "sport_house_sport_fk" FOREIGN KEY ("intramurals_id","sport_id") REFERENCES "public"."event_sports"("intramurals_id","sport_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "team_members" ADD CONSTRAINT "member_event_house_fk" FOREIGN KEY ("intramurals_id","house_id") REFERENCES "public"."event_houses"("intramurals_id","house_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tournaments" ADD CONSTRAINT "tournament_event_sport_fk" FOREIGN KEY ("intramurals_id","sport_id") REFERENCES "public"."event_sports"("intramurals_id","sport_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "users" ADD CONSTRAINT "users_role_key_roles_role_key_fk" FOREIGN KEY ("role_key") REFERENCES "public"."roles"("role_key") ON DELETE no action ON UPDATE no action;
CREATE INDEX "announcements_event_published" ON "announcements" USING btree ("intramurals_id","published_at");
CREATE INDEX "attendance_event_day_status" ON "attendance" USING btree ("intramurals_id","attendance_date","status");
CREATE INDEX "sanction_event_date_status" ON "attendance_sanctions" USING btree ("intramurals_id","attendance_date","status");
CREATE UNIQUE INDEX "one_active_attendance_direction" ON "attendance_sessions" USING btree ("intramurals_id","session_type") WHERE "attendance_sessions"."active";
CREATE INDEX "qr_session_expiry" ON "attendance_sessions" USING btree ("expires_at");
CREATE INDEX "attendance_face_pin_lookup" ON "attendance_sessions" USING btree ("intramurals_id","face_pin_hash");
CREATE INDEX "audit_event_time" ON "audit_logs" USING btree ("intramurals_id","created_at");
CREATE INDEX "auth_sessions_user" ON "auth_sessions" USING btree ("user_id");
CREATE INDEX "auth_sessions_expiry" ON "auth_sessions" USING btree ("expires_at");
CREATE INDEX "face_profiles_expiry" ON "face_profiles" USING btree ("expires_at");
CREATE INDEX "adviser_event_lookup" ON "house_advisers" USING btree ("adviser_id","intramurals_id");
CREATE UNIQUE INDEX "event_single_active" ON "intramurals" USING btree ("state") WHERE "intramurals"."state" = 'active';
CREATE INDEX "event_public_start" ON "intramurals" USING btree ("published","start_date");
CREATE INDEX "login_limits_expiry" ON "login_limits" USING btree ("expires_at");
CREATE INDEX "match_event_date" ON "matches" USING btree ("intramurals_id","match_date","start_time");
CREATE INDEX "match_conflict_date" ON "matches" USING btree ("match_date","start_time","end_time");
CREATE INDEX "rfid_station_event_active" ON "rfid_stations" USING btree ("intramurals_id","active");
CREATE INDEX "rfid_station_operator_active" ON "rfid_stations" USING btree ("operator_id","active");
CREATE INDEX "student_course_year" ON "students" USING btree ("course","year_level");
CREATE INDEX "student_name" ON "students" USING btree ("last_name","first_name");
CREATE INDEX "event_members_house" ON "team_members" USING btree ("intramurals_id","house_id");
CREATE INDEX "users_role_active" ON "users" USING btree ("role_key","active");

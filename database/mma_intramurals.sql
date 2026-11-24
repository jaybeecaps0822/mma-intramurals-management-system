-- MMA Intramurals Management System — MySQL 8.0.16+ / current XAMPP MariaDB
-- Import once into a new server/database via phpMyAdmin. Do not replace an existing production schema.
CREATE DATABASE IF NOT EXISTS mma_intramurals CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mma_intramurals;

CREATE TABLE roles (
  role_key VARCHAR(16) PRIMARY KEY,
  label VARCHAR(40) NOT NULL
) ENGINE=InnoDB;
INSERT INTO roles VALUES ('admin','Administrator'),('student','Student'),('adviser','Team Adviser');

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_key VARCHAR(16) NOT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  display_name VARCHAR(150) NOT NULL,
  email VARCHAR(254),
  password_hash VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT users_role_fk FOREIGN KEY (role_key) REFERENCES roles(role_key),
  KEY users_role_active (role_key,active)
) ENGINE=InnoDB;

CREATE TABLE media_assets (
  media_key CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  scope ENUM('student','house','school','gallery') NOT NULL,
  image_base64 MEDIUMTEXT CHARACTER SET ascii NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT media_data_size CHECK (CHAR_LENGTH(image_base64) BETWEEN 1 AND 2796204)
) ENGINE=InnoDB;

CREATE TABLE auth_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY auth_session_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE login_limits (
  limit_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  expires_at DATETIME(3) NOT NULL,
  KEY login_limit_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE students (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL UNIQUE,
  student_number VARCHAR(80) NOT NULL UNIQUE,
  first_name VARCHAR(75) NOT NULL,
  middle_name VARCHAR(75),
  last_name VARCHAR(75) NOT NULL,
  gender VARCHAR(24),
  course VARCHAR(100) NOT NULL,
  year_level TINYINT UNSIGNED NOT NULL CHECK (year_level BETWEEN 1 AND 12),
  phone VARCHAR(32),
  photo_url VARCHAR(255),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id),
  KEY students_course_year (course,year_level),
  KEY students_name (last_name,first_name)
) ENGINE=InnoDB;

CREATE TABLE advisers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL UNIQUE,
  department VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE system_settings (
  settings_key VARCHAR(24) PRIMARY KEY,
  school_name VARCHAR(150) NOT NULL,
  timezone VARCHAR(80) NOT NULL,
  school_logo_url VARCHAR(255),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
INSERT INTO system_settings (settings_key,school_name,timezone) VALUES ('main','MMA','Asia/Manila');

CREATE TABLE intramurals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(80) NOT NULL UNIQUE,
  title VARCHAR(150) NOT NULL,
  school_year VARCHAR(24) NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(125) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  cutoff_time TIME NOT NULL DEFAULT '08:00:00',
  state ENUM('draft','active','completed') NOT NULL DEFAULT 'draft',
  active_gate TINYINT GENERATED ALWAYS AS (CASE WHEN state='active' THEN 1 ELSE NULL END) STORED UNIQUE,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT intramurals_dates CHECK (end_date >= start_date),
  KEY events_public (published,start_date)
) ENGINE=InnoDB;

CREATE TABLE houses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  color CHAR(7) NOT NULL,
  emblem VARCHAR(24) NOT NULL DEFAULT 'shield',
  description TEXT NOT NULL,
  logo_url VARCHAR(255),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
INSERT INTO houses (name,color,emblem,description) VALUES
 ('Red House','#e64d59','flame','Courage and determination.'),('Blue House','#447de0','waves','Focus and teamwork.'),
 ('Green House','#2cad7a','leaf','Growth and resilience.'),('Yellow House','#e8aa20','zap','Energy and optimism.');

CREATE TABLE event_houses (
  intramurals_id INT UNSIGNED NOT NULL,
  house_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (intramurals_id,house_id),
  FOREIGN KEY (intramurals_id) REFERENCES intramurals(id),
  FOREIGN KEY (house_id) REFERENCES houses(id)
) ENGINE=InnoDB;

CREATE TABLE team_members (
  intramurals_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  house_id INT UNSIGNED NOT NULL,
  assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (intramurals_id,student_id),
  FOREIGN KEY (intramurals_id,house_id) REFERENCES event_houses(intramurals_id,house_id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  KEY members_house (intramurals_id,house_id)
) ENGINE=InnoDB;

CREATE TABLE house_advisers (
  intramurals_id INT UNSIGNED NOT NULL,
  house_id INT UNSIGNED NOT NULL,
  adviser_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (intramurals_id,house_id,adviser_id),
  FOREIGN KEY (intramurals_id,house_id) REFERENCES event_houses(intramurals_id,house_id),
  FOREIGN KEY (adviser_id) REFERENCES advisers(id),
  KEY adviser_event (adviser_id,intramurals_id)
) ENGINE=InnoDB;

CREATE TABLE rfid_cards (
  student_id INT UNSIGNED PRIMARY KEY,
  card_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  issued_by INT UNSIGNED NOT NULL,
  issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (issued_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE face_profiles (
  student_id INT UNSIGNED PRIMARY KEY,
  encrypted_template VARCHAR(850) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version VARCHAR(32) NOT NULL,
  consented_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  review_code CHAR(8) CHARACTER SET ascii COLLATE ascii_bin,
  approved_at DATETIME(3),
  approved_by INT UNSIGNED,
  KEY face_profiles_expiry (expires_at),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  CONSTRAINT face_profile_approval_state CHECK (
    (review_code IS NOT NULL AND approved_at IS NULL AND approved_by IS NULL) OR
    (review_code IS NULL AND approved_at IS NOT NULL AND approved_by IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE rfid_stations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  intramurals_id INT UNSIGNED NOT NULL,
  attendance_date DATE NOT NULL,
  session_type ENUM('in','out') NOT NULL,
  operator_id INT UNSIGNED NOT NULL,
  operator_session_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (intramurals_id) REFERENCES intramurals(id),
  FOREIGN KEY (operator_id) REFERENCES users(id),
  KEY rfid_station_event_active (intramurals_id,active),
  KEY rfid_station_operator_active (operator_id,active)
) ENGINE=InnoDB;

CREATE TABLE finalized_attendance_days (
  intramurals_id INT UNSIGNED NOT NULL,
  attendance_date DATE NOT NULL,
  finalized_by INT UNSIGNED NOT NULL,
  finalized_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (intramurals_id,attendance_date),
  FOREIGN KEY (intramurals_id) REFERENCES intramurals(id),
  FOREIGN KEY (finalized_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE attendance_sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  intramurals_id INT UNSIGNED NOT NULL,
  attendance_date DATE NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  face_pin_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin,
  session_type ENUM('in','out') NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  active_gate TINYINT GENERATED ALWAYS AS (CASE WHEN active THEN 1 ELSE NULL END) STORED,
  expires_at DATETIME(3) NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (intramurals_id) REFERENCES intramurals(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE KEY attendance_open_session (intramurals_id,session_type,active_gate),
  KEY attendance_session_expiry (expires_at),
  KEY attendance_face_pin_lookup (intramurals_id,face_pin_hash)
) ENGINE=InnoDB;

CREATE TABLE attendance (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  intramurals_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  attendance_date DATE NOT NULL,
  time_in DATETIME(3),
  time_out DATETIME(3),
  in_session_id INT UNSIGNED,
  out_session_id INT UNSIGNED,
  in_station_id INT UNSIGNED,
  out_station_id INT UNSIGNED,
  in_method ENUM('qr','rfid','face','manual'),
  out_method ENUM('qr','rfid','face','manual'),
  sanction_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('present','late','absent','excused') NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY attendance_once_per_date (student_id,intramurals_id,attendance_date),
  FOREIGN KEY (intramurals_id,student_id) REFERENCES team_members(intramurals_id,student_id),
  FOREIGN KEY (in_session_id) REFERENCES attendance_sessions(id),
  FOREIGN KEY (out_session_id) REFERENCES attendance_sessions(id),
  FOREIGN KEY (in_station_id) REFERENCES rfid_stations(id),
  FOREIGN KEY (out_station_id) REFERENCES rfid_stations(id),
  CONSTRAINT attendance_time_order CHECK (time_out IS NULL OR (time_in IS NOT NULL AND time_out >= time_in)),
  KEY attendance_daily (intramurals_id,attendance_date,status)
) ENGINE=InnoDB;

CREATE TABLE attendance_sanctions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  intramurals_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  attendance_date DATE NOT NULL,
  amount_centavos INT UNSIGNED NOT NULL CHECK (amount_centavos > 0),
  status ENUM('outstanding','settled','waived','voided','refund_due') NOT NULL DEFAULT 'outstanding',
  assessed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revised_by INT UNSIGNED,
  review_reason VARCHAR(400),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY sanction_once_daily (student_id,intramurals_id,attendance_date),
  FOREIGN KEY (intramurals_id,attendance_date) REFERENCES finalized_attendance_days(intramurals_id,attendance_date),
  FOREIGN KEY (student_id,intramurals_id,attendance_date) REFERENCES attendance(student_id,intramurals_id,attendance_date),
  FOREIGN KEY (revised_by) REFERENCES users(id),
  KEY sanction_event_date_status (intramurals_id,attendance_date,status)
) ENGINE=InnoDB;

CREATE TABLE sports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  category VARCHAR(70) NOT NULL,
  division ENUM('male','female','mixed') NOT NULL DEFAULT 'mixed',
  kind ENUM('individual','team') NOT NULL DEFAULT 'team',
  description TEXT NOT NULL,
  rules TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE event_sports (
  intramurals_id INT UNSIGNED NOT NULL,
  sport_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (intramurals_id,sport_id),
  FOREIGN KEY (intramurals_id) REFERENCES intramurals(id),
  FOREIGN KEY (sport_id) REFERENCES sports(id)
) ENGINE=InnoDB;

CREATE TABLE sport_houses (
  intramurals_id INT UNSIGNED NOT NULL,
  sport_id INT UNSIGNED NOT NULL,
  house_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (intramurals_id,sport_id,house_id),
  FOREIGN KEY (intramurals_id,sport_id) REFERENCES event_sports(intramurals_id,sport_id),
  FOREIGN KEY (intramurals_id,house_id) REFERENCES event_houses(intramurals_id,house_id)
) ENGINE=InnoDB;

CREATE TABLE athlete_sports (
  intramurals_id INT UNSIGNED NOT NULL,
  sport_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  registered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (intramurals_id,sport_id,student_id),
  FOREIGN KEY (intramurals_id,sport_id) REFERENCES event_sports(intramurals_id,sport_id),
  FOREIGN KEY (intramurals_id,student_id) REFERENCES team_members(intramurals_id,student_id)
) ENGINE=InnoDB;

CREATE TABLE venues (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  location VARCHAR(125) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE game_officials (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(125) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE tournaments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  intramurals_id INT UNSIGNED NOT NULL,
  sport_id INT UNSIGNED NOT NULL,
  name VARCHAR(125) NOT NULL,
  format ENUM('single','double','round_robin') NOT NULL,
  FOREIGN KEY (intramurals_id,sport_id) REFERENCES event_sports(intramurals_id,sport_id),
  UNIQUE KEY tournament_name (intramurals_id,sport_id,name),
  UNIQUE KEY tournament_context (id,intramurals_id,sport_id)
) ENGINE=InnoDB;

CREATE TABLE matches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  intramurals_id INT UNSIGNED NOT NULL,
  sport_id INT UNSIGNED NOT NULL,
  tournament_id INT UNSIGNED,
  round_label VARCHAR(80) NOT NULL,
  format ENUM('single','double','round_robin') NOT NULL DEFAULT 'round_robin',
  home_house_id INT UNSIGNED NOT NULL,
  away_house_id INT UNSIGNED NOT NULL,
  venue_id INT UNSIGNED NOT NULL,
  official_id INT UNSIGNED,
  match_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status ENUM('scheduled','live','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (tournament_id,intramurals_id,sport_id) REFERENCES tournaments(id,intramurals_id,sport_id),
  FOREIGN KEY (intramurals_id,sport_id,home_house_id) REFERENCES sport_houses(intramurals_id,sport_id,house_id),
  FOREIGN KEY (intramurals_id,sport_id,away_house_id) REFERENCES sport_houses(intramurals_id,sport_id,house_id),
  FOREIGN KEY (venue_id) REFERENCES venues(id),
  FOREIGN KEY (official_id) REFERENCES game_officials(id),
  CONSTRAINT matches_distinct_house CHECK (home_house_id <> away_house_id),
  CONSTRAINT matches_time_order CHECK (end_time > start_time),
  KEY matches_event_day (intramurals_id,match_date,start_time),
  KEY matches_conflict_day (match_date,start_time,end_time)
) ENGINE=InnoDB;

CREATE TABLE match_scores (
  match_id INT UNSIGNED PRIMARY KEY,
  home_score INT UNSIGNED NOT NULL,
  away_score INT UNSIGNED NOT NULL,
  recorded_by INT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (match_id) REFERENCES matches(id),
  FOREIGN KEY (recorded_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE point_settings (
  intramurals_id INT UNSIGNED NOT NULL,
  placement SMALLINT UNSIGNED NOT NULL CHECK (placement > 0),
  points INT UNSIGNED NOT NULL,
  PRIMARY KEY (intramurals_id,placement),
  FOREIGN KEY (intramurals_id) REFERENCES intramurals(id)
) ENGINE=InnoDB;

CREATE TABLE medal_awards (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  intramurals_id INT UNSIGNED NOT NULL,
  sport_id INT UNSIGNED NOT NULL,
  house_id INT UNSIGNED NOT NULL,
  award_label VARCHAR(100) NOT NULL,
  placement SMALLINT UNSIGNED NOT NULL CHECK (placement > 0),
  UNIQUE KEY medal_placing (intramurals_id,sport_id,award_label,placement),
  FOREIGN KEY (intramurals_id,sport_id,house_id) REFERENCES sport_houses(intramurals_id,sport_id,house_id)
) ENGINE=InnoDB;

CREATE TABLE announcements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  intramurals_id INT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  audience ENUM('public','workspace') NOT NULL DEFAULT 'workspace',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  published_at DATETIME(3),
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (intramurals_id) REFERENCES intramurals(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  KEY announcements_feed (intramurals_id,published_at)
) ENGINE=InnoDB;

CREATE TABLE gallery_photos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  intramurals_id INT UNSIGNED NOT NULL,
  file_url VARCHAR(255) NOT NULL,
  caption VARCHAR(200) NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (intramurals_id) REFERENCES intramurals(id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id INT UNSIGNED NOT NULL,
  intramurals_id INT UNSIGNED,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(80),
  reason VARCHAR(400),
  snapshot JSON,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (actor_id) REFERENCES users(id),
  FOREIGN KEY (intramurals_id) REFERENCES intramurals(id),
  KEY audit_event_time (intramurals_id,created_at)
) ENGINE=InnoDB;

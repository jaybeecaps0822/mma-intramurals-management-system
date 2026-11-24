-- PostgreSQL migration from the original production schema. Do not apply after schema push or the full SQL export.
BEGIN;
CREATE TYPE attendance_method AS ENUM ('qr','rfid','face','manual');
CREATE TYPE sanction_status AS ENUM ('outstanding','settled','waived','voided','refund_due');
CREATE TABLE rfid_cards (
  student_id integer PRIMARY KEY REFERENCES students(id), card_digest varchar(64) UNIQUE NOT NULL,
  issued_by integer NOT NULL REFERENCES users(id), issued_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE face_profiles (
  student_id integer PRIMARY KEY REFERENCES students(id), encrypted_template varchar(850) NOT NULL,
  version varchar(32) NOT NULL, consented_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  review_code varchar(8), approved_at timestamptz, approved_by integer REFERENCES users(id),
  CONSTRAINT face_profile_approval_state CHECK (
    (review_code IS NOT NULL AND approved_at IS NULL AND approved_by IS NULL) OR
    (review_code IS NULL AND approved_at IS NOT NULL AND approved_by IS NOT NULL))
);
CREATE INDEX face_profiles_expiry ON face_profiles (expires_at);
CREATE TABLE rfid_stations (
  id serial PRIMARY KEY, intramurals_id integer NOT NULL REFERENCES intramurals(id), attendance_date date NOT NULL,
  session_type attendance_type NOT NULL, operator_id integer NOT NULL REFERENCES users(id), operator_session_hash varchar(64) NOT NULL,
  active boolean NOT NULL DEFAULT true, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rfid_station_event_active ON rfid_stations (intramurals_id,active);
CREATE INDEX rfid_station_operator_active ON rfid_stations (operator_id,active);
CREATE TABLE finalized_attendance_days (
  intramurals_id integer NOT NULL REFERENCES intramurals(id), attendance_date date NOT NULL,
  finalized_by integer NOT NULL REFERENCES users(id), finalized_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (intramurals_id,attendance_date)
);
ALTER TABLE attendance_sessions ADD COLUMN face_pin_hash varchar(64);
CREATE INDEX attendance_face_pin_lookup ON attendance_sessions (intramurals_id,face_pin_hash);
ALTER TABLE attendance ADD COLUMN in_station_id integer REFERENCES rfid_stations(id), ADD COLUMN out_station_id integer REFERENCES rfid_stations(id),
  ADD COLUMN in_method attendance_method, ADD COLUMN out_method attendance_method,
  ADD COLUMN sanction_eligible boolean NOT NULL DEFAULT false;
UPDATE attendance SET in_method = 'qr' WHERE in_session_id IS NOT NULL;
UPDATE attendance SET out_method = 'qr' WHERE out_session_id IS NOT NULL;
CREATE TABLE attendance_sanctions (
  id serial PRIMARY KEY, intramurals_id integer NOT NULL, student_id integer NOT NULL, attendance_date date NOT NULL,
  amount_centavos integer NOT NULL, status sanction_status NOT NULL DEFAULT 'outstanding', assessed_at timestamptz NOT NULL DEFAULT now(),
  revised_by integer REFERENCES users(id), review_reason varchar(400), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sanction_once_daily UNIQUE (student_id,intramurals_id,attendance_date),
  CONSTRAINT sanction_finalized_day_fk FOREIGN KEY (intramurals_id,attendance_date) REFERENCES finalized_attendance_days(intramurals_id,attendance_date),
  CONSTRAINT sanction_attendance_fk FOREIGN KEY (student_id,intramurals_id,attendance_date) REFERENCES attendance(student_id,intramurals_id,attendance_date),
  CONSTRAINT sanction_positive_amount CHECK (amount_centavos > 0)
);
CREATE INDEX sanction_event_date_status ON attendance_sanctions (intramurals_id,attendance_date,status);
COMMIT;

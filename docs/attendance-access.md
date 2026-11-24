# RFID, face verification, and attendance sanctions

These features extend the deployed Next.js / PostgreSQL workspace. They do not replace QR attendance, and the MySQL SQL file is still a schema-only handoff, not a PHP reader or camera implementation.

## Upgrade an existing deployment

1. Back up PostgreSQL. In a maintenance window, apply `database/migrations/2026-11-attendance-access.sql` **once** to the previous schema, before restarting the app. Fresh databases use the updated exported SQL or Drizzle schema instead, not both. The migration preserves existing attendance, labels known legacy QR timestamps, and creates no penalties.
2. For each feature you enable, generate a separate 32-byte random base64url secret (e.g. `node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'`) and set `MMA_RFID_SECRET` and/or `MMA_FACE_SECRET` privately on every application instance. With no key, that feature is disabled and QR still works. Do not reuse a key or expose it through a `NEXT_PUBLIC_` variable. Key changes make old card assignments or face templates unusable; coordinate re-assignment or re-enrollment. Keep keys separate from database backups.
3. Keep the licensed `models/` directory with the production server (or set `MMA_FACE_MODEL_DIR`). The server computes embeddings locally using ONNX Runtime WASM. The browser sends only one bounded image per requested capture, over HTTPS (or localhost during development), not a video stream. Configure request limits at your reverse proxy and never log or retain biometric request bodies.
4. Approve the school's consent, identity check, opt-out, access, retention, and financial review policies before using real student data. Consider guardians' permission and local regulations where applicable. Schedule `npm exec tsx -- scripts/purge-expired-faces.ts` at a suitable interval (e.g. hourly) to physically delete expired templates even when the student does not return. Staff can also purge from **Attendance → Credentials**. Review backup retention and restore procedures too.

## Staffed RFID station

1. Use **Attendance → Credentials** to assign the physical card to an active student. Plug in a USB RFID reader in **HID keyboard mode** (not serial/PC/SC) configured to type the card ID followed by Enter. Use the same reader output format for enrollment and scanning (e.g. decimal or hexadecimal, with leading zeros preserved). A replacement or revocation immediately invalidates the old card. Only a keyed digest is persisted.
2. Select the active event. Go to **Attendance → RFID station**, choose **TIME IN** or **TIME OUT**, and open the station in an administrator's browser. Keep the scan field focused. The station is tied to that sign-in session and expires after 45 minutes or at the end of the school day, whichever comes first. Close it when the desk is unattended. It requires an active administrator session for every tap.
3. Keep staff at the desk. Keyboard-emulated IDs can be copied and are not cryptographic credentials. No driver, WebUSB support, NFC phone integration, or dedicated serial protocol is included. Check with the actual reader before deploying.

## Optional face attendance

1. A signed-in student opens **Face Verification**, opts in, and uses their camera to capture an enrollment image **while staff observes**. They show the eight-digit review code on their signed-in device and their school ID. The pending entry is usable for approval for 15 minutes.
2. Staff open **Attendance → Credentials → Awaiting face review**, confirm identity and enter the student's review code. Students can delete the enrollment without administrator permission. Only an authenticated, encrypted biometric template is stored; approval is time-bound (180 days). The system does not expose templates to staff, students, or the public, repurpose profile photos, or compare against the student population.
3. Under **Attendance → Generate QR**, select a direction and opt to issue a **face verification PIN**. Display it at the staffed desk. An enrolled student enters it in their own sign-in session and chooses **Verify and record**. The server compares the face to that student's own enrollment, and uses the same attendance date, duplicate prevention, cutoff, and checkout rules as QR. Leave QR/card alternatives visible and accessible.
4. This is **not** spoof-resistant liveness detection or proof of physical presence. A PIN or image can be shared. A supervised workflow and a school review of accuracy, false rejections, accessibility, and privacy are required. Failed verification does not mark anyone absent or trigger a charge. The public preview uses fictional data and does not access a camera.

## ₱50 sanctions and corrections

- Staff review a past required attendance date in **Attendance → Daily records** and finalize it explicitly. The system snapshots active, enrolled students eligible on that date (or with existing records on that date). A student who was assigned after the date and has no attendance record for it is not charged. An inactive account is not newly assessed. Only finalized, unexcused absences are assessed. A day may be finalized once; duplicate requests are idempotent. Failed scans, lateness, an excused status, and TIME IN without TIME OUT do not create sanctions.
- The ledger is **₱50.00 per unexcused absence per event/date**. Administrators can record an off-platform settlement, approve a waiver, or record a completed refund, with a reason. Correcting a charged absence to present, late, or excused voids the outstanding entry. If it was already settled the entry requires staff refund review. A correction does not discard the audit history.
- Students see only their own ledger. Advisers see rows for their assigned houses, without private review notes. The administrator sees the full ledger and may export CSV. The app never collects or transfers money, and there is no public sanction page. Follow an approved notice and review process before collecting any amount.

## Test

After a production build, run `MMA_SUITE=attendance bash scripts/smoke-local.sh` with the same PostgreSQL and Playwright prerequisites as the main smoke suite. The script generates independent test secrets and provisions a temporary database. It simulates a HID reader and a camera stream using generated adult portraits, and runs real CPU inference with two different synthetic identities. No real student data is used. Physical USB reader and camera testing, independent biometric evaluation, and privacy review still need to be done before production use.

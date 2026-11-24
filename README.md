# MMA Intramurals Management System

A role-based intramurals workspace with a public event site. The **running application is Next.js App Router + PostgreSQL (Drizzle)**, the sandbox stack. It is not a PHP application and does not connect to phpMyAdmin or MySQL. The repository separately includes an InnoDB schema, PDO connection, and secure administrator setup for a future PHP/XAMPP port.

## Try it

- `/` shows a fictional, read-only administrator preview. Use the account menu to switch between administrator, student, and team adviser previews. The preview never reads private school records or allows changes.
- `/login` signs in a provisioned account and redirects it to `/admin`, `/student`, or `/adviser`. A student signs in with their Student ID. There are no built-in passwords.
- `/public` shows published seasons, sports, fixtures, scores, medals, notices, and gallery items. Before an event is published, it clearly labels the fictional sample season.

## Install and provision the live app

Requires Node.js 22+, npm and PostgreSQL. Create a dedicated database and human-managed database role; do not use a PostgreSQL superuser in production. Copy `.env.example` to `.env` and set `DATABASE_URL` to that database. The provided sandbox already configures this variable. Behind an HTTPS reverse proxy, configure `APP_ORIGIN` to the external origin and forward the original host/protocol. Use TLS and a managed secret store for deployed credentials.

1. Run `npm ci`.
2. In a **new** development database, run `npx drizzle-kit push` or apply `database/postgresql.sql` via `psql` to the selected PostgreSQL database. Use reviewed migrations for an existing deployment rather than replacing tables or pushing unreviewed changes.
3. Set `MMA_ADMIN_USERNAME`, `MMA_ADMIN_NAME` (optional), and `MMA_ADMIN_PASSWORD` (at least 12 characters) privately in your process environment. Run `npm exec tsx -- scripts/setup.ts`. It adds the roles, school settings, four house identities and your administrator. It does not reset an existing account. Remove the setup password from your environment after the command.
4. Run `npm run dev` for local development or run `npm run build` and use the Node production entrypoint through your service manager. Sign in at `/login`. Create an event, enroll houses, and add or import students before opening attendance.

For isolated testing, run the setup command with `--sample` on an otherwise empty test database and set a **different** `MMA_SAMPLE_PASSWORD`. This adds a fictional training event with dates around today's school date. Sample Student ID: `2026-1001`; sample red house adviser: `msantos`. Both use the password you supply. Never seed production. Imported school accounts stay disabled until an administrator sets an initial password and enables the account.

## Architecture and project structure

- [Database architecture and full relationship diagram](database/architecture.md)
- [PostgreSQL schema SQL](database/postgresql.sql) and [MySQL InnoDB schema SQL](database/mma_intramurals.sql)
- `src/app/[area]/[[...parts]]/` — authenticated role route and server authorization; `src/app/api/` — same-origin Fetch endpoints
- `src/app/login`, `src/app/public`, `src/app/preview` — sign-in, publication, and fictional preview routes
- `src/components/` — responsive dashboard, directory, operations, competition, reporting, and common UI
- `src/lib/` — authentication, permissions-aware reads, validation, and transactional module logic
- `src/db/` — `DATABASE_URL` connection and Drizzle tables; `scripts/` — CLI account provisioning and smoke coverage
- `public/images/` — generated sample photography; `xampp/` — independent MySQL handoff files

## Module notes

- [RFID, face verification, and ₱50 attendance sanctions setup](docs/attendance-access.md). RFID uses a staffed USB keyboard-mode reader. Face verification is optional, one-to-one, locally processed and requires in-person approval. Sanctions are recorded only after an administrator reviews and finalizes the date.

- CSV/XLSX import expects a header with **Student ID, First Name, Last Name, Course, Year Level**. Optional fields: Middle Name, Gender, Phone, Email, House. House names must match an enrolled house for the selected event. The `.xlsx` first sheet is used; use text for identifiers that contain leading zeroes. Upload at most 500 rows and 2 MB at a time. Duplicate or invalid records reject the entire batch.
- QR sessions are 1–15 minutes and use the active event and the official school date. Display the QR in person: this mechanism verifies session validity and authentication, not physical location or identity beyond the signed-in account. Never distribute codes publicly. A fresh session replaces the previous open one of the same type. Student QR images can be scanned locally, or a camera can be used on HTTPS or localhost. Administrators can close QR sessions and audit corrections.
- Administrators can upload private student photos from Students, public house logos from Houses, and a report logo in Settings. Open Announcements → Gallery to publish approved event photos. Images are limited to one raster image of up to 2 MB and re-encoded as WebP.
- The attendance report supports up to 31 days per request. Dates with no check-in yet, including an active current day, are shown as **Not recorded** until that day closes or an administrator sets an official status. An event's late cutoff controls late classification, not automatic same-day absence. Adviser reports are scoped to assigned houses. PDF uses `pdf-lib`; records are exported from the authorized view and not posted to another service. A verifier can be entered or left blank for signature.
- Manual fixtures support single elimination, double elimination, and round robin. The round-robin generator builds conflict-checked fixtures. The other formats label manually scheduled rounds; they do not yet advance winners and losers automatically. Set placement points in Scores & Rankings. Match wins are calculated separately from point awards.
- Accounts use scrypt, random session tokens with only their hashes stored, HttpOnly cookies, and role guards on the server. Writes require origin checks and session-derived CSRF protection. Login attempts are throttled by normalized username. For deployment, add reverse-proxy request and per-network rate limiting, configure monitoring and PostgreSQL backups, and commission a privacy and security review before storing actual school data.

## XAMPP / phpMyAdmin handoff (schema and setup only)

1. Use XAMPP with PHP 8+ (`pdo_mysql` enabled) and current MariaDB, or MySQL 8.0.16+ with phpMyAdmin. Start the database and Apache for phpMyAdmin. Place the handoff project at `C:\xampp\htdocs\mma-intramurals` for local development. Do not publish the repository, SQL scripts, or config folders as a web document root.
2. In `http://localhost/phpmyadmin`, open **Import** at the server level. Choose `database/mma_intramurals.sql`, select SQL format, and click **Import**. It creates the `mma_intramurals` database and its normalized InnoDB tables. Import into a fresh database only. The SQL adds roles and starter houses, not users.
3. Provide `MMA_DB_HOST`, `MMA_DB_PORT`, `MMA_DB_NAME`, `MMA_DB_USER`, and `MMA_DB_PASSWORD` as private process variables. `xampp/config/database.php` reads these; use a least-privilege database account. Host, port and database have local defaults; the user and password do not.
4. Set `MMA_SETUP_PASSWORD` privately (12–72 bytes), then from the project directory run `C:\xampp\php\php.exe xampp\scripts\setup-admin.php YOUR_USERNAME "Full Name"`. Remove the setup secret afterwards. The CLI uses prepared PDO statements and `password_hash(PASSWORD_DEFAULT)`; a PHP port must use `password_verify` at sign-in. The account belongs to MySQL only and does not sign in to the PostgreSQL application.
5. The PHP UI, PHP role routes, and Composer integrations (Dompdf and a PHP QR library) are **not included**. XAMPP does not serve the running Next.js app. No PHP or MySQL runtime is required to run the live workspace.

## Development checklist

| Phase | Current implementation | Validation |
|---|---|---|
| 1 — Foundation | Normalized schema and ERD, provisioning, sign-in/out, server role and house scoping, three dashboards | Build and browser/HTTP smoke suite described below |
| 2 — Directories | Accounts, students, advisers, houses, seasons, history-preserving enrollment, CSV/XLSX and export | Directory writes, both import formats, and scoped reads covered by the smoke suite |
| 3 — Attendance | QR / staffed RFID / optional face attendance, deduplication, audited corrections, scoped PDF/CSV, and a ₱50 finalized-absence ledger | QR, simulated USB input and camera including real face inference, adverse matches, duplicates, checkout guards, sanction review and privacy covered; physical hardware and biometric calibration pending |
| 4 — Competition | Sports, rosters, venues, officials, fixtures, conflict checks, round robin generation, scoring, medals and configurable points | Core schedule, conflict and score paths covered; automatic single/double-elimination advancement pending |
| 5 — Public | Published season pages, public schedule, scores, standings, notifications and gallery | Publication privacy, scoped media access, file validation, and mobile navigation covered |
| 6 — Release | Typegen, TypeScript, production build and managed health check | Full external security review, accessibility audit, physical camera testing, and load testing pending. MySQL schema and PHP setup passed on MariaDB 10.11 / PHP 8.2; Windows XAMPP itself was not run |

`/api/health` checks PostgreSQL connectivity and the roles and sanctions tables. From a build, `bash scripts/smoke-local.sh` can provision and clean up a disposable database automatically (PostgreSQL CLI, Python 3, Playwright with Chromium). `scripts/smoke.mjs` exercises an already running app on a disposable database provisioned with `--sample`. Set `MMA_TEST_URL`, `MMA_ADMIN_USERNAME`, `MMA_ADMIN_PASSWORD`, and `MMA_SAMPLE_PASSWORD`; use `npx --yes --package=playwright playwright install chromium` to provision Chromium, and set `MMA_PLAYWRIGHT_PATH` to the local Playwright package entry point when it isn't installed in the repository. The script changes records and must never be run on a live school database.
# mma-intramurals-management-system

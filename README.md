# Smart Roster Management System

## Live application

- **Frontend:** https://smart-roster-management.vercel.app
- **Backend API:** https://smart-roster-management-acwb.onrender.com
- **Backend health check:** https://smart-roster-management-acwb.onrender.com/api/health
- **Source code:** https://github.com/Shivam-206/smart-roster-management

The frontend is deployed on Vercel, the Express API is deployed on Render, and the application uses PostgreSQL hosted on Neon. The backend root URL is an API service and does not serve the frontend; use the frontend link above to access the application.

A web application for maintaining operational staffing data and generating, reviewing, and manually correcting monthly employee rosters.

## Problem and scope

Roster planning must coordinate process coverage, employee skills, pod/brand ownership, weekly offs, leave, holidays, staffing rules, and backup resources. This application stores those inputs in PostgreSQL and produces a saved monthly roster that managers can inspect from several perspectives. It is an operations tool, not a payroll, time-clock, approval, or employee self-service system.

## Features

- Employee, pod, brand, process, and employee-process assignment management.
- Weekly offs, leave/comp-off, public holidays, process operating calendars, and staffing rules.
- Monthly roster generation with saved working and non-working shifts, staffing gaps, and conflicts.
- Company, pod, brand, process, and employee roster views for an existing saved month.
- Manual shift replacement, vacancy filling, removal, replacement suggestions, and roster revalidation.
- Conflict status and history, including active and resolved conflicts.

## Technology

- Frontend: React 18, TypeScript, Vite, TanStack Query, Tailwind CSS.
- Backend: Node.js, Express, TypeScript, Zod.
- Data: PostgreSQL via Prisma ORM; the configured project database is Neon PostgreSQL.
- Tests: Vitest integration tests using the configured PostgreSQL database.

## Architecture and project layout

```text
backend/
  prisma/                 Prisma schema, initial migration, seed fixtures
  src/
    routes/               Express endpoints for master data, availability, and rosters
    rosterEngine.ts       Monthly scheduling/allocation logic
    scheduling.ts         Shared process calendar and staffing logic
    index.ts              Express app, CORS allowlist, health endpoint
  tests/                  API, engine, and database tests
frontend/
  src/api/                Typed API clients
  src/components/         Employee, pod, assignment, availability, and roster UI
  src/                    React application and shared types
```

The browser calls the Express API. Express validates request data, accesses PostgreSQL through Prisma, and returns JSON. `rosterEngine.ts` is the generator; `scheduling.ts` is the shared source of process calendar/staffing behavior. The frontend displays persisted roster results and does not implement a second scheduler.

## Database design

`Employee` belongs optionally to a `Pod`. `Brand` belongs to a pod and contains one or more `Process` records. `EmployeeProcessAssignment` links employees to processes and records `PRIMARY`, `SECONDARY_BACKUP`, or `FLOAT` tier. Availability is represented by `EmployeeWeeklyOff` and `EmployeeLeave`; public holidays are stored independently. `ProcessCoverageRule` stores date- or weekday-specific staffing overrides alongside a process default.

`Roster` is unique per `monthYear`. Its `RosterShift` records working and non-working employee days and optionally link a process. `RosterConflict` stores identified issues and an `isResolved` state. Manual edits are represented by `RosterShift.isManualOverride` and `overrideReason`. The current Prisma schema supports these features without a separate Phase 7 migration.

## Scheduling and roster behavior

For each day in the requested month, the generator:

1. Determines unavailable employee statuses from mandatory public holidays, leave/comp-off records that are not rejected, and weekly offs.
2. Evaluates each process calendar and the effective required staffing value.
3. Forms eligible candidates from each process's employee assignments, excluding inactive/unavailable employees and employees over configured weekly or consecutive-day limits.
4. Allocates slots while avoiding assigning one employee to multiple processes on the same day. Candidate preference is `PRIMARY`, then `SECONDARY_BACKUP`, then `FLOAT`, followed by assignment priority and employee code. Scarcer candidate pools are considered first.
5. Persists shifts and conflicts. Required coverage gaps are recorded; generation does not silently treat an unfilled slot as staffed.

`ALL_365_DAYS`, `ALL_EXCEPT_PUBLIC_HOLIDAYS`, and `ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS` use the shared calendar helper. For `CUSTOM`, available date-override or weekday staffing rules with a positive staffing requirement are the supported operating schedule; the schema has no separate custom open/closed calendar table.

Single-resource brands do not restrict an employee to one brand and do not imply that the backup is automatically working. A backup can be allocated when needed by the generator, or offered as a recommendation during manager-led editing. Multi-resource brands can have several primary resources. Staffing rules and assignments are per process.

After generation, managers can view the saved roster, explicitly replace or remove assignments, fill vacancies, request eligible replacement candidates, and revalidate against current availability and process rules. Revalidation updates conflicts and recommendations; it does not regenerate the month or automatically assign a replacement. A removal may leave a recorded coverage conflict.

## Local setup

Requirements: Node.js compatible with the lockfiles, npm, and access to a PostgreSQL database. The sample configuration is in `backend/.env.example` and `frontend/.env.example`.

1. Create a private `backend/.env` from `backend/.env.example`. Set `DATABASE_URL` to a database you are authorized to use. Do not commit environment files.
2. Install backend dependencies and generate the Prisma client:

   ```powershell
   cd backend
   npm install
   npx prisma generate
   ```

3. For an empty/new database, inspect the pending migrations and apply them:

   ```powershell
   npx prisma migrate deploy
   ```

4. In a separate terminal, install frontend dependencies and run both applications:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

   ```powershell
   cd backend
   npm run dev
   ```

The frontend is served at `http://localhost:3000`; its development proxy forwards `/api` to `http://localhost:5000`. Override the proxy target with `VITE_API_PROXY_TARGET` if necessary.

## Environment variables

Backend:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string; keep private and set through the host's secret manager. |
| `PORT` | Backend listener port; hosting providers commonly set this automatically. |
| `NODE_ENV` | Set to `production` for a deployment. |
| `CORS_ORIGINS` | Comma-separated exact browser origins permitted to call the API. Required in production. |
| `AUTH_COOKIE_SAME_SITE` | `lax` for same-site frontend/backend origins, or `none` for cross-site HTTPS hosting. `none` cookies are always Secure. |
| `BOOTSTRAP_ADMIN_EMAIL` | Initial administrator email, used only by the explicit bootstrap command. |
| `BOOTSTRAP_ADMIN_PASSWORD` | Initial administrator password (at least 12 characters, at most 72 UTF-8 bytes); never commit or log it. |
| `BOOTSTRAP_ADMIN_NAME` | Optional display name for the initial administrator. |
| `ALLOW_DESTRUCTIVE_SEED` | Must be `true` to run the destructive sample seed script; never set for a persistent or production database. |

Frontend:

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Optional local-development API origin. Production builds use relative `/api` paths and the Vercel rewrite; leave this unset/empty in Vercel. |
| `VITE_API_PROXY_TARGET` | Optional Vite development proxy target; defaults to `http://localhost:5000`. |

Only public, non-secret values belong in Vite variables: `VITE_*` values are included in browser assets.

## Authentication and account setup

The API uses bcrypt-hashed passwords and opaque, random server-side sessions. Only a SHA-256 digest of the session cookie is stored in PostgreSQL. The session cookie is HttpOnly, SameSite-configured, and Secure in production; state-changing requests require a per-session CSRF token. Sessions expire after eight hours. Failed login attempts are limited to five per IP per 15-minute window. Login errors do not distinguish unknown, inactive, or incorrect-password accounts.

All `/api/v1` endpoints require an authenticated account except login and the public `/api/health` check. Both `ADMIN` and `MANAGER` roles can use roster and master-data functionality. Only `ADMIN` users can list, create, activate, or deactivate application accounts. The backend enforces roles independently of the frontend controls.

After reviewing the new additive migration and applying it to the intended database, create the first administrator explicitly:

```powershell
cd backend
$env:BOOTSTRAP_ADMIN_EMAIL = "admin@example.com"
$env:BOOTSTRAP_ADMIN_PASSWORD = "<choose-a-unique-password-of-at-least-12-characters>"
$env:BOOTSTRAP_ADMIN_NAME = "System Administrator"
npm run auth:bootstrap-admin
Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL, Env:BOOTSTRAP_ADMIN_PASSWORD, Env:BOOTSTRAP_ADMIN_NAME
```

The bootstrap command is not run at startup. It creates an administrator only if one does not already exist, hashes the password, and leaves all application data intact. Once signed in, administrators can create/manage ADMIN and MANAGER accounts from **User Accounts**.

## Database safety

Use reviewed, versioned Prisma migrations for persistent environments. `npm run prisma:deploy` runs `prisma migrate deploy`; it does not reset the database. The authentication migration adds only `UserRole`, `User`, and `UserSession`; it does not modify existing roster/master data. Review migration SQL and obtain approval before applying it to the configured existing database. `prisma:push` is retained for development workflows and is not the documented production deployment procedure.

**The sample seed script is destructive:** it deletes roster and master/availability records before recreating fixtures. It refuses to run unless `ALLOW_DESTRUCTIVE_SEED=true` is explicitly set. Only run it against a disposable, backed-up development database; never use it against an existing or production database. Do not rerun the seed script against the deployed Neon database.

## Tests and builds

From `backend/`:

```powershell
npm test -- --no-file-parallelism
npm run build
npx prisma validate
```

From `frontend/`:

```powershell
npm run build
```

The integration tests use PostgreSQL data and some database-inventory tests expect the project fixture baseline. Run backend test files serially to avoid cross-file interference. The public-holiday/leave test checks the expected fixtures rather than an exact global row count.

## Deployment

The application can be hosted as a static Vite frontend and a Node.js/Express backend, with PostgreSQL hosted by Neon or another managed PostgreSQL provider. The backend start command is `npm start` after `npm run build`; the frontend deployment command is `npm run build`, with `dist/` as the static output directory.

Deployment is configured as follows:

<<<<<<< HEAD
- **Frontend:** Vercel — https://smart-roster-management.vercel.app
- **Backend:** Render — https://smart-roster-management-acwb.onrender.com
- **Database:** Neon PostgreSQL

The backend is configured with `NODE_ENV=production`, the production database connection, an exact `CORS_ORIGINS` allowlist for the Vercel frontend, and `AUTH_COOKIE_SAME_SITE=none` for cross-site HTTPS cookies. The frontend's `VITE_API_BASE_URL` is set to the Render backend origin at build time. The authentication flow was tested against the deployed frontend and backend: login succeeds and the cross-site session cookie is accepted by subsequent authenticated requests.

For a fresh deployment, apply reviewed Prisma migrations to the intended database before starting the application, configure the environment variables above, bootstrap the first administrator once, and verify login, session restoration, logout, role restrictions, and the main roster workflows. Never commit production secrets or place administrator credentials in this README.
=======
1. Configure the Vercel project Root Directory as `frontend`, with `npm run build` and `dist` as the output directory. The checked-in `frontend/vercel.json` proxies `/api/:path*` to the Render API; leave `VITE_API_BASE_URL` unset or empty in Vercel.
2. Set backend `DATABASE_URL`, `NODE_ENV=production`, `PORT` as required by Render, and `CORS_ORIGINS` to include the exact frontend origin(s), including `https://smart-roster-management.vercel.app`.
3. Build and publish `frontend/dist`. Browser API calls use the Vercel origin; Vercel forwards them to Render, so the browser stores and sends the HttpOnly session cookie as a first-party cookie. Keep frontend requests credentialed.
4. Review the migration SQL and run `npm run prisma:deploy` against the intended database from a trusted deployment job.
5. Confirm the backend `/api/health` endpoint responds, the Vercel `/api/health` rewrite works, login sets a cookie for the Vercel origin, authenticated API requests include it, CORS allows only configured frontend origins, and backups/monitoring are enabled.

**Security deployment gate:** before public use, verify the deployed database schema and administrator setup, HTTPS, CORS origin allowlist, and the full login-to-authenticated-request cookie flow through the Vercel rewrite. No deployment change or successful production verification is performed by this repository update.
>>>>>>> b4c09e3 (Fix production authentication with same-origin API proxy)

## Known limitations and future work

- User action audit attribution is not implemented. The in-memory login limiter is per application process; multi-instance deployments need a shared rate-limit store.
- The database integration tests use an existing seeded fixture baseline for several master-data invariants; run them against a dedicated test database, not production.
- `CUSTOM` process calendars are limited to the weekday/date staffing rules the current schema can express.
- Staffing in roster views reflects current process rules; those rules are not snapshotted with each roster.
- Dedicated isolated test-database provisioning, richer audit history, and deployment-specific monitoring are possible follow-up work.
- The current `npm audit` reports a high-severity Prisma CLI/config dependency advisory and moderate/critical advisories in Vitest/Tinypool. These affect database/test tooling rather than the application request runtime, but should be cleared with compatible upgrades before treating the toolchain audit as clean. The Zod validation advisory was addressed by upgrading to the patched release.

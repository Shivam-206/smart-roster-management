# Technical Approach

## Architecture

The system is a React/TypeScript single-page application backed by an Express/TypeScript JSON API. The frontend API clients keep requests and response types in one area; React Query handles screen data/loading/error lifecycle. Express routes validate incoming values with Zod, apply domain checks, and use Prisma for PostgreSQL access. The scheduling engine is a backend module and is not duplicated in the UI.

The Prisma schema is the source of truth for operational relationships. `Pod` groups employees and brands; a brand contains processes; employee-to-process qualification is represented as a many-to-many relation with assignment metadata. Availability, holidays, staffing rules, saved shifts, and conflicts have separate records so that roster results can be interpreted without embedding the business rules into React.

## Data-model choices

- `EmployeeProcessAssignment` allows one employee to support several processes and a process to have multiple employees. A compound unique constraint prevents the same employee/process pair from being duplicated.
- Assignment tier and priority are stored on the association, not the employee. A backup tier communicates eligibility, not an actual scheduled shift.
- Weekly offs, leave/comp-off, holidays, and process staffing/calendar rules are represented separately because their scopes and date behavior differ.
- `Roster` identifies one persisted month. `RosterShift` stores per-employee/day status, process assignment, and manual-override metadata. `RosterConflict.isResolved` retains a resolvable issue's history rather than deleting it.
- The existing schema supports all current workflows; Phase 8 required no schema change.

## Generation and allocation order

`generateMonthlyRoster` works by date. It first filters inactive employees and marks non-working availability statuses. Leave records not marked rejected are treated as unavailable by the existing engine. It evaluates process operation and minimum staffing through `getProcessScheduleForDate`, using date-specific coverage rules before weekday rules and defaults.

For each operating process it builds candidate employee assignments, filtering employees who are unavailable, inactive, at their weekly work-day cap, or at their consecutive-day cap. Candidates are ordered by `PRIMARY`, `SECONDARY_BACKUP`, `FLOAT`, configured priority, and employee code. The engine considers processes with fewer candidates first and uses a matching pass to allocate staffing slots while assigning each employee at most once per date. It records under-coverage and relevant scheduling conflicts rather than asserting that requested staffing was met.

Weekly and consecutive-day limits account for saved prior work dates passed to the generator around the start of the month. These constraints and the availability rules apply to generated assignments; roster views read saved shifts.

## Calendar and availability

The shared `scheduling.ts` helper handles the three fixed calendar types and the supported `CUSTOM` interpretation. Staffing resolution prefers a date override, then a weekday rule, then the process default. In the current schema, a custom process operates on a date only when the matching date/weekday rule provides a positive staffing requirement. There is no separate per-day open/closed calendar model.

For an employee, a mandatory public holiday, a leave/comp-off record not rejected, or a matching weekly-off record makes the employee unavailable for the date. Generated non-working statuses are saved alongside working shifts. The manager can revalidate a saved roster after availability or process rules change.

## Single-resource and multi-resource brands

The `Brand.isSingleResource` flag is used to report single-point-of-failure conditions; it does not impose a one-employee-per-brand restriction. Primary and backup are process assignment tiers. The generator can allocate an eligible backup if needed to cover a process slot, but the existence of a backup assignment alone does not mark that person as working. A multi-resource brand may have multiple primary resources assigned across its processes.

## Double-booking prevention

Generation resolves all process slots for a day together and limits a candidate employee to one selected slot. Manual editing checks that the employee is not already working on another process for the roster date, and validates active state, process assignment, availability, process operation, and coverage. Changes are committed in Prisma transactions. Revalidation also detects employees represented by multiple working shifts on one day.

## Conflicts, revalidation, and human control

Generation persists staffing shortages and other warnings/errors with a date, category, process/employee references, message, and optional details. Revalidation evaluates saved working shifts against current assignments, employee status, availability, calendars, and staffing rules. It updates the conflict set while preserving resolved conflict records, reports remaining shortages, and returns eligible replacement recommendations ordered by assignment tier/priority. It does not silently replace employees or regenerate a roster.

Managers explicitly choose replacement, vacancy fill, or removal. Valid edits mark override metadata and update/revalidate conflicts; a removal that leaves a staffing gap can be retained with a coverage conflict. Thus automation identifies and constrains changes while staffing decisions remain under manager control.

## Security and operational limitations

Authentication uses bcrypt-hashed credentials and opaque random session tokens. The browser receives the token only in an HttpOnly cookie; PostgreSQL stores its SHA-256 digest in `UserSession` with a fixed expiration. A session-bound CSRF token is required for state-changing requests. Auth routes expose login, current-user, CSRF-token, logout, and administrator-only user management. A process-local login rate limiter allows five attempts per IP in fifteen minutes.

`ADMIN` and `MANAGER` users may use application features; administrator-only middleware guards account management. All `/api/v1` paths are protected by a central authentication boundary except the explicit auth routes, which protect their own sensitive routes; health is outside that prefix. CORS is an origin policy, not authentication. Audit attribution to individual users is not implemented. Multi-instance hosting needs a shared rate-limit store so attempts cannot evade limits by moving between instances.

Tests share a PostgreSQL fixture baseline and should run serially against a dedicated test database. The additive authentication migration must be manually reviewed and applied before database-backed auth or legacy API integration tests can run against the existing database. `CUSTOM` calendars cannot express independent open/closed days beyond staffing rules, and roster results do not snapshot the process rules used for their generation. Monitoring and database backups must be configured by the deployment owner.

## Future improvements (outside current scope)

Add user-attributed edit history; provision an isolated test database and fixture lifecycle; snapshot generation inputs for historical reproducibility; and add a shared rate-limit store and monitoring/backup automation appropriate to the chosen host.

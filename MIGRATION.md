# Qlicker Migration Guide

## Migration Goal
Migrate Qlicker from Meteor to React + Express while preserving strict compatibility with the existing MongoDB schema and delivering full student/professor/admin parity before pilot cutover.

## Current Status (Audited)

### Verified gaps from audit
- Legacy parity checklist was overstated in prior docs.
- Critical authorization gaps existed in the new stack (outsider read/write paths).
- Student session flow was incomplete (readonly question rendering, missing session reactivity).
- Reporting/export parity is still incomplete (CSV and parity tables).
- Realtime auth/session bridge and delete-event handling required fixes.
- Collection index bootstrap existed but was not started on boot.

### Implemented in this cycle
- Added centralized access controls in `packages/server/src/auth/middleware.ts`:
  - `requireCourseMember`
  - `requireCourseInstructorOrAdmin`
  - `requireSessionMemberAccess`
  - `requireQuestionAccess`
- Enforced authorization for previously exposed routes:
  - `GET /api/courses/:courseId`
  - `GET /api/sessions/:sessionId`
  - `GET /api/questions/:questionId`
  - list scoping for `GET /api/sessions` and `GET /api/questions`
  - write access checks for `PUT/DELETE /api/questions/:questionId`
  - membership checks for response read/write routes
  - scoped grade reads for student/professor/admin
- Added session creation parity default:
  - `POST /api/sessions` now defaults `status` to `hidden` when omitted.
- Realtime hardening:
  - wired Express session + Passport into Socket.IO handshake in `packages/server/src/index.ts`
  - added subscription authz checks in `realtime-manager`
  - fixed wildcard duplicate publish behavior
  - improved delete propagation behavior for collection subscriptions
- Startup hardening:
  - call `initAllCollections()` at server boot to ensure indexes.
- Client session improvements:
  - session page now subscribes to realtime session changes
  - student responses can be submitted from `Session.tsx`
  - quiz submit action added in session view
- Smoke suite expanded:
  - added authorization regression checks to `scripts/migration-smoke.mjs`.

## Parallel Lane Plan (8 lanes)

| Lane | Mission | Status | Notes |
|---|---|---|---|
| L1 | AuthZ hardening + API policy | In progress | Core guards + route enforcement landed; continue endpoint parity closure. |
| L2 | Student/prof session-question parity | In progress | Session answering/reactivity improved; manage-session parity still open. |
| L3 | Course management + groups parity | Not started | TA/student-by-email, group CRUD assignment, groups CSV still open. |
| L4 | Grades/results/export parity | Not started | Session/course CSV exports + parity table behaviors still open. |
| L5 | Realtime correctness + scale | In progress | Socket auth bridge + subscription auth landed; continue resilience/load instrumentation. |
| L6 | Media + video/chat parity | Not started | Validate profile image lifecycle and finish Jitsi parity edges. |
| L7 | DB compatibility + parity fixtures | In progress | Seeded fixture path active; backup-based parity track still open. |
| L8 | Integration/load/cutover ops | In progress | Smoke enhanced; full parity/load/cutover runbooks still open. |

## Pilot Definition of Done
- Full legacy parity for student/prof/admin workflows.
- No schema-breaking writes to existing Meteor collections.
- Blocking security checks pass (no cross-course data leaks).
- Realtime stability and latency gates pass under pilot load.
- CSV/reporting parity complete for required exports.

## Execution Model
- One lane branch per lane (`migration/lane-01-*` through `migration/lane-08-*`).
- Continuous merges behind feature flags/tests when lane checks pass.
- One rolling migration summary PR/document stream maintained throughout execution.

## Required checks before merge
- `npm run build --prefix packages/shared`
- `npm run build --workspace=packages/server`
- `npm run build --workspace=packages/client`
- `./seed-mock-db.sh`
- `QCLICKER_BASE_URL=<server-url> node scripts/migration-smoke.mjs`

## Supporting docs
- `docs/migration/parity-matrix.md`
- `docs/migration/api-parity-map.md`
- `docs/migration/security-audit.md`
- `docs/migration/realtime-design.md`
- `docs/migration/cutover-runbook.md`
- `agent-plans/lane-01-authz.md` ... `agent-plans/lane-08-cutover.md`

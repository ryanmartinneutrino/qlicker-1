# Qlicker Meteor-to-React/Express Migration Status

## Snapshot (2026-02-25)
- Baseline branch: `master`
- Baseline commit: `656443e4`
- Recent merged PRs in this tranche: `#57`, `#58`, `#59`, `#60`, `#61`, `#62`, `#63`, `#64`, `#66`, `#67`, `#68`, `#70`, `#71`, `#72`
- Pilot gate remains: **full legacy parity + security + realtime/load verification**

## Verified Review Results

### Closed in current codebase
- Confidential backup safeguard confirmed:
  - `legacydb/` is ignored in `.gitignore` and excluded from migration commits.
- Route-level authz hardening is substantially improved for `courses/sessions/questions/responses/grades` (outsider cross-course read/write paths now blocked in core routes).
- Instructor-only management surfaces now enforce per-course manager authorization:
  - `sessions` instructor mutations (create/update/delete/status/current/reorder/copy/extension-candidates)
  - `grades` instructor mutations/exports (calc/update/visibility/session export)
  - `courses` instructor mutations (course manage, roster/student removal, groups/category CRUD, instructor video-chat management)
- Authz regression harness expanded for outsider-professor denial checks on course/session/grade management routes.
- Socket session/passport bridge is wired so realtime channels can use authenticated user context.
- Realtime routing now handles change-stream delete events via `documentKey` and uses scoped routing keys.
- Realtime delete routing now includes a bounded parent-hint cache (`sessionId/courseId/questionId`) to keep delete fan-out scoped when `fullDocument` is unavailable.
- Realtime churn/reconnect harness landed:
  - `npm run test:migration-realtime-churn`
  - optional gate inclusion via `QCLICKER_GATE_INCLUDE_REALTIME_CHURN=true`
- Collection index bootstrap is now called at server startup.
- Session create parity gap fixed: server defaults `status` to `hidden` when omitted.
- CSV parity improved with server-backed exports:
  - `GET /api/grades/course/:courseId/export`
  - `GET /api/grades/session/:sessionId/export`
  - `GET /api/responses/session/:sessionId/export`
  - `GET /api/courses/:courseId/groups/export`
  - client pages now prefer server CSV with local fallback
- Question-library parity/authz fix landed:
  - normalized detached-question filtering (`sessionId` missing/null)
  - avoid writing `undefined` fields on question create/copy paths
- Course roster management parity expanded:
  - add student to course by email (`POST /api/courses/:courseId/students`)
  - add instructor/TA by email (`POST /api/courses/:courseId/instructors`)
  - remove instructor/TA (`DELETE /api/courses/:courseId/instructors/:instructorId`) with owner/self safeguards
  - instructor course page now exposes by-email add/remove workflows in roster UI
- Image API authz hardened:
  - non-admin image list is owner-scoped
  - image delete requires owner or admin
- Session-store collision fix landed:
  - auth middleware sessions now use Mongo collection `authSessions`
  - session APIs now ignore non-course docs lacking valid `courseId`
  - DB compat harness now reports explicit `sessions._collection` collision errors
- Realtime subscription resilience/security hardened:
  - standardized `subscription:error` contract across `subscribe:*` handlers
  - auto re-subscribe + refetch on socket reconnect in `useRealtimeCollection`
  - added realtime authz regression harness `npm run test:migration-realtime-authz`
- Authz integration harness expanded for roster parity:
  - outsider-professor denied for student/instructor roster mutations
  - add student by email -> promote to instructor by email -> remove instructor flow verified
  - owner/self instructor-removal safeguards verified
- Video/chat parity validation expanded in smoke coverage:
  - course-level connection + join/leave flow
  - category/group room resolution checks
  - group help-toggle and instructor clear/reset semantics
- DB-readiness tooling milestone landed:
  - `npm run test:migration-db-compat` (read-only compatibility audit)
  - `npm run test:migration-db-parity` (baseline-vs-candidate DB diff harness)
  - `npm run test:migration-legacy-backup` orchestration for restore + compat + parity on local Meteor dump
  - executed against `legacydb/backup_2023-09-14_05-03-01` with passing compat/parity reports
  - `docs/migration/db-compat-testing.md` workflow for sanitized Meteor backup testing
- Integration gate orchestration milestone landed:
  - `npm run test:migration-gate` to run build/runtime checks
  - optional DB stages via `QCLICKER_GATE_INCLUDE_DB_COMPAT=true` and `QCLICKER_GATE_INCLUDE_DB_PARITY=true`
  - optional legacy backup stage via `QCLICKER_GATE_INCLUDE_LEGACY_BACKUP=true`
- Load/perf gate stabilization milestone landed:
  - authenticated requests are rate-limited by user id (fallback to IP) to avoid shared-IP saturation
  - migration load harness now uses paced defaults and reports per-status error breakdown
  - runtime gate (`smoke/authz/realtime-authz/load`) passes on latest `master`
- Evidence artifact automation milestone landed:
  - `test:migration-gate` writes JSON summary when `QCLICKER_GATE_OUTPUT` is set
  - `test:migration-legacy-backup` writes JSON summary + compat/parity report paths
  - docs/runbook now define artifact archival workflow for CI/staging pilot evidence
- Runtime artifact CI workflow landed:
  - `.github/workflows/migration-runtime-gate-artifacts.yml` runs runtime gate on a replica-set Mongo service and uploads artifacts (`migration-gate-runtime.json`, server logs)
- Reviewability parity milestone landed:
  - `PUT /api/sessions/:sessionId/reviewable` now supports Meteor-equivalent review toggle semantics
  - enabling review recalculates session grades; disabling review hides grades from students
  - instructor course UI now exposes `Allow Review`/`Disable Review` for done sessions
  - student done-session behavior now matches reviewability gates (`Review` route and messaging)
  - coverage added in `migration-smoke` and `migration-authz-integration`
- CSRF correctness milestone landed:
  - `/api/csrf-token` now issues tokens successfully with CSRF enabled
  - server now wires cookie parsing middleware for CSRF token/cookie validation path
- Migration harness robustness milestone landed:
  - all migration `ApiSession` harnesses now keep a cookie jar (session + CSRF cookie), eliminating intermittent CSRF-related 403s during runtime checks
  - CSRF-enabled runs now pass for smoke/authz/realtime-authz paths

### Still open (blocking for pilot)
- Full Meteor parity validation is incomplete for:
  - instructor run-session edge workflows
  - grading edge cases beyond current reviewability closure
  - full groups/video/Jitsi behavior parity
- End-to-end parity verification is incomplete:
  - no latest full Docker smoke/integration/e2e run evidence on current `master`
  - backup parity is validated locally; CI/staging still needs to publish and retain the new JSON evidence artifacts per gate run

## 8-Lane Progress Matrix

| Lane | Scope | Status | Evidence | Next gate |
|---|---|---|---|---|
| L1 | AuthZ + API policy | 96% | PR `#42`, `#46`, `#54`, `#55`, `#58`, `#59`, `#67`; authz integration checks green with CSRF enabled | Close residual endpoint edge-case matrix and rerun full authz suite in Docker/CI |
| L2 | Student/prof session-question parity | 74% | PR `#40`, `#43`, `#66` | Finish instructor run-session edge transitions + verify full Meteor checklist |
| L3 | Course/groups parity | 72% | PR `#39`, PR `#44` (groups CSV), PR `#63` (roster by-email + TA add/remove parity) | Finalize remaining group/category edge semantics and parity tests |
| L4 | Grades/results/export parity | 84% | PR `#36`, `#44`, `#53`, `#66` (reviewable-grade visibility sync) | Complete remaining grading edge semantics + CSV value-order parity checks against Meteor outputs |
| L5 | Realtime correctness + scale | 88% | PR `#37`, `#42`, `#47`, `#72`; parent-hint delete routing cache + churn harness landed | Publish recurring churn/load evidence in CI/staging and confirm no unauthorized channels |
| L6 | Media + video/chat parity | 45% | core server/client endpoints + PR `#64` smoke validation for join/leave/help/clear behavior | Finish remaining Jitsi/group room edge behavior and cleanup parity |
| L7 | DB compatibility + parity fixtures | 84% | PR `#49`, `#55`, `#57`, `#71`; real backup restore/compat/parity run passes locally with summary artifacts | Add CI/staging artifact archival + backup-dataset parity checklist sign-off |
| L8 | Integration/load/cutover ops | 95% | PR `#50`, `#57`, `#60`, `#68`, `#70`, `#71`, `#74`; runtime gate + churn pass with machine-readable summaries and CI artifact workflow | Add backup-dataset artifact publishing in staging/CI and close final pilot checklist |

## Parallel Execution Plan (Decision-Complete)

### Phase 1: Security + Realtime lock (immediate)
- L1 closes remaining authz matrix and updates `docs/migration/security-audit.md` with latest evidence.
- L5 runs churn/reconnect/load path checks and publishes thresholds/results.

### Phase 2: Feature parity closure (parallel)
- L2/L3/L4/L6 each close their lane parity matrix and attach evidence references.
- All feature deltas merged behind safe defaults/flags where needed.

### Phase 3: Compatibility + pilot gate
- L7 runs synthetic fixture diff in CI, then backup-based parity on sanitized Meteor data.
- L8 executes full smoke/integration/e2e/load suites and applies go/no-go gate checklist.

## Merge Model
- Continue one lane branch per lane (`migration/lane-01-*` … `migration/lane-08-*`).
- Merge lane PRs continuously when build + lane tests + relevant parity checks pass.
- Maintain one unmerged rolling summary PR for operator review before each pilot-gate decision.

## Completion Estimate
- Current migration completion: **~94%** toward pilot-readiness.
- Remaining critical path: L6 parity closure + CI/staging archival evidence + final pilot checklist sign-off.

## References
- Detailed matrix/backlog/evidence: `MIGRATION_DETAILS.md`
- Latest tranche summary: `docs/migration-work-summary-2026-02-25.md`
- Latest batch summary: `docs/migration-work-summary-2026-02-25-batch2.md`
- Latest batch summary: `docs/migration-work-summary-2026-02-25-batch3.md`
- Latest batch summary: `docs/migration-work-summary-2026-02-25-batch4.md`
- Latest batch summary: `docs/migration-work-summary-2026-02-25-batch5.md`
- Latest batch summary: `docs/migration-work-summary-2026-02-25-batch6.md`
- Latest batch summary: `docs/migration-work-summary-2026-02-25-batch7.md`
- Latest batch summary: `docs/migration-work-summary-2026-02-25-batch8.md`
- Latest batch summary: `docs/migration-work-summary-2026-02-25-batch9.md`
- Parity matrix: `docs/migration/parity-matrix.md`
- API mapping: `docs/migration/api-parity-map.md`
- Security audit checklist: `docs/migration/security-audit.md`
- Realtime design notes: `docs/migration/realtime-design.md`
- DB compatibility testing guide: `docs/migration/db-compat-testing.md`
- Cutover runbook: `docs/migration/cutover-runbook.md`

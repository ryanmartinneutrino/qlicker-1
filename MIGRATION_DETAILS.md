# Qlicker Migration Details

## Snapshot
- Date: `2026-02-25`
- Branch baseline: `master`
- Last verified baseline commit before this update: `06236420`
- Environment assumptions:
  - MongoDB replica set is available (`rs0`) for change streams.
  - Docker compose environment remains canonical for parity checks.
  - Existing Meteor database is source of truth; migrated stack must remain compatible.
  - Parallel lane worktrees are created via `./launch-migration-agents.sh` under `.agent-worktrees/`.

## Meteor-to-New Parity Matrix

| Meteor artifact | New artifact | Collections/fields touched | Status (done/partial/missing) | Gap | Owner lane | PR |
|---|---|---|---|---|---|---|
| `imports/api/users*`, `Accounts.*` | `packages/server/src/routes/auth.ts`, `packages/server/src/routes/users.ts`, `packages/client/src/pages/Login.tsx` | `users`, `settings`, `services.password.bcrypt`, verification/reset token fields | partial | Broad parity present, edge-case parity coverage still incomplete | Agent-01, Agent-08 | `#42` (indirect) |
| `imports/api/courses.js` methods | `packages/server/src/routes/courses.ts`, `packages/client/src/pages/Course.tsx` | `courses`, `users.profile.courses`, `groupCategories`, `videoChatOptions` | partial | Group management APIs are broader; final behavior/test parity still pending | Agent-01, Agent-06 | `#39`, `#42`, `#44` |
| `imports/api/sessions.js` methods | `packages/server/src/routes/sessions.ts`, session pages in client | `sessions`, `courses.sessions` | partial | Session question attach/remove/reorder/delete cleanup landed; runtime parity + smoke/e2e still pending | Agent-02, Agent-03 | `#40`, `#43` |
| `imports/api/questions.js` methods | `packages/server/src/routes/questions.ts`, `QuestionsLibrary` + `CreateQuestionModal` | `questions`, `sessionOptions`, type/options fields | partial | Library/public/unapproved views + copy workflow landed; final parity tests still pending | Agent-01, Agent-05 | `#41`, `#42` |
| `imports/api/responses.js` methods/publications | `packages/server/src/routes/responses.ts`, realtime subscriptions, `SessionResults` | `responses`, `questions.sessionOptions.stats`, response privacy fields | partial | Response privacy/realtime hardening landed; reconnect/load parity evidence still pending | Agent-01, Agent-07, Agent-08 | `#37`, `#42`, `#44`, `#47` |
| `imports/api/grades.js` methods/publications | `packages/server/src/routes/grades.ts`, grade pages | `grades.marks`, visibility fields | partial | Aggregate and CSV export surfaces improved; remaining review/visibility edge parity pending | Agent-01, Agent-04 | `#36`, `#44` |
| Meteor publications (`withTracker`) | `useRealtimeCollection`, Socket.IO + shared change streams | `courses`, `sessions`, `questions`, `responses`, `grades` | partial | Channel auth/routing/reconnect hardening landed; runtime churn/load validation still pending | Agent-07 | `#37`, `#42`, `#47` |
| Meteor question type semantics (`MC=0, TF=1, SA=2, MS=3, NU=4`) | shared configs/types + client/server usage | `questions.type`, option handling | partial | Some flows still need final normalization checks | Agent-01, Agent-05 | `#41`, `#43` |
| Legacy image storage and profile image flow | `/api/images`, image storage adapters, profile page | `images`, `users.profile.profileImage`, settings storage fields | partial | Ownership authz hardening landed; end-to-end parity + failure-mode tests pending | Agent-05, Agent-08 | `#46` |
| Legacy video/group workflows | `/api/courses/*video*`, `ManageCourseGroups` | `courses.groupCategories`, `courses.videoChatOptions` | partial | Behavior parity and test coverage incomplete | Agent-06, Agent-08 | `#39`, `#44` |

## Task Backlog

| Task ID | Description | Owner lane | Dependencies | Acceptance | Status |
|---|---|---|---|---|---|
| MIG-001 | Create `MIGRATION_DETAILS.md` with parity matrix/backlog/protocol/logs | Coordinator | none | File exists and is decision-complete | done |
| MIG-002 | Reduce `MIGRATION.md` to high-level status only | Coordinator | MIG-001 | High-level view + link to details file | done |
| MIG-003 | Replace old 5-agent launcher/packets with 8-lane topology | Coordinator | MIG-001 | `launch-migration-agents.sh` + `agent-plans/*` aligned | done |
| MIG-004 | Ownership policy for migration docs to avoid merge churn | Coordinator | MIG-001 | Policy documented in this file and agent packets | done |
| MIG-010 | Normalize question type semantics across shared/client/server | Agent-01 | MIG-001 | Legacy enum behavior restored for critical flows | in-progress |
| MIG-011 | Standardize `QuestionOption` handling for legacy/new docs | Agent-01 | MIG-010 | No runtime/TS shape mismatch for option fields | in-progress |
| MIG-012 | Harden `/api/questions` authz for read/write parity | Agent-01 | MIG-010 | Role + course membership enforced | in-progress |
| MIG-013 | Tighten authz parity for sessions/grades/responses/courses edge cases | Agent-01 | MIG-012 | Unauthorized cross-course access blocked | in-progress |
| MIG-014 | Ensure required Mongo indexes are initialized safely at boot | Agent-01 | MIG-001 | Index bootstrap runs without destructive migrations | done |
| MIG-020 | Student session parity (attempts, submission, visibility/correct/stats) | Agent-02 | MIG-010..012 | Student flow matches Meteor behavior | in-progress |
| MIG-021 | Instructor run-session parity (controls/live state/quiz behavior) | Agent-03 | MIG-010..012 | Instructor workflow parity achieved | in-progress |
| MIG-022 | Grading parity (manual overrides, visibility, review) | Agent-04 | MIG-010..013 | Grading behavior aligns with legacy | in-progress |
| MIG-023 | Question library/editor parity (type-specific UX + solutions) | Agent-05 | MIG-010..011 | Editor flow parity verified | in-progress |
| MIG-024 | Group/video parity for course categories and rooms | Agent-06 | MIG-010..013 | Group/video behavior mirrors legacy | in-progress |
| MIG-030 | Realtime wildcard fan-out dedup and deterministic event routing | Agent-07 | MIG-010..014 | One logical update per DB change per channel | in-progress |
| MIG-031 | Subscription authorization parity on socket channels | Agent-07 | MIG-012..013 | Cross-course unauthorized subscriptions blocked | in-progress |
| MIG-032 | Hot-path query/payload optimization | Agent-07 | MIG-014 | p95 latency and payload size targets documented | in-progress |
| MIG-033 | Load-test and document high-concurrency behavior | Agent-07 | MIG-030..032 | Results recorded in verification log | in-progress |
| MIG-040 | Expand migration smoke suite for critical parity paths | Agent-08 | MIG-020..024 | Smoke suite covers core lifecycle for all roles | in-progress |
| MIG-041 | Add server integration tests for authz + grading/response semantics | Agent-08 | MIG-012..014 | Integration suite green in CI/local docker | in-progress |
| MIG-042 | Add client e2e parity tests for student/prof/admin | Agent-08 | MIG-020..024 | E2E suite verifies top workflows | pending |
| MIG-043 | Execute manual parity checklist vs Meteor behaviors | Agent-08 | MIG-040..042 | Signed checklist attached | in-progress |
| MIG-044 | Final cutover checklist + rollback runbook | Agent-08 | MIG-043 | Decision-ready cutover/runback docs | in-progress |

## Agent Packets

### Ownership policy (applies to all agents)
- `MIGRATION.md` is coordinator-owned only.
- Agents update only their subsection in `MIGRATION_DETAILS.md` (`Task Backlog` status + `Verification Log` entries for their lane).
- Each agent PR must include completed `MIG-*` IDs in description.

### Agent-01 Contracts/Auth
- Branch: `migration/agent-01-contracts-auth`
- Scope: `MIG-010..014`
- Primary files:
  - `packages/shared/src/*`
  - `packages/server/src/routes/questions.ts`
  - `packages/server/src/routes/{sessions,responses,grades,courses}.ts` (auth edge cases)
  - `packages/server/src/collections/*`, `packages/server/src/index.ts`
- Must not edit: student/instructor feature UX pages (`packages/client/src/pages/Session.tsx`, `RunSession.tsx`, `GradeSession.tsx`) except required compile fixes from shared contract changes.

### Agent-02 Student Session
- Branch: `migration/agent-02-student-session`
- Scope: `MIG-020`
- Primary files: `packages/client/src/pages/{Session,ReplaySession,SessionResults}.tsx`, related components/hooks.
- Must not edit: server auth middleware/contracts.

### Agent-03 Instructor Run
- Branch: `migration/agent-03-instructor-run`
- Scope: `MIG-021`
- Primary files: `packages/client/src/pages/{RunSession,ManageSession}.tsx`, related instructor controls.
- Must not edit: shared enum/type contracts.

### Agent-04 Grading
- Branch: `migration/agent-04-grading`
- Scope: `MIG-022`
- Primary files: `packages/client/src/pages/{GradeSession,CourseGrades}.tsx`, grading components, grade route tests.
- Must not edit: question editor files.

### Agent-05 Question Editor
- Branch: `migration/agent-05-question-editor`
- Scope: `MIG-023`
- Primary files: `packages/client/src/pages/QuestionsLibrary.tsx`, `components/modals/CreateQuestionModal.tsx`, editor/renderer components.
- Must not edit: grading pages.

### Agent-06 Groups/Video
- Branch: `migration/agent-06-groups-video`
- Scope: `MIG-024`
- Primary files: `packages/client/src/pages/ManageCourseGroups.tsx`, `components/VideoChat.tsx`, `packages/server/src/routes/courses.ts` (video/group endpoints).
- Must not edit: session/grade core pages.

### Agent-07 Realtime/Perf
- Branch: `migration/agent-07-realtime-perf`
- Scope: `MIG-030..033`
- Primary files: `packages/server/src/realtime/*`, `packages/client/src/hooks/useRealtimeCollection.ts`, performance utilities/scripts.
- Must not edit: feature UX files unless required for telemetry/perf instrumentation.

### Agent-08 QA/Parity
- Branch: `migration/agent-08-qa-parity`
- Scope: `MIG-040..044`
- Primary files: `scripts/migration-smoke.mjs`, integration/e2e test directories, checklists/runbooks in docs.
- Must not edit: production route logic (except minimal test hooks approved by coordinator).

## Merge Order
1. Merge `Agent-01` first.
2. Merge `Agent-05` second (depends on contract normalization).
3. Merge `Agent-02`, `Agent-03`, `Agent-04`, `Agent-06` in any order, rebasing after each merge.
4. Merge `Agent-07` after feature lanes stabilize.
5. Merge `Agent-08` last with final verification suites/checklists.

Rebase protocol:
- Every PR rebases on latest `origin/master` before final CI run.
- Every PR body includes:
  - completed task IDs,
  - Meteor behaviors matched,
  - exact verification commands and results,
  - changed files summary.

## Verification Log

| Date | Commit | Lane | Command | Result | Notes |
|---|---|---|---|---|---|
| 2026-02-24 | `a096e40` | baseline | `docker compose build && docker compose up -d && ./seed-mock-db.sh && npm run test:migration-smoke` | pass (reported) | Baseline parity smoke reported passing before this planning update. |
| 2026-02-24 | `working-tree` | Coordinator | `./launch-migration-agents.sh` | pass | Created 8 lane branches and worktrees under `.agent-worktrees` for parallel execution. |
| 2026-02-24 | `working-tree` | Agent-02/03/06 | `npm run build --workspace=packages/server && npm run build --workspace=packages/client && npm run build --workspace=packages/shared` | pass | Includes active-batch updates for student session, run-session controls, and persisted group management APIs/UI. |
| 2026-02-24 | `working-tree` | Coordinator | `git -C .agent-worktrees/agent-01-contracts-auth merge --ff-only origin/master` (and same for agent-02..08) | pass | Rebased all 8 lane worktrees to merged `master` baseline (`76d381b`) for next parallel tranche. |
| 2026-02-24 | `working-tree` | Agent-01/07/08 | `npm run build --workspace=packages/shared && npm run build --workspace=packages/server && npm run build --workspace=packages/client` | pass | Includes `/api/questions` visibility hardening, realtime subscribe/unsubscribe dedup semantics, and smoke coverage expansion. |
| 2026-02-24 | `pending` | Agent-01 | `npm run build --workspace=packages/shared && npm run build --workspace=packages/server && npm run build --workspace=packages/client` | pending | To be recorded after Phase 1 patch merge. |
| 2026-02-24 | `pending` | Agent-01/07/08 | `npm run build --workspace=packages/shared && npm run build --workspace=packages/server && npm run build --workspace=packages/client` | pass | Includes route auth hardening, enum usage cleanup, realtime route-key dedup, and index additions. |
| 2026-02-24 | `pending` | Agent-08 | `QCLICKER_BASE_URL=http://localhost:3101 npm run test:migration-smoke` | pass | Verified against isolated server with `DISABLE_CSRF=true` for local smoke execution. |
| 2026-02-24 | `pending` | Agent-08 | `npm run test:migration-smoke` | pending | Expanded smoke must pass before cutover gate. |
| 2026-02-24 | `working-tree` | Agent-01/04/05/07 | `npm run build --workspace=packages/shared && npm run build --workspace=packages/server && npm run build --workspace=packages/client` | pass | Includes question route/library parity tranche, grading group+bulk controls, and question realtime invalidation hardening. |
| 2026-02-24 | `working-tree` | Agent-08 | `docker compose up -d` | blocked | Docker daemon socket permission denied in this execution environment, so smoke/e2e were not re-run in this tranche. |
| 2026-02-24 | `working-tree` | Agent-03/08 | `npm run build --workspace=packages/server && npm run build --workspace=packages/client && node --check scripts/migration-smoke.mjs` | pass | Includes session question copy/remove/reorder API + `ManageSession` UI parity and smoke script coverage updates. |
| 2026-02-24 | `working-tree` | Agent-01/03/08 | `npm run build --workspace=packages/server && node --check scripts/migration-smoke.mjs` | pass | Adds session deletion cleanup parity path and smoke assertions for session cleanup semantics. |
| 2026-02-24 | `working-tree` | Agent-07 | `npm run build --workspace=packages/server && npm run build --workspace=packages/client` | pass | Fixes realtime response privacy correctness when `sessionOptions.stats` toggles during active subscriptions. |
| 2026-02-24 | `working-tree` | Agent-08 | `node --check scripts/migration-authz-integration.mjs` | pass | Added dedicated integration harness for route-level authz/parity checks (`npm run test:migration-authz`). |
| 2026-02-24 | `working-tree` | Agent-07 | `node --check scripts/migration-load-check.mjs` | pass | Added repeatable load/perf harness with p95/error-rate thresholds (`npm run test:migration-load`). |
| 2026-02-24 | `working-tree` | Agent-08 | `ls docs/migration-manual-parity-checklist.md docs/migration-cutover-runbook.md` | pass | Added manual parity checklist and cutover/rollback runbook docs for final release gate sign-off. |
| 2026-02-24 | `working-tree` | Coordinator | `npm run build --workspace=packages/server && npm run build --workspace=packages/client && node --check scripts/migration-smoke.mjs && node --check scripts/migration-authz-integration.mjs && node --check scripts/migration-load-check.mjs` | pass | Final local compile/syntax verification after merged PRs #28-#34 before opening summary PR. |
| 2026-02-24 | `a3ce19e` | Agent-04 | `npm run build --workspace=packages/server && npm run build --workspace=packages/client` | pass | Course-grades parity tranche: session-selected aggregate grade view (`PR #36`). |
| 2026-02-24 | `4604675` | Agent-07 | `npm run build --workspace=packages/server && npm run build --workspace=packages/client` | pass | Attempt-scoped response hot-path optimization + session results fetch ordering/parallelization (`PR #37`). |
| 2026-02-24 | `f8c4bf7` | Coordinator | `npm run build --workspace=packages/server && npm run build --workspace=packages/client && node --check scripts/migration-smoke.mjs && node --check scripts/migration-authz-integration.mjs && node --check scripts/migration-load-check.mjs` | pass | Post-merge local verification after PRs #36 and #37 on latest `master`. |
| 2026-02-25 | `8d7bea5` | Agent-01/07/08 | `npm run build` | pass | Merged authz/realtime baseline and lane docs (`PR #42`) after conflict resolution. |
| 2026-02-25 | `a057b09` | Agent-02 | `npm run build` | pass | Session create parity fix: default `status=hidden`; session status enum validation tightened (`PR #43`). |
| 2026-02-25 | `c898aba` | Agent-04/L3 | `npm run build` | pass | CSV export parity updates (course grades, session responses, groups) with shared utility (`PR #44`). |
| 2026-02-25 | `18a5eca` | Agent-01/L8 | `npm run build && node --check scripts/migration-authz-integration.mjs` | pass | Image ownership authz hardening + integration coverage update (`PR #46`). |
| 2026-02-25 | `0623642` | Agent-05/L8 | `npm run build && node --check scripts/migration-realtime-authz.mjs` | pass | Realtime reconnect resubscribe + standardized subscription auth errors + realtime authz harness (`PR #47`). |

## Risks and Blockers

| Severity | Owner | Risk/Blocker | Mitigation | Target date |
|---|---|---|---|---|
| medium | Agent-01 | Residual cross-course edge-case exposure in non-core paths | Complete endpoint matrix review + authz integration assertions on latest `master` | 2026-02-28 |
| medium | Agent-07 | Realtime churn/reconnect behavior under load still not fully evidenced | Run dedicated reconnect/load scenarios and capture p95/error metrics | 2026-02-28 |
| high | Agent-08 | Insufficient parity test depth for cutover confidence | Expand smoke + integration + e2e + manual checklist | 2026-03-02 |
| medium | Agent-05 | Question type/option mismatch causes behavior drift | Normalize enum handling and option coercion | 2026-02-27 |
| medium | Agent-06 | Group/video semantics not fully matched | Port and verify category/room workflows | 2026-03-01 |

## Release Gate

Hard go/no-go criteria (all must be green):
- [ ] Auth + CSRF parity verified (login/register/forgot/reset/verify + CSRF token path).
- [ ] Route-level authz parity verified (questions/sessions/responses/grades/courses).
- [ ] Question type + option semantics verified across create/edit/render/respond/grade.
- [ ] Student and instructor lifecycle parity verified (session run, quiz submit, grading).
- [ ] Group/video parity verified for targeted legacy workflows.
- [ ] Realtime correctness verified (no duplicate logical updates, proper access control).
- [ ] Performance validation completed for target concurrency with documented metrics.
- [ ] DB compatibility verified (string `_id`, no destructive schema changes, legacy docs readable/writable).
- [ ] Full smoke + integration + e2e suites green on latest `master`.
- [ ] Manual parity checklist sign-off completed for student/prof/admin workflows.

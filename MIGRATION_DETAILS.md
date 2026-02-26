# Qlicker Migration Details

## Snapshot (2026-02-26)
- Baseline branch: `master`
- Baseline commit: `eaa03581`
- Latest merged migration PRs: `#81`, `#82`, `#83`, `#84`, `#85`
- Migration mode: secure Meteor parity first, then pilot, then cutover.
- Data policy: strict compatibility with existing Meteor Mongo collections and string `_id` semantics.
- Confidential data rule: `legacydb/` is local-only and must never be committed.

## Resume Guide (Next Agent)
1. Confirm local safety guards:
- `npm run test:migration-legacydb-guard`
- `git check-ignore -v legacydb`

2. Start deterministic local stack on non-conflicting ports:
- `npm run dev:migration:up`

3. Optional legacy backup restore for parity checks:
- `QCLICKER_RESTORE_LEGACY=true QCLICKER_LEGACY_BACKUP_DIR=./legacydb/<backup-dir> npm run dev:migration:up`

4. Validate runtime target before heavy gates:
- `API_BASE_URL=http://localhost:3211 npm run test:migration-runtime-preflight`

5. Run migration gate and focused suites:
- `API_BASE_URL=http://localhost:3211 npm run test:migration-gate`
- `API_BASE_URL=http://localhost:3211 npm run test:migration-authz`
- `API_BASE_URL=http://localhost:3211 npm run test:migration-realtime-authz`
- `API_BASE_URL=http://localhost:3211 npm run test:migration-load`

6. For backup-dataset parity evidence:
- `QCLICKER_LEGACY_BACKUP_DIR=legacydb/<backup-dir> QCLICKER_LEGACY_MONGO_URI=mongodb://localhost:27018/?directConnection=true npm run test:migration-legacy-backup`

## Current Completion View

| Lane | Scope | Status | Merged proof | Remaining to close lane |
|---|---|---|---|---|
| L1 | AuthZ + API policy | 99% | `#81`, `#82` | Final endpoint policy sweep artifact on staging gate run |
| L2 | Student/prof session + UI parity | 92% | `#84` | Full workflow matrix closure on backup dataset |
| L3 | Course/groups parity | 84% | `#63`, `#82` | Group/category cleanup and edge-behavior parity proof |
| L4 | Grades/results/exports parity | 92% | `#44`, `#53`, `#66`, `#77` | Meteor CSV ordering/value parity final lock |
| L5 | Realtime correctness + scale | 95% | `#81` | Refresh churn/load artifacts on latest merged baseline |
| L6 | Media + video/chat parity | 95% | `#77`, `#84` | Backup-dataset UI/video edge audit closure |
| L7 | DB compatibility + fixtures | 96% | `#57`, `#71`, `#78`, `#83` | Final staging backup artifact bundle publication |
| L8 | Integration/load/cutover ops | 99% | `#75`, `#78`, `#81`, `#83` | Final pilot signoff evidence package |

## Remaining Work Plan (Parallel)

### Wave 1 (parallel now)
1. L2 UI workflow closure
- Execute strict student/prof/admin UI workflow matrix against restored backup data.
- Close P0/P1 parity mismatches in live session, quiz, grading, and shell navigation behaviors.

2. L4 export/value closure
- Compare Meteor vs new exports for `session grades`, `course grades`, `groups`, and `responses`.
- Lock column order/value semantics with regression checks.

3. L5 realtime/load refresh
- Re-run churn/authz/load on latest `master` and publish artifacts.

### Wave 2 (parallel after Wave 1 fixes)
1. L3 + L6 edge parity audit
- Validate group/category cleanup/renumber flows and video room/help/clear behaviors on backup data.

2. L7 backup compatibility evidence refresh
- Re-run backup compatibility + parity diff and archive reports with commit IDs.

3. L8 staged pilot bundle
- Publish one consolidated evidence bundle: runtime gate JSON, authz/realtime/load logs, backup parity summary, pilot checklist output.

## Evidence and Artifacts Required Before Pilot UI Signoff
- Security evidence:
  - outsider read/write isolation blocked for course/session/question/response/grade surfaces.
  - promote/canPromote authorization semantics verified.
- Functional parity evidence:
  - student live + quiz flows.
  - professor course/session/question management + grading + exports.
  - admin user/settings workflows.
- Realtime evidence:
  - current-question propagation under reconnect/churn.
  - response visibility and subscription auth behavior under role boundaries.
- Data compatibility evidence:
  - backup restore validation and compatibility/parity reports with no schema-breaking writes.
- Load/SLO evidence:
  - target concurrency checks with p95/error-rate thresholds documented.

## Current Risks and Mitigations

| Severity | Risk | Mitigation |
|---|---|---|
| High | UI strict parity proof not closed across all workflows | Run and complete `docs/migration/ui-parity-audit.md` checklist using restored backup data and capture evidence links |
| High | Final CSV semantics could drift from Meteor in edge cases | Add/export comparison fixtures and lock expected columns/order/value semantics in migration tests |
| Medium | Realtime/load confidence can regress between merges | Re-run churn/load on latest `master` for each milestone batch and archive artifacts |
| Medium | Local environment mis-targeting can invalidate test runs | Keep runtime preflight mandatory and fail fast when API fingerprint is not Qlicker |

## Branch, PR, and Merge Protocol
- Lane branch naming: `migration/lane-0X-<scope>`.
- Merge model: continuous lane merges to `master` when lane checks pass; use feature flags when partial.
- Required checks per lane PR:
  - `npm run build`
  - lane-specific migration tests
  - security/realtime checks when affected
- Always open one docs summary PR per batch and leave it unmerged for review.

## Source-of-Truth Doc Map
- High-level status and current lane matrix: `MIGRATION.md`
- Feature parity status: `docs/migration/parity-matrix.md`
- UI-specific parity checklist: `docs/migration/ui-parity-audit.md`
- API mapping (Meteor -> new stack): `docs/migration/api-parity-map.md`
- Security policy and coverage: `docs/migration/security-audit.md`
- Realtime model and constraints: `docs/migration/realtime-design.md`
- Legacy DB testing flow: `docs/migration/db-compat-testing.md`
- Pilot/cutover operations: `docs/migration/pilot-checklist.md`, `docs/migration/cutover-runbook.md`
- Lane task packets: `agent-plans/lane-01-authz.md` ... `agent-plans/lane-08-integration-cutover.md`

## Recent Change Log
- 2026-02-26: `#85` merged docs/lane-plan synchronization.
- 2026-02-26: `#84` merged global app shell parity + dead React duplicate cleanup.
- 2026-02-26: `#83` merged configurable compose ports + optional legacy backup restore flow.
- 2026-02-26: `#82` merged promote/canPromote parity API + admin UI controls.
- 2026-02-26: `#81` merged deterministic runtime preflight and migration env normalization.

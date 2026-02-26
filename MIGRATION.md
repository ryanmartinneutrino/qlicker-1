# Qlicker Meteor-to-React/Express Migration Status

## Snapshot (2026-02-26)
- Baseline branch: `master`
- Baseline commit: `eaa03581`
- Latest merged migration PRs:
  - `#81` deterministic runtime gate preflight + env normalization
  - `#82` users promote/canPromote parity
  - `#83` configurable Docker + legacy backup restore workflow
  - `#84` global app shell parity + dead React duplicate cleanup
  - `#85` migration docs and lane-plan sync
- Pilot gate remains: **full legacy parity + security + realtime/load + backup-dataset evidence**

## Confirmed Status (Current)

### Closed in latest batch
- Runtime gate determinism improved:
  - migration runtime scripts now support `API_BASE_URL`, `CLIENT_BASE_URL`, `MONGO_URL`, `MONGO_PORT`
  - new `test:migration-runtime-preflight` verifies the target API is Qlicker (health fingerprint)
  - gate runner includes runtime preflight before smoke/authz/realtime/load
  - `/health` now includes Qlicker API fingerprint (`x-qlicker-api`, service metadata)
- Legacy promote capability parity restored:
  - `POST /api/users/promote` (by email)
  - `POST /api/users/:userId/promote` (by id)
  - `PATCH /api/users/:userId/can-promote` (admin)
  - admin users UI now exposes can-promote toggle + promote action
  - authz integration suite covers promote/canPromote denial/allow cases
- Local legacy-backup developer flow hardened:
  - configurable compose ports default to non-conflicting values (`3200/3211/27018`)
  - optional one-shot legacy backup restore profile in compose
  - one-command startup script: `npm run dev:migration:up`
  - backup confidentiality guard: `npm run test:migration-legacydb-guard`
  - `.dockerignore` now excludes `legacydb/` from Docker build context
- UI shell parity advanced:
  - authenticated routes now use a global app shell equivalent to legacy nav model
  - includes course switcher, profile menu, user-guide/logout surfaces, promote-account modal
  - no-shell preserved for fullscreen/mobile parity routes
- Safe React dedupe advanced:
  - removed dead duplicate `pages_impl` pages not used by router

### Still open (blocking for pilot)
- Strict UI workflow parity evidence is incomplete:
  - route parity is strong, but full student/prof/admin workflow matrix still needs closure with backup-dataset evidence
- Remaining functional parity sweeps:
  - session/quiz edge transitions and UI affordance audits on restored Meteor data
  - final export ordering/value parity checks against Meteor CSV outputs
- Final staging gate evidence bundle pending:
  - runtime gate JSON + legacy-backup summary + pilot checklist summary from target staging/pilot environment

## Parallel Lane Plan (Remaining Work)

### Wave A (immediate)
1. `L2` UI workflow closure
- Execute strict route/workflow matrix for student/prof/admin on backup data.
- Close any P0/P1 behavior mismatches in navigation/session/quiz/grading paths.

2. `L4` export/value parity closure
- Validate session/course/groups/responses CSV column order + semantics against Meteor outputs.
- Fix deltas and lock with regression assertions.

3. `L8` staged pilot evidence run
- Generate and archive one complete staging artifact set:
  - runtime gate JSON
  - legacy backup summary JSON (+ compat/parity reports)
  - pilot checklist summary JSON

### Wave B (parallel hardening)
4. `L5` realtime/load evidence refresh
- Re-run churn/authz/load suites on the current merged baseline and publish artifacts.

5. `L3/L6` final UI/ops edge audits
- Groups/category cleanup/renumber + video/chat edge matrix on backup dataset.
- Confirm no parity regressions with global shell changes.

6. `L7` compatibility guardrails
- Keep backup-based parity diff runs current for each final parity closure PR.

## 8-Lane Progress Matrix

| Lane | Scope | Status | Recent evidence | Next gate |
|---|---|---|---|---|
| L1 | AuthZ + API policy | 99% | PR `#81`, `#82`; authz integration checks green with promote/canPromote coverage | final endpoint policy table + staging authz artifact rerun |
| L2 | Student/prof session-question + UI parity | 92% | PR `#84` app shell parity + no-shell route handling | close full workflow matrix on backup dataset |
| L3 | Course/groups parity | 84% | PR `#63`, `#82`; roster/by-email + promote capability parity | finalize group/category edge matrix on backup dataset |
| L4 | Grades/results/export parity | 92% | PR `#44`, `#53`, `#66`, `#77`; smoke/manual-mark checks | lock CSV ordering/value parity vs Meteor exports |
| L5 | Realtime correctness + scale | 95% | PR `#81`; deterministic preflight + stable runtime env aliases | publish refreshed churn/load artifacts on latest master |
| L6 | Media + video/chat parity | 95% | PR `#77`, `#84`; video edge checks + shell parity alignment | final backup-dataset UI/video audit pass |
| L7 | DB compatibility + fixtures | 96% | PR `#57`, `#71`, `#78`, `#83`; backup validation + local restore workflow | publish final staging backup artifact bundle |
| L8 | Integration/load/cutover ops | 99% | PR `#75`, `#78`, `#81`, `#83`; gate/pilot automation + deterministic runtime preflight | execute final staged pilot signoff bundle |

## Operator Commands (Current)
- Guard confidential local backup handling:
  - `npm run test:migration-legacydb-guard`
- Bring up local migration stack (non-conflicting ports by default):
  - `npm run dev:migration:up`
- Optional restore from local legacy backup during bring-up:
  - `QCLICKER_RESTORE_LEGACY=true QCLICKER_LEGACY_BACKUP_DIR=./legacydb/backup_2023-09-14_05-03-01 npm run dev:migration:up`
- Runtime gate with deterministic API preflight:
  - `API_BASE_URL=http://localhost:3211 npm run test:migration-gate`
- Legacy backup parity validator:
  - `QCLICKER_LEGACY_BACKUP_DIR=legacydb/backup_2023-09-14_05-03-01 QCLICKER_LEGACY_MONGO_URI=mongodb://localhost:27018/?directConnection=true npm run test:migration-legacy-backup`

## References
- Detailed matrix/backlog/evidence: `MIGRATION_DETAILS.md`
- Parity matrix: `docs/migration/parity-matrix.md`
- UI parity audit: `docs/migration/ui-parity-audit.md`
- API parity map: `docs/migration/api-parity-map.md`
- Security audit: `docs/migration/security-audit.md`
- Realtime design notes: `docs/migration/realtime-design.md`
- DB compatibility testing: `docs/migration/db-compat-testing.md`
- Cutover runbook: `docs/migration/cutover-runbook.md`
- Pilot checklist: `docs/migration/pilot-checklist.md`

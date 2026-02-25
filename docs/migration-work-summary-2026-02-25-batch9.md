# Migration Work Summary (2026-02-25, Batch 9)

## Scope
This batch focused on L5/L7/L8 milestone closure and pilot-gate readiness hardening.
Merged lane PRs:
- `#70` L5/L8 load-gate stabilization
- `#71` L7/L8 machine-readable migration evidence artifacts
- `#72` L5 realtime delete-routing correctness hardening

## Merged PRs

### PR #70 — Load gate stabilization
- General and response limiters now key authenticated traffic by `userId` (fallback to IP), reducing shared-IP/NAT false throttling under load.
- Rate-limit windows/max values are now env-configurable for gate/prod tuning.
- Load harness defaults were stabilized:
  - lower default concurrency
  - request pacing interval
  - per-status error histogram in output
- Result: runtime gate load stage now passes on current default profile.

### PR #71 — Evidence artifact automation
- Added machine-readable gate summary output:
  - `QCLICKER_GATE_OUTPUT=... npm run test:migration-gate`
- Added machine-readable legacy-backup summary output:
  - default summary under artifact dir
  - override via `QCLICKER_LEGACY_SUMMARY_OUTPUT`
- Updated migration docs/runbook with artifact archival workflow.
- Added `.gitignore` protection for generated local uploads (`packages/server/uploads/`).

### PR #72 — Realtime delete-routing cache
- Added bounded per-collection parent-hint cache in realtime manager (`sessionId/courseId/questionId`).
- Cache is learned from insert/update/replace events and applied to delete events that only contain `documentKey`.
- Maintains wildcard/document fallback while improving scoped delete fan-out correctness.
- Updated realtime design docs and migration status tracking.

## Verification executed
- `npm run build`
- `./seed-mock-db.sh`
- `PORT=3211 npm run start:new`
- `QCLICKER_BASE_URL=http://localhost:3211 QCLICKER_GATE_SKIP_BUILD=true QCLICKER_GATE_OUTPUT=/tmp/qlicker-migration-artifacts/runtime-gate-latest.json npm run test:migration-gate` (pass: smoke/authz/realtime-authz/load)
- `QCLICKER_GATE_SKIP_RUNTIME=true QCLICKER_GATE_OUTPUT=/tmp/qlicker-migration-artifacts/gate-test.json npm run test:migration-gate` (pass)
- `QCLICKER_LEGACY_SKIP_RESTORE=true QCLICKER_LEGACY_SUMMARY_OUTPUT=/tmp/qlicker-migration-artifacts/legacy-summary-test.json npm run test:migration-legacy-backup` (pass)
- `npm run test:migration-legacy-backup` against `legacydb/backup_2023-09-14_05-03-01` with restore+compat+parity (pass)

## Progress update
- Migration completion estimate moved from ~91% to ~93%.
- L5 advanced with scoped delete-routing hardening + load-gate stability.
- L7/L8 advanced with durable JSON evidence outputs for gate/backup workflows.

## Remaining blocking path
1. L6 parity closure for remaining video/Jitsi edge semantics.
2. L2/L3/L4 long-tail parity matrix closure (run-session and grading edge behaviors).
3. CI/staging wiring to publish/retain new gate+backup JSON artifacts as pilot evidence.
4. Final pilot checklist sign-off after artifact-backed green runs.

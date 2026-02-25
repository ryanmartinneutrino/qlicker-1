# Migration Work Summary (2026-02-25, Batch 11)

## Merged lane PRs
- `#77` L2/L4/L6 parity closure:
  - reset-to-first `currentQuestion` when session transitions to `running`
  - smoke coverage for run-session restart parity
  - smoke coverage for manual mark override preservation after recalculation
  - smoke coverage for video/Jitsi edge behavior (membership-resolved room selection, instructor help-reset, disabled-room denial)
- `#78` L7/L8 artifact + pilot sign-off automation:
  - optional legacy-backup + pilot-checklist stages in runtime artifact workflow
  - `test:migration-legacy-backup` supports `QCLICKER_LEGACY_SKIP_RESTORE=true` without backup-path requirement
  - new `test:migration-pilot-checklist` artifact-driven sign-off script
  - optional gate stage `QCLICKER_GATE_INCLUDE_PILOT_CHECKLIST=true`
  - docs for pilot artifact workflow and sign-off checklist

## Verification (batch evidence)
- `npm run build` (pass)
- runtime gate with churn (pass):
  - `QCLICKER_BASE_URL=http://localhost:3211 QCLICKER_GATE_SKIP_BUILD=true QCLICKER_GATE_INCLUDE_REALTIME_CHURN=true QCLICKER_REALTIME_CHURN_CYCLES=4 QCLICKER_REALTIME_CHURN_BURST_SIZE=3 QCLICKER_GATE_OUTPUT=/tmp/qlicker-migration-artifacts/batch11/migration-gate-runtime.json npm run test:migration-gate`
- legacy-backup restore + compat + parity (pass):
  - `QCLICKER_LEGACY_BACKUP_DIR='legacydb/backup_2023-09-14_05-03-01' QCLICKER_LEGACY_MONGO_URI='mongodb://localhost:27017/?directConnection=true' QCLICKER_LEGACY_ARTIFACT_DIR=/tmp/qlicker-migration-artifacts/batch11 QCLICKER_LEGACY_SUMMARY_OUTPUT=/tmp/qlicker-migration-artifacts/batch11/legacy-backup-summary.json npm run test:migration-legacy-backup`
- pilot checklist artifact (pass):
  - `QCLICKER_PILOT_RUNTIME_GATE_JSON=/tmp/qlicker-migration-artifacts/batch11/migration-gate-runtime.json QCLICKER_PILOT_LEGACY_SUMMARY_JSON=/tmp/qlicker-migration-artifacts/batch11/legacy-backup-summary.json QCLICKER_PILOT_REQUIRE_REALTIME_CHURN=true QCLICKER_PILOT_OUTPUT=/tmp/qlicker-migration-artifacts/batch11/pilot-checklist-summary.json npm run test:migration-pilot-checklist`
- gate runner pilot stage sanity (pass):
  - `QCLICKER_GATE_SKIP_BUILD=true QCLICKER_GATE_SKIP_RUNTIME=true QCLICKER_GATE_INCLUDE_PILOT_CHECKLIST=true QCLICKER_GATE_OUTPUT=/tmp/qlicker-migration-artifacts/batch11/migration-gate-pilot-only.json QCLICKER_PILOT_RUNTIME_GATE_JSON=/tmp/qlicker-migration-artifacts/batch11/migration-gate-runtime.json QCLICKER_PILOT_LEGACY_SUMMARY_JSON=/tmp/qlicker-migration-artifacts/batch11/legacy-backup-summary.json QCLICKER_PILOT_OUTPUT=/tmp/qlicker-migration-artifacts/batch11/pilot-checklist-summary-recheck.json npm run test:migration-gate`

## Remaining pilot blocker
- Run one staging/operator artifact cycle on the target pilot environment and attach:
  - runtime gate summary JSON
  - legacy-backup summary + compat/parity JSON reports
  - pilot-checklist summary JSON

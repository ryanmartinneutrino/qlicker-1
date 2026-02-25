# Cutover Runbook

## Strategy
- Pilot-first cutover (selected courses), then full switch after parity + SLO gates.

## Preconditions
- all blocking security checks pass
- parity matrix shows no pilot-blocking open items
- seeded + backup-based parity checks pass
- realtime and load tests meet thresholds
- migration gate command is green on latest `master`:
  - `npm run test:migration-gate`
  - include realtime churn stage for reconnect evidence when required:
    - `QCLICKER_GATE_INCLUDE_REALTIME_CHURN=true npm run test:migration-gate`
  - plus DB checks in staging:
    - `QCLICKER_GATE_INCLUDE_DB_COMPAT=true QCLICKER_GATE_INCLUDE_DB_PARITY=true npm run test:migration-gate`
  - include real legacy-backup validation when backup is mounted:
    - `QCLICKER_GATE_SKIP_BUILD=true QCLICKER_GATE_SKIP_RUNTIME=true QCLICKER_GATE_INCLUDE_LEGACY_BACKUP=true QCLICKER_LEGACY_BACKUP_DIR=... npm run test:migration-gate`
- machine-readable evidence is archived for the latest gate run:
  - gate summary JSON via `QCLICKER_GATE_OUTPUT=...`
  - legacy-backup summary JSON + compat/parity reports from `test:migration-legacy-backup`
  - runtime gate CI artifact bundle from workflow `.github/workflows/migration-runtime-gate-artifacts.yml`

## Pilot execution
1. Deploy new stack for pilot cohort only.
2. Monitor:
   - authz/security incidents
   - API error rate
   - realtime disconnect/resubscribe rates
   - key workflow completion rates (join, answer, submit, grade view)
3. Compare grade/export outputs against Meteor baseline for pilot sessions.

## Rollback criteria
- any cross-course data exposure
- sustained SLO breach
- parity-critical workflow failure (session answering, quiz submit, grade visibility, required exports)

## Rollback steps
1. Disable pilot routing to new stack.
2. Route pilot cohort back to Meteor app.
3. Preserve DB writes; run validation checks for any partial session states.
4. Open incident report with failing parity/security scenario and route/module owner.

## Full cutover criteria
- pilot stable across defined observation window
- no unresolved blocking defects
- migration summary PR and runbook signed off

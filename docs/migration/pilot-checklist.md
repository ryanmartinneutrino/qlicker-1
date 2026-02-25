# Pilot Checklist

Use this checklist for the final pilot go/no-go decision after artifacts are generated.

## Required Artifacts
- Runtime gate summary JSON (`migration-gate-runtime.json` or equivalent from `QCLICKER_GATE_OUTPUT`)
- Legacy-backup summary JSON (`legacy-backup-summary-*.json` or explicit `QCLICKER_LEGACY_SUMMARY_OUTPUT`)
- Pilot checklist summary JSON (`pilot-checklist-summary.json` from `test:migration-pilot-checklist`)

## Automated Sign-Off Command
```bash
QCLICKER_PILOT_RUNTIME_GATE_JSON=artifacts/migration-gate-runtime.json \
QCLICKER_PILOT_LEGACY_SUMMARY_JSON=artifacts/legacy-backup-summary.json \
QCLICKER_PILOT_REQUIRE_REALTIME_CHURN=true \
QCLICKER_PILOT_OUTPUT=artifacts/pilot-checklist-summary.json \
npm run test:migration-pilot-checklist
```

## Gate Items
| Item | Pass Criteria |
|---|---|
| Runtime gate status | `status=pass` in runtime gate summary |
| Runtime stages | `smoke`, `authz`, `realtime-authz`, `load` all pass (`realtime-churn` required when configured) |
| Legacy backup status | `status=pass` in legacy summary |
| Legacy stages | `db-compat-baseline`, `db-compat-candidate`, `db-parity` all pass |
| Legacy reports | baseline/candidate compat + parity report paths present in summary |

## Operator Sign-Off
- [ ] Latest runtime gate artifact reviewed
- [ ] Latest legacy-backup artifact reviewed
- [ ] Latest pilot checklist summary reviewed
- [ ] Pilot course monitoring/rollback contacts confirmed
- [ ] Final go/no-go decision recorded

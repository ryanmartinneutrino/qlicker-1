# Lane 08 - Integration, Load, and Cutover Ops

## Scope
- final parity gate execution and pilot/cutover readiness evidence

## Completed
- unified migration gate + pilot checklist artifacts
- runtime gate preflight determinism improvements (PR `#81`)

## Next checklist
- run final staged pilot bundle and archive outputs
- verify go/no-go checklist with no unresolved P0/P1 items
- keep rollback runbook aligned to latest lane merges

## Mandatory checks
- `npm run test:migration-gate`
- `npm run test:migration-pilot-checklist`
- `docs/migration/cutover-runbook.md` and `docs/migration/pilot-checklist.md` updated in PR

# Lane 07 - DB Compatibility + Fixtures

## Scope
- strict Meteor DB compatibility and parity-diff evidence maintenance

## Completed
- backup validator + pilot checklist automation
- local compose restore workflow + confidentiality guard (`legacydb`) (PR `#83`)

## Next checklist
- run one full staging artifact bundle (runtime + backup + pilot checklist)
- attach compat/parity diff outputs for final pilot gate review
- keep fixture/parity docs synchronized with latest merged lanes

## Mandatory checks
- `npm run test:migration-legacydb-guard`
- `npm run test:migration-legacy-backup`
- `npm run test:migration-db-compat`
- `npm run test:migration-db-parity`

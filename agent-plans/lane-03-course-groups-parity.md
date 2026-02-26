# Lane 03 - Course Management + Groups Parity

## Scope
- course roster/management parity
- group/category parity and cleanup semantics

## Completed
- roster by-email add/remove/promote flows
- users promote/canPromote parity endpoints + admin UI controls (PR `#82`)

## Next checklist
- close remaining group/category cleanup/renumber edge cases on backup dataset
- confirm TA/student management affordances match Meteor wording/behavior
- lock groups CSV parity against legacy ordering

## Mandatory checks
- `npm run build`
- `API_BASE_URL=... npm run test:migration-authz`
- group-management evidence matrix in PR notes

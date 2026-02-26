# Lane 04 - Grades, Results, and Exports

## Scope
- session/course grading/results behavior
- export output parity (columns/order/values)

## Completed
- server-backed exports for groups/session/course/responses
- grading recalculation/manual-mark preservation checks in smoke

## Next checklist
- compare all CSV outputs to Meteor on backup dataset
- close ordering/value deltas and add deterministic regression assertions
- verify visibility toggles + reviewability interactions in UI

## Mandatory checks
- `npm run build`
- `API_BASE_URL=... npm run test:migration-smoke`
- export diff evidence attached to PR

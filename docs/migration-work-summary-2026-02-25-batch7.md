# Migration Work Summary (2026-02-25, Batch 7)

## Merged PRs
- `#63` `feat(course): add by-email roster management parity`
  - added course roster APIs for student/instructor add by email (or id)
  - added instructor removal endpoint with owner/self safeguards
  - wired roster add/remove controls into React course management UI
  - expanded authz integration checks for roster lifecycle and outsider denial
- `#64` `test(smoke): add video/group parity regression coverage`
  - expanded migration smoke validation for course/category/group video workflows
  - added checks for join/leave, help toggle, and instructor clear/reset behavior
  - stabilized outsider session authz assertions by keeping target session alive until checks complete

## Validation Evidence
- `npm run build`
- `./seed-mock-db.sh`
- `PORT=3101 ROOT_URL=http://localhost:3101 DISABLE_CSRF=true npm run start --workspace=packages/server`
- `QCLICKER_BASE_URL=http://localhost:3101 node scripts/migration-authz-integration.mjs`
- `node --check scripts/migration-smoke.mjs`
- `PORT=3102 ROOT_URL=http://localhost:3102 DISABLE_CSRF=true npm run start --workspace=packages/server`
- `QCLICKER_BASE_URL=http://localhost:3102 node scripts/migration-smoke.mjs`

## Net Progress by Lane
- L3: TA/student roster parity advanced with by-email membership APIs + UI controls.
- L6: parity validation depth improved with executable video/group behavior checks.
- L1/L8: regression coverage increased for course-management authz and smoke parity.

## Remaining High-Priority Gaps
- L2/L4: finalize run-session and grading/review edge parity matrix closure.
- L6: complete remaining Jitsi/group edge parity (room cleanup and cross-role corner cases).
- L7/L8: execute full Docker/CI gate with archived artifacts for pilot-go/no-go packet.

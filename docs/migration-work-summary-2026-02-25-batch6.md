# Migration Work Summary (2026-02-25, Batch 6)

## Lane milestone
- L3 course-roster parity moved forward with by-email and instructor-management workflows.
- L6 validation moved forward with executable smoke checks for video/group chat behaviors.

## What landed
- Added course roster management APIs in Express:
  - `POST /api/courses/:courseId/students` (add student by `email` or `studentId`)
  - `POST /api/courses/:courseId/instructors` (add instructor/TA by `email` or `instructorId`)
  - `DELETE /api/courses/:courseId/instructors/:instructorId` (remove instructor/TA)
- Added parity safeguards for instructor removal:
  - cannot remove course owner
  - cannot remove yourself from instructor list
- Added roster parity controls to the React instructor course page:
  - add instructor by email
  - add student by email
  - remove instructor from roster list
- Expanded authz integration harness coverage:
  - outsider-professor denial for new roster mutation endpoints
  - successful add-student-by-email, promote-to-instructor-by-email, and remove-instructor flow
  - owner/self removal guard checks
- Expanded migration smoke coverage for video/group parity:
  - course chat connection + join/leave
  - category/group connection routing
  - group help toggle and instructor clear/reset semantics

## Validation evidence
- `npm run build`
- `./seed-mock-db.sh`
- `PORT=3101 ROOT_URL=http://localhost:3101 DISABLE_CSRF=true npm run start --workspace=packages/server`
- `QCLICKER_BASE_URL=http://localhost:3101 node scripts/migration-authz-integration.mjs`
- `QCLICKER_BASE_URL=http://localhost:3102 node scripts/migration-smoke.mjs`

## Net progress by lane
- L3: roster management parity is now materially closer to Meteor behavior for TA/student workflows.
- L6: video/group parity validation now has concrete smoke evidence for help/clear/join flows.
- L1/L8: authz and smoke regression evidence expanded for course-management/video endpoints.

## Remaining high-priority gaps
- Finish full L3 behavior matrix (group/category edge semantics + instructor/student lifecycle corner cases).
- Continue L2/L4/L6 parity closure for run-session, grading/review edge behavior, and full Jitsi parity validation.
- Execute L8 gate with archived CI/staging evidence on latest head.

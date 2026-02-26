# Security Audit (Migration)

## Confirmed issues (before fixes)
- non-member could read `course/session/question` by id
- non-member could list broad `sessions/questions`
- non-member could edit/delete outsider questions
- non-member could submit/view responses for outsider course sessions
- socket subscription auth depended on missing session bridge

## Fixes implemented
- Added shared course-access helpers and applied membership/role checks across core routes:
  - `courses/sessions/questions/responses/grades` read/write paths
  - instructor/admin checks for course-managed mutations
  - student-only restrictions for response submission where applicable
- Added explicit per-course manager checks on instructor-only mutation/export routes:
  - `sessions`: create/update/delete/status/current/reorder/copy/extension-candidates
  - `grades`: calc/update/visibility/session-export endpoints
  - `courses`: management, roster/student removal, add student by email, add/remove instructor (TA), groups/category CRUD, instructor video-chat control endpoints
- Restricted broad list reads for non-admin users to membership-scoped data.
- Hardened question mutation to owner/instructor/admin semantics.
- Hardened image APIs:
  - non-admin image listing is owner-scoped
  - image delete requires owner or admin
- Restored legacy promotion capability policy with explicit API checks:
  - `POST /api/users/promote` and `POST /api/users/:userId/promote` require admin or `profile.canPromote`
  - `PATCH /api/users/:userId/can-promote` remains admin-only
  - admin target promotion is rejected with safe error semantics
- Added Socket.IO auth bridging with express-session + passport.
- Added subscription-level authorization checks on realtime `subscribe:*` channels with a stable `subscription:error` payload contract.
- Added authorization regression checks to migration smoke and integration scripts.
- Added outsider-professor regression checks to ensure non-owner professors cannot manage unrelated course/session/grade resources.
- Normalized question-library session-detached semantics (`sessionId` missing/null) to avoid hidden-access/parity drift from legacy documents.

## Remaining security tasks
- complete route-level audit for every endpoint and add table-driven policy tests
- standardize 403 vs 404 concealment policy per endpoint class
- add explicit negative tests for all `subscribe:*` channels
- add CI gate for authz regression suite

## Regression checks
- `scripts/migration-smoke.mjs` now verifies outsider access denial on:
  - course/session/question reads
  - question mutate/delete
  - response submit/read
- `scripts/migration-authz-integration.mjs` now includes image ownership delete denial checks.
- `scripts/migration-authz-integration.mjs` now also verifies export endpoint auth for:
  - `GET /api/grades/course/:courseId/export`
  - `GET /api/grades/session/:sessionId/export`
  - `GET /api/responses/session/:sessionId/export`
- `scripts/migration-authz-integration.mjs` now verifies outsider-professor denial on instructor-only management endpoints for:
  - `courses` (`PUT/DELETE`, enrollment-code regenerate, roster, student/instructor add/remove, group/category manage, video-chat toggle)
  - `sessions` (`status`, question attach/reorder, extension candidates)
  - `grades` (`calc-session`, session export, grade visibility/update)
- `scripts/migration-authz-integration.mjs` now verifies roster-management parity flows:
  - add student by email
  - promote student to instructor by email
  - enforce owner/self instructor-removal safeguards
- `scripts/migration-authz-integration.mjs` now verifies promote-capability regressions:
  - non-admin without `canPromote` cannot promote users
  - admin can toggle `canPromote`
  - `canPromote` users can promote by email/id
  - admin users cannot be promoted/demoted via promote endpoints
- `scripts/migration-realtime-authz.mjs` now verifies realtime subscribe authz/error contracts across all `subscribe:*` channels:
  - outsider `forbidden`
  - anonymous `not_authenticated`
  - missing payload `bad_request`
  - missing resources `not_found` where applicable

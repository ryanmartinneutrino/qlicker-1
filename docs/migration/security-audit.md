# Security Audit (Migration)

## Confirmed issues (before fixes)
- non-member could read `course/session/question` by id
- non-member could list broad `sessions/questions`
- non-member could edit/delete outsider questions
- non-member could submit/view responses for outsider course sessions
- socket subscription auth depended on missing session bridge

## Fixes implemented
- Added centralized guards:
  - `requireCourseMember`
  - `requireCourseInstructorOrAdmin`
  - `requireSessionMemberAccess`
  - `requireQuestionAccess`
- Applied guards and membership checks in key routes:
  - courses/sessions/questions/responses/grades read/write paths
- Restricted broad list reads for non-admin users to membership-scoped data.
- Hardened question mutation to owner/instructor/admin semantics.
- Added Socket.IO auth bridging with express-session + passport.
- Added subscription-level authorization checks and standardized `subscription:error` events.
- Added authorization regression checks to migration smoke tests.

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

# Migration Work Summary (2026-02-25, Batch 4)

## Merged in this batch
- `#53` `migration/lane-04-server-csv-exports`
  - added server-backed CSV exports:
    - `GET /api/grades/course/:courseId/export`
    - `GET /api/grades/session/:sessionId/export`
    - `GET /api/responses/session/:sessionId/export`
  - added shared server CSV utility and reused it for groups export
  - wired `CourseGrades`, `GradeSession`, and `SessionResults` to prefer server CSV with fallback
- `#54` `migration/lane-01-question-library-session-scope-fix`
  - normalized question library detached-session filtering (`sessionId` missing/null)
  - removed undefined-field persistence on question create/copy paths
  - authz integration harness updated and validated end-to-end on isolated runtime
- `#55` `migration/lane-01-session-store-collection-separation`
  - moved auth/session middleware storage to Mongo collection `authSessions`
  - hardened session routes to ignore non-course docs in `sessions`
  - DB compatibility harness now emits explicit `sessions._collection` collision findings

## Milestones reached
- L4 milestone: all required CSV export surfaces now have server endpoints and UI integration.
- L1 milestone: question-library/session-scope parity bug closed and authz harness stabilized.
- L7/L1 cross-cutting milestone: critical `sessions` collection collision resolved for new writes with explicit compatibility detection for legacy-polluted DBs.

## Remaining highest-impact work
- Execute backup-based L7 parity runs against sanitized Meteor backup (`db-compat` + `db-parity`) and archive artifacts.
- Close remaining L2/L3/L6 behavior parity gaps (run-session edge controls, full group/video/Jitsi parity).
- Run full L8 gate in Docker/CI on latest `master` with runtime + DB stages and collect pilot-go/no-go evidence.

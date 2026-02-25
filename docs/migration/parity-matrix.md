# Migration Parity Matrix

Legend: `Done` = implemented and validated, `In Progress` = partially implemented, `Open` = not yet implemented.

| Area | Legacy Meteor behavior | New stack status | Validation source |
|---|---|---|---|
| Auth login/register/reset | Shared bcrypt + role-based auth | Done | smoke + build |
| UI routing + page coverage | Legacy routes/pages available to student/prof/admin | Done | route audit in `docs/migration/ui-parity-audit.md`; legacy aliases (`/logout`, `/verify-email/:token`, `/course/:courseId/videochat`, `/course/:courseId/session/run/:sessionId/mobile`) now mapped in React router |
| Course membership isolation | Course/session/question reads constrained by membership | In Progress | route hardening landed, question detached-session normalization landed, non-course session docs are filtered, and instructor mutation guards were expanded for courses/sessions/grades; broader endpoint sweep pending |
| Interactive session (student) | One live question, reactive current question | In Progress | realtime session subscribe + response submit landed |
| Quiz flow | All questions, deadline/extensions, submit lock | In Progress | submit path exists; full UX parity pending |
| Manage session question workflow | attach/reorder/remove/copy | In Progress | session question API + management UI landed; edge parity checks pending |
| Course management (prof) | TA/student management incl. email actions | In Progress | course roster now supports add student by email, add instructor by email, and instructor removal parity APIs/UI; full behavior matrix still pending |
| Group categories | category/group CRUD + assignments + CSV export | In Progress | CRUD and CSV export landed; cleanup/renumber parity pending |
| Grade calculation | participation + automatic/manual marks | Done | calc endpoint + reviewability parity + manual-mark-preservation recalculation check in migration smoke |
| Session/course results views | clean tables + controls parity | In Progress | results pages improved; final review/visibility parity checks pending |
| CSV exports | session grades, course grades, group export, response export | In Progress | server-backed exports landed for groups, course grades, session grades, and session responses; legacy column/value ordering checks against Meteor still pending |
| Realtime auth | authenticated and authorized subscribe channels | In Progress | socket auth bridge + channel auth errors + realtime authz harness landed |
| Realtime delete updates | client receives relevant deletes | In Progress | parent-hint delete routing cache landed; pre-image/exact-route refinement pending |
| Image upload/storage | local/S3/Azure adapters, profile lifecycle | In Progress | adapters + owner-scoped image authz landed; parity validation pending |
| Video/Jitsi | course/group room parity + help/clear semantics | Done | migration smoke now validates membership-resolved room selection, join/leave/help/clear semantics, instructor help-reset behavior, and disabled-room connection denial |
| DB compatibility | string `_id`, collection/field compatibility | In Progress | `test:migration-db-compat` + `test:migration-db-parity` + `test:migration-legacy-backup` passed on local Meteor dump; runtime artifact workflow now supports optional legacy-backup + pilot-checklist evidence publication |
| Integration parity tests | multi-role end-to-end parity suite | In Progress | smoke/authz/realtime-authz/load + unified `test:migration-gate`; gate/legacy/pilot checklist summaries are machine-readable and CI-uploadable; full Docker/CI evidence pending |

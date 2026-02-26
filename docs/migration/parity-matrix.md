# Migration Parity Matrix

Legend: `Done` = implemented and validated, `In Progress` = partially implemented, `Open` = not yet implemented.

| Area | Legacy Meteor behavior | New stack status | Validation source |
|---|---|---|---|
| Auth login/register/reset | Shared bcrypt + role-based auth | Done | smoke + build |
| UI routing + page coverage | Legacy routes/pages available to student/prof/admin | Done | route audit in `docs/migration/ui-parity-audit.md`; legacy aliases mapped in React router |
| Global app shell/navigation | course switcher/profile menu/user guide/logout/promotion entry | In Progress | PR `#84` app shell landed; workflow matrix verification still pending |
| Promote/canPromote account capability | eligible users can promote accounts to professor | Done | PR `#82`; API + admin UI + authz integration checks |
| Course membership isolation | course/session/question reads constrained by membership | In Progress | route hardening + authz integration suites; final endpoint policy table pending |
| Interactive session (student) | one live question, reactive current question | In Progress | realtime session subscribe + response submit landed |
| Quiz flow | all questions, deadline/extensions, submit lock | In Progress | submit path + extension support landed; full UI edge matrix pending |
| Manage session question workflow | attach/reorder/remove/copy | In Progress | session question API + management UI landed; edge parity checks pending |
| Course management (prof) | TA/student management incl. by-email actions | In Progress | roster add/remove by email landed; full parity checklist pending |
| Group categories | category/group CRUD + assignments + CSV export | In Progress | CRUD and CSV export landed; cleanup/renumber parity sweep pending |
| Grade calculation | participation + automatic/manual marks | Done | calc endpoint + reviewability parity + manual-mark-preservation check in migration smoke |
| Session/course results views | clean tables + controls parity | In Progress | results pages improved; final review/visibility matrix pending |
| CSV exports | session grades, course grades, group export, response export | In Progress | server-backed exports landed; final Meteor column/value ordering checks pending |
| Realtime auth | authenticated + authorized subscribe channels | Done | realtime authz harness + socket session bridge + structured errors |
| Realtime delete/update fan-out | scoped update routing under churn | In Progress | parent-hint delete routing cache + churn harness; recurring artifact publication pending |
| Image upload/storage | local/S3/Azure adapters, profile lifecycle | In Progress | adapters + owner-scoped image authz landed; parity validation pending |
| Video/Jitsi | course/group room parity + help/clear semantics | Done | migration smoke validates membership-resolved room behavior + help/clear semantics |
| DB compatibility | string `_id`, collection/field compatibility | In Progress | `test:migration-db-compat`, `test:migration-db-parity`, `test:migration-legacy-backup`; compose restore workflow landed in PR `#83` |
| Integration parity tests | multi-role end-to-end parity suite | In Progress | smoke/authz/realtime-authz/load + unified `test:migration-gate`; final staging pilot evidence bundle pending |

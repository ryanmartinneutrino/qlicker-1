# Migration Parity Matrix

Legend: `Done` = implemented and validated, `In Progress` = partially implemented, `Open` = not yet implemented.

| Area | Legacy Meteor behavior | New stack status | Validation source |
|---|---|---|---|
| Auth login/register/reset | Shared bcrypt + role-based auth | Done | smoke + build |
| Course membership isolation | Course/session/question reads constrained by membership | In Progress | route hardening landed; broader endpoint sweep pending |
| Interactive session (student) | One live question, reactive current question | In Progress | realtime session subscribe + response submit landed |
| Quiz flow | All questions, deadline/extensions, submit lock | In Progress | submit path exists; full UX parity pending |
| Manage session question workflow | attach/reorder/remove/copy | In Progress | session question API + management UI landed; edge parity checks pending |
| Course management (prof) | TA/student management incl. email actions | In Progress | expanded course management merged; final behavior matrix pending |
| Group categories | category/group CRUD + assignments + CSV export | In Progress | CRUD and CSV export landed; cleanup/renumber parity pending |
| Grade calculation | participation + automatic/manual marks | In Progress | calc endpoint exists; parity checks still pending |
| Session/course results views | clean tables + controls parity | In Progress | results pages improved; final review/visibility parity checks pending |
| CSV exports | session grades, course grades, group export, response export | In Progress | course grades/groups/session responses CSV exports landed; remaining legacy-column parity checks pending |
| Realtime auth | authenticated and authorized subscribe channels | In Progress | socket auth bridge + channel auth errors + realtime authz harness landed |
| Realtime delete updates | client receives relevant deletes | In Progress | wildcard delete relay landed; routing refinement pending |
| Image upload/storage | local/S3/Azure adapters, profile lifecycle | In Progress | adapters + owner-scoped image authz landed; parity validation pending |
| Video/Jitsi | course/group room parity + help/clear semantics | In Progress | core endpoints exist; parity validation pending |
| DB compatibility | string `_id`, collection/field compatibility | In Progress | `test:migration-db-compat` + `test:migration-db-parity` harnesses landed; backup staging execution pending |
| Integration parity tests | multi-role end-to-end parity suite | In Progress | smoke/authz/realtime-authz/load + unified `test:migration-gate` landed; full Docker/CI evidence pending |

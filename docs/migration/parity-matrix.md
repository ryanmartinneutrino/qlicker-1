# Migration Parity Matrix

Legend: `Done` = implemented and validated, `In Progress` = partially implemented, `Open` = not yet implemented.

| Area | Legacy Meteor behavior | New stack status | Validation source |
|---|---|---|---|
| Auth login/register/reset | Shared bcrypt + role-based auth | Done | smoke + build |
| Course membership isolation | Course/session/question reads constrained by membership | In Progress | route hardening landed; broader endpoint sweep pending |
| Interactive session (student) | One live question, reactive current question | In Progress | realtime session subscribe + response submit landed |
| Quiz flow | All questions, deadline/extensions, submit lock | In Progress | submit path exists; full UX parity pending |
| Manage session question workflow | attach/reorder/remove/copy | Open | UI + API parity pending |
| Course management (prof) | TA/student management incl. email actions | Open | pending lane L3 |
| Group categories | category/group CRUD + assignments + CSV export | Open | pending lane L3 |
| Grade calculation | participation + automatic/manual marks | In Progress | calc endpoint exists; parity checks still pending |
| Session/course results views | clean tables + controls parity | Open | pending lane L4 |
| CSV exports | session grades, course grades, group export, response export | Open | pending lane L4/L3 |
| Realtime auth | authenticated and authorized subscribe channels | In Progress | socket auth bridge + authz checks landed |
| Realtime delete updates | client receives relevant deletes | In Progress | wildcard delete relay landed; routing refinement pending |
| Image upload/storage | local/S3/Azure adapters, profile lifecycle | In Progress | adapters present; parity validation pending |
| Video/Jitsi | course/group room parity + help/clear semantics | In Progress | core endpoints exist; parity validation pending |
| DB compatibility | string `_id`, collection/field compatibility | In Progress | insert path and schema checks in place; backup diff track pending |
| Integration parity tests | multi-role end-to-end parity suite | In Progress | smoke extended with authz regression checks |

# Qlicker Migration Status

## Status
- Phase 0 (coordination/docs baseline): `in-progress`
- Phase 1 (contract + security parity): `in-progress`
- Phase 2 (feature parity lanes): `in-progress`
- Phase 3 (reactivity + performance hardening): `in-progress`
- Phase 4 (verification + cutover readiness): `not started`

## Active Lanes
- `Agent-01 Contracts/Auth`: question enum + option normalization, `/api/questions` authz hardening, route-level parity audit, index bootstrap.
- `Agent-02 Student Session`: student session + quiz interaction parity.
- `Agent-03 Instructor Run`: run-session controls + live workflow parity (session question add/remove/reorder management landed in this tranche).
- `Agent-04 Grading`: instructor grading workflow parity (group/category filtering + bulk assignment landed; remaining parity checks pending).
- `Agent-05 Question Editor`: question library/editor parity (library/public/student queue flows and copy/approve/public controls landed; final parity checks pending).
- `Agent-06 Groups/Video`: group categories + video workflow parity.
- `Agent-07 Realtime/Perf`: realtime routing correctness + perf hardening (question channel sanitization/invalidation hardening, dynamic response-stats privacy refresh, and load harness `npm run test:migration-load` landed).
- `Agent-08 QA/Parity`: smoke/e2e/manual parity + cutover checklist (added dedicated authz integration harness: `npm run test:migration-authz`).

## Release Gate Summary
- Auth + CSRF parity: `in-progress`
- Course/session/question/response/grade parity: `in-progress`
- Realtime correctness under load: `pending`
- DB compatibility (string `_id`, schema safety): `in-progress`
- Full smoke/integration/e2e/load verification: `pending`

## Next Milestone
Close remaining run-session/grading/editor parity deltas (`MIG-021`, `MIG-022`, `MIG-023`) and then run the expanded smoke/integration tranche (`MIG-040`, `MIG-041`) in Docker/CI with latest `master`.

## Reference
See `MIGRATION_DETAILS.md` for parity matrix, detailed backlog, merge protocol, agent packet boundaries, and verification log.

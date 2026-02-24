# Qlicker Migration Status

## Status
- Phase 0 (coordination/docs baseline): `in-progress`
- Phase 1 (contract + security parity): `in-progress`
- Phase 2 (feature parity lanes): `not started`
- Phase 3 (reactivity + performance hardening): `in-progress`
- Phase 4 (verification + cutover readiness): `not started`

## Active Lanes
- `Agent-01 Contracts/Auth`: question enum + option normalization, `/api/questions` authz hardening, route-level parity audit, index bootstrap.
- `Agent-02 Student Session`: student session + quiz interaction parity.
- `Agent-03 Instructor Run`: run-session controls + live workflow parity.
- `Agent-04 Grading`: instructor grading workflow parity.
- `Agent-05 Question Editor`: question library/editor parity.
- `Agent-06 Groups/Video`: group categories + video workflow parity.
- `Agent-07 Realtime/Perf`: realtime routing correctness + perf hardening.
- `Agent-08 QA/Parity`: smoke/e2e/manual parity + cutover checklist.

## Release Gate Summary
- Auth + CSRF parity: `in-progress`
- Course/session/question/response/grade parity: `in-progress`
- Realtime correctness under load: `pending`
- DB compatibility (string `_id`, schema safety): `in-progress`
- Full smoke/integration/e2e/load verification: `pending`

## Next Milestone
Close remaining Phase 1 contract/auth parity gaps (`MIG-010` through `MIG-013`) and continue Phase 3 realtime/perf validation (`MIG-030..033`) before opening the Phase 2 feature lanes.

## Reference
See `MIGRATION_DETAILS.md` for parity matrix, detailed backlog, merge protocol, agent packet boundaries, and verification log.

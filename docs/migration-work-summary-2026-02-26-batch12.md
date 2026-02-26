# Migration Work Summary - 2026-02-26 (Batch 12)

## Merged PRs in this batch
- `#81` feat(migration): deterministic runtime gate preflight + env normalization
- `#82` feat(users): restore promote/canPromote parity
- `#83` feat(migration): configurable docker + legacydb restore workflow
- `#84` feat(client): add global app shell parity and remove dead duplicates

## What changed
- Added shared runtime migration script utilities and deterministic API fingerprint preflight.
- Normalized migration script/runtime env aliases:
  - `API_BASE_URL`, `CLIENT_BASE_URL`, `MONGO_URL`, `MONGO_PORT`.
- Added `/health` API fingerprint metadata and preflight gate stage in `test:migration-gate`.
- Restored legacy promotion capability flows (`users.promote` + `users.toggleCanPromote` equivalents).
- Added admin UI controls for promotion capability and direct user promotion.
- Added local Docker workflow for backup-oriented testing:
  - configurable ports (defaults `3200/3211/27018`)
  - optional legacy backup restore profile
  - one-command startup (`npm run dev:migration:up`)
  - confidentiality guard (`npm run test:migration-legacydb-guard`) and `.dockerignore` exclusion for `legacydb/`.
- Added global authenticated app shell parity elements:
  - course switcher
  - profile menu
  - user guide/logout surfaces
  - promote-account modal trigger
- Removed dead duplicate React page implementations under `pages_impl/`.

## Validation run summary
- `npm run build` (pass)
- `npm run test --workspace=packages/client -- --run` (pass)
- `npm run test:migration-runtime-preflight`:
  - expected fail at wrong `localhost:3001` target (non-Qlicker)
  - pass with `API_BASE_URL=http://localhost:3211`
- `API_BASE_URL=http://localhost:3211 npm run test:migration-smoke` (pass)
- `API_BASE_URL=http://localhost:3211 npm run test:migration-authz` (pass)
- `API_BASE_URL=http://localhost:3211 REALTIME_URL=http://localhost:3211 npm run test:migration-realtime-authz` (pass)
- `API_BASE_URL=http://localhost:3211 npm run test:migration-load` (pass)
- `npm run test:migration-legacydb-guard` (pass)
- `docker compose config` (pass)

## Remaining blockers before pilot sign-off
- Complete strict UI workflow matrix closure on backup dataset (student/prof/admin flows).
- Close final CSV ordering/value parity deltas against Meteor outputs.
- Publish one final staged evidence bundle:
  - runtime gate JSON
  - legacy backup summary + compat/parity reports
  - pilot checklist summary JSON

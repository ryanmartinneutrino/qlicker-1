# DB Compatibility + Parity Testing

This guide is for validating the React/Express stack against an existing Meteor database backup without destructive schema migration.

## 1. Restore a sanitized backup
- Restore Meteor backup to a staging DB, for example `qlicker_legacy_backup`.
- Create a candidate DB copy for new-stack runs, for example `qlicker_candidate`.
- Run the new stack against `qlicker_candidate` only.

## 2. Run compatibility checks on candidate DB
Run field/type compatibility checks (read-only):

```bash
QCLICKER_MONGO_URL='mongodb://localhost:27017/qlicker_candidate?directConnection=true' \
npm run test:migration-db-compat
```

Optional strict mode (warnings fail):

```bash
QCLICKER_DB_COMPAT_STRICT=true \
QCLICKER_DB_COMPAT_OUTPUT=artifacts/db-compat.json \
QCLICKER_MONGO_URL='mongodb://localhost:27017/qlicker_candidate?directConnection=true' \
npm run test:migration-db-compat
```

## 3. Diff baseline vs candidate DBs
Compare key migration collections between baseline and candidate DBs:

```bash
QCLICKER_BASELINE_MONGO_URL='mongodb://localhost:27017/qlicker_legacy_backup?directConnection=true' \
QCLICKER_CANDIDATE_MONGO_URL='mongodb://localhost:27017/qlicker_candidate?directConnection=true' \
QCLICKER_PARITY_OUTPUT=artifacts/db-parity.json \
npm run test:migration-db-parity
```

Fail CI on any differences:

```bash
QCLICKER_PARITY_FAIL_ON_DIFF=true \
QCLICKER_BASELINE_MONGO_URL='mongodb://localhost:27017/qlicker_legacy_backup?directConnection=true' \
QCLICKER_CANDIDATE_MONGO_URL='mongodb://localhost:27017/qlicker_candidate?directConnection=true' \
npm run test:migration-db-parity
```

## 4. Runtime parity gates
After DB compatibility checks pass, run runtime migration checks against the candidate stack:

```bash
npm run test:migration-smoke
npm run test:migration-authz
npm run test:migration-realtime-authz
npm run test:migration-load
```

Or run the orchestrated gate command:

```bash
# Runtime checks only (build + smoke/authz/realtime/load)
npm run test:migration-gate

# Include DB compatibility + baseline/candidate parity diff in one run
QCLICKER_GATE_INCLUDE_DB_COMPAT=true \
QCLICKER_GATE_INCLUDE_DB_PARITY=true \
QCLICKER_BASELINE_MONGO_URL='mongodb://localhost:27017/qlicker_legacy_backup?directConnection=true' \
QCLICKER_CANDIDATE_MONGO_URL='mongodb://localhost:27017/qlicker_candidate?directConnection=true' \
npm run test:migration-gate
```

## Notes
- `test:migration-db-compat` is read-only and checks collection presence, string `_id` compatibility, and key field-type invariants.
- `test:migration-db-parity` compares projected document shapes/values across baseline and candidate DBs and highlights missing/changed docs in sampled IDs.
- Auth/session-store docs must not be written into the course `sessions` collection. The new server stores auth sessions in `authSessions`; if compatibility output flags `sessions._collection` with auth-session docs, treat that as a blocking configuration/data-hygiene issue before parity runs.

# DB Compatibility + Parity Testing

This guide is for validating the React/Express stack against an existing Meteor database backup without destructive schema migration.

## Quick path (local legacy backup in repository)
Bring up local stack with non-conflicting default ports:

```bash
npm run dev:migration:up
```

or restore from mounted legacy backup in the same flow:

```bash
QCLICKER_RESTORE_LEGACY=true \
QCLICKER_LEGACY_BACKUP_DIR='legacydb/backup_2023-09-14_05-03-01' \
npm run dev:migration:up
```

Then export runtime envs expected by migration scripts:

```bash
export API_BASE_URL='http://localhost:3211'
export CLIENT_BASE_URL='http://localhost:3200'
export MONGO_PORT='27018'
export MONGO_URL='mongodb://localhost:27018/qlicker?directConnection=true'
```

If `legacydb/` contains a local mongodump backup, run the automated validator:

```bash
QCLICKER_LEGACY_BACKUP_DIR='legacydb/backup_2023-09-14_05-03-01' \
QCLICKER_LEGACY_MONGO_URI='mongodb://localhost:27018/?directConnection=true' \
npm run test:migration-legacy-backup
```

Optional knobs:
- `QCLICKER_LEGACY_SKIP_RESTORE=true` to reuse existing restored DBs.
- `QCLICKER_DB_COMPAT_STRICT=true` to fail on warnings.
- `QCLICKER_PARITY_FAIL_ON_DIFF=true` to fail on sampled parity diffs.
- `QCLICKER_LEGACY_ARTIFACT_DIR=/tmp/qlicker-migration-artifacts` to control report location.
- `QCLICKER_LEGACY_SUMMARY_OUTPUT=/tmp/qlicker-migration-artifacts/legacy-summary.json` to control the orchestration summary artifact path.

You can also include this stage in the unified gate runner:

```bash
QCLICKER_GATE_SKIP_BUILD=true \
QCLICKER_GATE_SKIP_RUNTIME=true \
QCLICKER_GATE_INCLUDE_LEGACY_BACKUP=true \
QCLICKER_GATE_OUTPUT=/tmp/qlicker-migration-artifacts/migration-gate.json \
QCLICKER_LEGACY_BACKUP_DIR='legacydb/backup_2023-09-14_05-03-01' \
QCLICKER_LEGACY_MONGO_URI='mongodb://localhost:27018/?directConnection=true' \
npm run test:migration-gate
```

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

# Runtime checks with machine-readable gate artifact
QCLICKER_GATE_OUTPUT=artifacts/migration-gate.json \
npm run test:migration-gate

# Include DB compatibility + baseline/candidate parity diff in one run
QCLICKER_GATE_INCLUDE_DB_COMPAT=true \
QCLICKER_GATE_INCLUDE_DB_PARITY=true \
QCLICKER_GATE_OUTPUT=artifacts/migration-gate.json \
QCLICKER_BASELINE_MONGO_URL='mongodb://localhost:27017/qlicker_legacy_backup?directConnection=true' \
QCLICKER_CANDIDATE_MONGO_URL='mongodb://localhost:27017/qlicker_candidate?directConnection=true' \
npm run test:migration-gate
```

## 5. Evidence artifacts
- `test:migration-gate` writes a JSON summary when `QCLICKER_GATE_OUTPUT` is set.
- `test:migration-legacy-backup` always writes:
  - compatibility reports for baseline/candidate DBs
  - parity diff report
  - a summary JSON (default: `<artifactDir>/legacy-backup-summary-<baseline>-vs-<candidate>.json`, overridable via `QCLICKER_LEGACY_SUMMARY_OUTPUT`)
- `test:migration-pilot-checklist` writes a pilot sign-off summary when:
  - `QCLICKER_PILOT_RUNTIME_GATE_JSON` points to runtime gate summary JSON
  - `QCLICKER_PILOT_LEGACY_SUMMARY_JSON` points to legacy-backup summary JSON
  - output path is set via `QCLICKER_PILOT_OUTPUT` (defaults near runtime summary)
- Archive these JSON files in CI/staging for pilot go/no-go evidence.

## 6. GitHub Actions runtime artifact workflow
- Use workflow: `.github/workflows/migration-runtime-gate-artifacts.yml`
- Trigger manually from Actions (`workflow_dispatch`).
- The workflow:
  - brings up MongoDB service and initializes replica set `rs0`
  - builds workspaces
  - seeds migration dataset
  - runs runtime migration gate with artifact output
  - optionally runs legacy-backup validation and pilot checklist summary generation
  - uploads `artifacts/` (including runtime gate JSON, server logs, and optional legacy/pilot summaries)
- Dispatch inputs:
  - `include_realtime_churn`: include realtime churn stage in runtime gate.
  - `include_legacy_backup`: run legacy-backup compat/parity validator.
  - `legacy_backup_dir`: path to mounted backup (required unless `legacy_skip_restore=true`).
  - `legacy_skip_restore`: skip restore and validate against preloaded baseline/candidate DBs.
  - `legacy_backup_namespace`, `legacy_baseline_db`, `legacy_candidate_db`: override default names.

Example local orchestration with explicit pilot checklist artifact:

```bash
QCLICKER_GATE_SKIP_BUILD=true \
QCLICKER_GATE_INCLUDE_LEGACY_BACKUP=true \
QCLICKER_GATE_INCLUDE_PILOT_CHECKLIST=true \
QCLICKER_GATE_OUTPUT=artifacts/migration-gate.json \
QCLICKER_LEGACY_BACKUP_DIR='legacydb/backup_2023-09-14_05-03-01' \
QCLICKER_LEGACY_MONGO_URI='mongodb://localhost:27018/?directConnection=true' \
QCLICKER_LEGACY_SUMMARY_OUTPUT=artifacts/legacy-backup-summary.json \
QCLICKER_PILOT_RUNTIME_GATE_JSON=artifacts/migration-gate.json \
QCLICKER_PILOT_LEGACY_SUMMARY_JSON=artifacts/legacy-backup-summary.json \
QCLICKER_PILOT_OUTPUT=artifacts/pilot-checklist-summary.json \
npm run test:migration-gate
```

## Notes
- `test:migration-db-compat` is read-only and checks collection presence, string `_id` compatibility, and key field-type invariants.
- `test:migration-db-parity` compares projected document shapes/values across baseline and candidate DBs and highlights missing/changed docs in sampled IDs.
- Auth/session-store docs must not be written into the course `sessions` collection. The new server stores auth sessions in `authSessions`; if compatibility output flags `sessions._collection` with auth-session docs, treat that as a blocking configuration/data-hygiene issue before parity runs.

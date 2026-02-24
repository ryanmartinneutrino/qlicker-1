# Migration Cutover and Rollback Runbook

Date: 2026-02-24  
Owner: Agent-08 QA/Parity  
Applies to: Meteor -> React+Express migration cutover

## 1. Preconditions (Go/No-Go)
All must be green before cutover:
- `MIGRATION.md` release gate shows all checks passed.
- `npm run test:migration-smoke` passes in Docker Compose environment.
- `npm run test:migration-authz` passes against seeded environment.
- `npm run test:migration-load` meets threshold targets for p95/error rate.
- Manual checklist (`docs/migration-manual-parity-checklist.md`) signed off.
- Backup/restore validation completed for MongoDB production dataset.

## 2. Freeze Window
1. Announce freeze start and expected duration.
2. Stop non-cutover merges to `master`.
3. Tag final pre-cutover commit:
   - `git checkout master`
   - `git pull`
   - `git tag -a pre-cutover-YYYYMMDD-HHMM -m "Pre-cutover snapshot"`
   - `git push origin --tags`

## 3. Pre-Cutover Backups
1. Capture Mongo backup and verify artifact integrity.
2. Export environment configuration snapshot (without secrets in logs).
3. Record app version, compose image hashes, and branch/commit IDs.

## 4. Cutover Steps
1. Deploy target `master` build to staging-like production environment.
2. Run health checks:
   - `curl -i http://<host>/health`
   - `curl -i http://<host>/api/csrf-token`
3. Execute smoke tests against deployed endpoint:
   - `QCLICKER_BASE_URL=http://<host> npm run test:migration-smoke`
4. Validate core real-time paths with two browser sessions (prof/student):
   - live question updates
   - stats/correct visibility toggles
   - response/grade visibility behavior
5. Switch traffic to new stack.
6. Monitor first 30 minutes continuously.

## 5. Monitoring During Cutover
Track at 1m/5m intervals:
- HTTP error rates by route group (`/api/auth`, `/api/sessions`, `/api/questions`, `/api/responses`, `/api/grades`).
- p95 latency for hot endpoints.
- Socket connection count and reconnect/error rates.
- Mongo query latency and change stream health.

## 6. Rollback Triggers
Rollback immediately if any are true:
- sustained elevated 5xx or auth failures.
- CSRF/login/logout instability for >5 minutes.
- data integrity issues (write/read mismatch or cross-course leakage).
- unacceptable real-time correctness regressions.

## 7. Rollback Procedure
1. Stop routing traffic to new stack.
2. Re-route traffic to last stable Meteor deployment.
3. If needed, restore MongoDB from validated pre-cutover backup.
4. Verify Meteor smoke checks and login/session behavior.
5. Publish incident update with timeline and impact.

## 8. Post-Cutover Tasks
1. Keep freeze for defined stabilization period.
2. Run extended load check:
   - `QCLICKER_BASE_URL=http://<host> npm run test:migration-load`
3. Complete final sign-off in:
   - `MIGRATION.md`
   - `MIGRATION_DETAILS.md`
   - `docs/migration-manual-parity-checklist.md`
4. Create post-cutover retrospective and remaining backlog list.

## 9. Ownership Matrix
- Cutover coordinator: migration lead
- API verification: Agent-01 + Agent-08
- Realtime verification: Agent-07
- Feature parity verification: Agent-02/03/04/05/06
- Rollback authority: coordinator + ops owner

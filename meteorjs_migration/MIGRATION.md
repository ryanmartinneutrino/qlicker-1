# Qlicker Migration Status

> The MeteorJS → Fastify/React migration is effectively complete. The new app is running in production. This file now tracks only the small amount of work still outstanding. Historical detail lives in [MIGRATION_COMPLETED.md](MIGRATION_COMPLETED.md).

## Current state

- Fastify backend and React frontend are the active application stack.
- The app runs against the legacy MongoDB schema and has been validated against real production data and SSO.
- Core classroom workflows are complete: auth, SSO, courses, sessions, quizzes, grading, groups, video chat, backups, deployment tooling, and load testing.
- The legacy MeteorJS source has been removed from this repository; only the migration archive remains here.

## Remaining work

- [ ] **Complete the production S3 private-bucket cutover.** The rewrite tooling is ready; the remaining work is the production validation window and final bucket lockdown. See [../production_setup/README.md](../production_setup/README.md#s3-private-bucket-migration).
- [ ] **Decide whether to add GitHub Actions in the new repository.** Helpful, but no longer a blocker for production use.
- [ ] **Add audit logging for admin-sensitive changes** if operational requirements call for it (settings, role, and grading changes).
- [ ] **Have a native French speaker review the remaining identical en/fr strings** before treating the French locale as fully polished.

## Resolved follow-up decisions

- Legacy `users.services.password.reset.*` tokens are **not** being migrated. The Fastify app uses `services.resetPassword`, and any pending legacy reset tokens should simply be replaced by issuing a fresh reset after cutover if needed.
- `meteor_accounts_loginServiceConfiguration` does **not** need migration. The observed legacy collection is empty and there is no Fastify model for it.
- The earlier note about encrypted SAML assertions with production certificates has been removed. The production IdP flow has been tested successfully, and there is no additional action to take unless the institution changes IdP behavior in the future.

## Production notes worth keeping visible

- Private-bucket S3 transition is the only remaining migration item that still affects the live production rollout.
- Production deployment guidance lives in [../production_setup/README.md](../production_setup/README.md).
- Legacy database compatibility notes live in [LEGACY_DB.md](LEGACY_DB.md).
- Future implementation conventions live in [../CODING_STANDARDS.md](../CODING_STANDARDS.md).

## Validation commands

```bash
cd /home/runner/work/qlicker-1/qlicker-1/server && npm test
cd /home/runner/work/qlicker-1/qlicker-1/client && npm test
cd /home/runner/work/qlicker-1/qlicker-1/client && npm run build
```

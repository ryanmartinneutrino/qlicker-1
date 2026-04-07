# Development Guide

This guide explains how to work on the current Fastify + React Qlicker codebase.

## Local development

### Install dependencies

```bash
cd server && npm install
cd client && npm install
```

### Run the app

Use the repository scripts when possible:

```bash
./scripts/setup-native.sh
./scripts/qlicker.sh start
```

Or run the two app halves manually:

```bash
cd server && npm run dev
cd client && npm run dev
```

## Testing and verification

Verified commands for the current repository:

```bash
cd server && npm test
cd client && npm test
cd client && npm run build
```

Playwright E2E coverage is available with:

```bash
./scripts/qlicker.sh e2e
# or
cd client && npm run test:e2e
```

## How to approach a change

1. Read `meteorjs_migration/MIGRATION.md` if the work touches migration-phase promises.
2. Read `CODING_STANDARDS.md` for project conventions.
3. Find the user role and route area the change belongs to.
4. Identify the server route, service, and model impact.
5. Add or update tests near the changed behavior.
6. Re-run targeted validation and then broader validation as needed.

## Common implementation locations

### Add or change a frontend page

Look in:

- `client/src/pages/...`
- `client/src/components/...`
- `client/src/contexts/...`
- `client/src/i18n/locales/*.json`

### Add or change an API route

Look in:

- `server/src/routes/...`
- `server/src/services/...`
- `server/src/models/...`
- `server/test/routes/...`
- `docs/api-reference.md`

### Add or change real-time behavior

Look in:

- `server/src/routes/sessions.js`
- `server/src/routes/websocket.js` or websocket helpers in the app
- client pages or contexts that subscribe to live updates

### Add or change grading behavior

Look in:

- `server/src/services/grading.js`
- `server/src/routes/grades.js`
- `server/src/routes/sessions.js`
- `client/src/components/grades/...`
- `docs/developer/grading.md`

## Documentation expectations

When you change visible behavior, update the related docs:

- user-facing workflow changes -> `docs/user-manual/`
- developer-facing architecture/data/API changes -> `docs/developer/` and `docs/api-reference.md`
- deployment or ops changes -> `production_setup/README.md`

## Security and operational expectations

The current app includes:

- JWT access tokens plus refresh-cookie workflows
- CSRF/CORS enforcement
- auth lockout after repeated failures
- file-upload validation
- WebSocket and upload rate limiting
- optional Redis fan-out for multi-instance WebSocket delivery
- SAML login/logout support

When you touch auth, uploads, settings, or WebSockets, re-check the relevant protections rather than assuming they stay correct automatically.

Two current implementation details are easy to miss:

- runtime storage selection is database-driven (`Settings.storageType`) and defaults to local until an admin changes it in the UI
- auth-related settings such as SSO enablement, SAML advanced options, token/session lifetime, upload width, and avatar thumbnail size should take effect immediately after save, so avoid adding caches that delay those changes

## Useful companion docs

- [`../../README.md`](../../README.md)
- [`../../CODING_STANDARDS.md`](../../CODING_STANDARDS.md)
- [`../../meteorjs_migration/MIGRATION.md`](../../meteorjs_migration/MIGRATION.md)
- [`../../meteorjs_migration/LEGACY_DB.md`](../../meteorjs_migration/LEGACY_DB.md)
- [`../../production_setup/README.md`](../../production_setup/README.md)
- [`../api-reference.md`](../api-reference.md)

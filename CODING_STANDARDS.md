# Qlicker Coding Standards

> Use this file as the default guide for any future work on Qlicker.

## 1. General expectations

- Keep changes small, direct, and easy to review.
- Preserve compatibility with the existing MongoDB data model unless a change is explicitly planned and documented.
- Prefer extending existing server routes, client components, and utilities over introducing parallel patterns.
- Update the relevant documentation when behavior, setup, or operations change.

## 2. Architecture defaults

- **Backend:** Fastify, ES modules, Mongoose, JWT auth, WebSockets.
- **Frontend:** React 19, Vite, Material UI, Axios, react-i18next.
- **Realtime:** WebSocket deltas first; polling only where a clear reason remains.
- **Deployment:** development can be native or Docker; production uses `production_setup/`.

## 3. Keep the app fast

- Prefer **delta WebSocket updates** over broad refetches, especially for live sessions, session chat, and course/session status changes.
- Do not add new work that forces every client to reload full live-session payloads when a targeted delta can keep state in sync.
- Keep query costs down: use lean reads, field selection, batching, and existing cached/derived data patterns where appropriate.
- Treat live-session responsiveness as a product requirement, not a later optimization.

## 4. Backend conventions

- Add or extend routes under `server/src/routes/`.
- Keep business rules in services/utilities when route handlers would otherwise become large or repetitive.
- Match the existing API error shape: `{ error, message }`.
- Validate request bodies with Fastify schema support when adding new endpoints.
- Reuse existing auth helpers and role checks rather than open-coding permission logic.

## 5. Frontend conventions

- Use Material UI components and the `sx` prop instead of introducing new UI systems.
- Reuse existing shared components before creating new variants.
- Keep route-level pages under `client/src/pages/` and reusable pieces under `client/src/components/`.
- Use the shared API client and existing data-fetching patterns.

## 6. i18n is required

- All user-facing strings must go through `t()`.
- Add new translation keys to both English and French locale files together.
- Do not leave new English-only labels, placeholders, dialog text, or aria labels in the code.
- When changing UX copy, check whether related manual or README text also needs an update.

## 7. Accessibility is required

- Preserve keyboard access for dialogs, menus, tabs, tables, and live-session controls.
- Label interactive controls clearly, including icon-only buttons.
- Keep semantic structure intact: headings, lists, table headers, form labels, and live-region behavior should remain meaningful.
- Any new UI should be checked with accessibility in mind before it is considered done.

## 8. Security expectations

- Do not weaken auth, rate limiting, token handling, or SSO behavior without a documented reason.
- Keep CSP-sensitive and HTML-rendering paths aligned with the existing sanitization patterns.
- Treat uploads, external URLs, and any user-controlled HTML as hostile until validated/sanitized.
- Follow the production patterns already established in `production_setup/`.

## 9. Testing and validation

Run the existing project commands before and after meaningful changes:

```bash
cd /home/runner/work/qlicker-1/qlicker-1/server && npm test
cd /home/runner/work/qlicker-1/qlicker-1/client && npm test
cd /home/runner/work/qlicker-1/qlicker-1/client && npm run build
```

Use the existing Playwright coverage when a change affects end-to-end behavior:

```bash
cd /home/runner/work/qlicker-1/qlicker-1/client && npm run test:e2e
```

## 10. Documentation to keep aligned

- Product and setup overview: [README.md](README.md)
- Remaining migration items: [meteorjs_migration/MIGRATION.md](meteorjs_migration/MIGRATION.md)
- Completed migration archive: [meteorjs_migration/MIGRATION_COMPLETED.md](meteorjs_migration/MIGRATION_COMPLETED.md)
- Legacy schema details: [meteorjs_migration/LEGACY_DB.md](meteorjs_migration/LEGACY_DB.md)
- Production operations: [production_setup/README.md](production_setup/README.md)

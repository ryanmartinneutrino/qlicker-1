# API Reference

Qlicker exposes interactive API documentation directly from the Fastify server.

## Live docs

When the backend is running locally:

- Swagger UI: `http://localhost:3001/docs`
- OpenAPI JSON: `http://localhost:3001/docs/json`

## Route groups

The current app exposes route groups for:

- **Auth**: registration, login, logout, refresh, forgot/reset password, email verification, SSO
- **Users**: profile, password changes, admin user management
- **Courses**: CRUD, enrollment, instructors, students, course settings, session listing
- **Sessions**: CRUD, live sessions, quiz payloads, review payloads, join-code settings, question ordering, import/export
- **Questions**: library CRUD, visibility, copying, import/export helpers
- **Grades**: course grades, session grades, recalculation, feedback and manual overrides, CSV export
- **Groups**: group categories, membership, CSV import/export
- **Video**: Jitsi availability and course/group connection data
- **Images**: image upload and deletion
- **Settings**: public settings and admin-only configuration
- **Health / docs**: service health and generated API docs

## WebSocket events

The app also exposes live updates over WebSocket at `/ws`.

Important event families include:

- `session:question-changed`
- `session:question-updated`
- `session:response-added`
- `session:attempt-changed`
- `session:participant-joined`
- `session:join-code-changed`
- `session:status-changed`
- `session:visibility-changed`
- `session:updated`
- `session:quiz-submitted`
- `video:updated`

These power live-session dashboards, session review refreshes, and course-page freshness.

## How the OpenAPI docs are generated

Qlicker uses:

- `@fastify/swagger`
- `@fastify/swagger-ui`
- route-level JSON schema definitions
- shared transform helpers that infer tags, auth metadata, and path parameters

## Updating the docs when you add or change routes

1. Define or update the route schema in the Fastify route module.
2. Keep request bodies, query strings, and path parameters documented in schema.
3. Verify the route appears correctly in `/docs`.
4. If the route changes how developers integrate with the app, update this file and any related developer docs.

## Local verification workflow

A good verification sequence is:

```bash
cd server && npm test
cd client && npm test
cd client && npm run build
```

Then open `/docs` and confirm the changed route shape matches the real handler behavior.

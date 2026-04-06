# Application Architecture Overview

Qlicker is a React 19 single-page application backed by a Fastify 5 API server. The new app preserves compatibility with the legacy Meteor database while moving user-facing behavior to REST and WebSocket APIs.

## High-level architecture

```text
Browser (React + MUI + Vite)
  ├─ Auth context + protected routes
  ├─ Role-specific pages (admin / professor / student)
  ├─ Rich text editing, grading, review, library, and live-session UIs
  └─ REST + WebSocket client communication

Fastify server
  ├─ JWT auth, refresh cookies, CSRF/CORS enforcement
  ├─ REST route modules (auth, users, courses, sessions, questions, grades, groups, video, images, settings)
  ├─ WebSocket transport for live-session deltas
  ├─ Services for grading, copying, histogram and word-frequency generation
  └─ OpenAPI generation via Fastify Swagger

MongoDB
  ├─ Legacy-compatible documents
  ├─ Mongoose schemas and indexes
  └─ Session, response, grade, and question persistence

Optional infrastructure
  ├─ Redis pub/sub for multi-instance WebSocket fan-out
  ├─ S3 / Azure / local image storage
  ├─ SAML identity provider integration
  └─ Docker Compose + Nginx production deployment
```

## Repository layout

```text
qlicker-1/
├── client/                # React frontend (pages, components, contexts, i18n)
├── server/                # Fastify backend (routes, models, services, config)
├── docs/                  # User and developer documentation
├── production_setup/      # Production deployment and operations scripts
├── scripts/               # Dev setup, local control, and seed helpers
├── ssoserver/             # Local SimpleSAMLphp smoke-test environment
├── meteorjs_migration/    # Migration archive, status, and legacy DB notes
└── CODING_STANDARDS.md    # Coding conventions and API patterns
```

## Frontend structure

Important frontend entry points:

- `client/src/App.jsx` defines route structure and protected routes.
- `client/src/contexts/AuthContext.jsx` manages current-user auth state.
- `client/src/pages/admin/` contains admin workflows.
- `client/src/pages/professor/` contains instructor workflows such as course detail, session editor, live session, and review.
- `client/src/pages/student/` contains student workflows such as dashboard, course detail, live session, quiz, review, and practice sessions.
- `client/src/components/` contains reusable UI building blocks and feature panels such as grading, question-library, groups, and video.
- `client/src/i18n/` contains locale files and translation configuration.

## Backend structure

Important backend areas:

- `server/src/app.js` wires the Fastify application together.
- `server/src/routes/` contains route modules by feature area.
- `server/src/models/` contains the Mongoose schemas.
- `server/src/services/` contains reusable business logic such as grading and question/session copy behavior.
- `server/src/utils/` contains lower-level helpers such as histogram calculation.
- `server/test/` contains route and service tests.

## Role-oriented page model

The current app is intentionally role-oriented:

- **Admin routes** handle platform configuration and support.
- **Professor routes** handle course management, session authoring, live delivery, review, and grading.
- **Student routes** handle participation, quizzes, review, and practice.

This is useful when adding features because it helps determine:

- where navigation should live
- which permissions apply
- which API payloads can be safely returned to the client

## Real-time behavior

Live-session and dashboard freshness rely on WebSocket events where available, with polling fallback logic for some client views.

Examples of real-time updates include:

- session status changes
- current-question changes
- response-count updates
- visibility changes
- participant joins
- quiz submission refreshes

Redis can fan these events out across multiple app instances in production.

## Documentation and API generation

The API docs are generated from Fastify route schema definitions and exposed by the backend at `/docs` and `/docs/json`.

When adding a new route, the architecture expectation is:

1. define request and response schema
2. enforce permissions in the route
3. keep client code role-aware
4. add tests for the changed behavior
5. verify `/docs` still describes the route correctly

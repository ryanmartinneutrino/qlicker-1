# Realtime Design (React/Express)

## Architecture
- One MongoDB Change Stream per collection (`courses`, `sessions`, `questions`, `responses`, `grades`).
- Shared event fan-out via `SharedChangeStream` keyed routing.
- Clients subscribe with `subscribe:*` socket events and receive `*:change` updates.

## Auth model
- Socket handshake now runs through:
  - Express `session` middleware
  - `passport.initialize()`
  - `passport.session()`
- Subscription handlers load authenticated user and authorize by course membership/instructor role.
- Auth failures now emit structured `subscription:error` payloads (`event`, `code`, `message`) instead of silent drops.

## Routing keys
- wildcard: `<collection>:*`
- document: `<collection>:<id>`
- parent-scoped when `fullDocument` exists:
  - `<collection>:session:<sessionId>`
  - `<collection>:course:<courseId>`
  - `<collection>:question:<questionId>`

## Delete events
- delete events rely on `documentKey` and may not include parent identifiers.
- current strategy uses a bounded in-memory parent-key cache (`sessionId/courseId/questionId`) learned from prior insert/update events so delete routing can remain scoped.
- fallback still includes document-level and collection wildcard keys to avoid missed invalidations when parent hints are unavailable.

## Remaining work
- keep runtime test environments deterministic with API fingerprint preflight:
  - `npm run test:migration-runtime-preflight`
- maintain reconnect/churn evidence under load:
  - `npm run test:migration-realtime-churn`
  - optional unified-gate stage via `QCLICKER_GATE_INCLUDE_REALTIME_CHURN=true`
- run subscription-level negative test suite in CI (`test:migration-realtime-authz`)
- load-test validation at target concurrency

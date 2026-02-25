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
- current strategy forwards collection-level delete events to scoped subscribers to keep client collections in sync.
- future enhancement: pre-image routing or parent cache for exact scoped delete routing.

## Remaining work
- reconnect/resubscribe robustness metrics under churn/disconnect scenarios
- run subscription-level negative test suite in CI (`test:migration-realtime-authz`)
- load-test validation at target concurrency

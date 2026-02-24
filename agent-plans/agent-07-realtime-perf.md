# Agent-07 — Realtime & Performance (MIG-030..033)

## Scope
- Deduplicate realtime fan-out behavior.
- Enforce subscription authorization on all channels.
- Optimize hot queries/payloads and document load-test outcomes.

## Current Batch (2026-02-24)
- Add explicit subscribe/unsubscribe pairing for collection channels.
- Add per-socket subscription dedup so re-subscribing the same route key replaces old listeners.
- Add delete-event routing by `documentKey._id` and client-side upsert semantics to avoid duplicate rows.

## Primary files
- `packages/server/src/realtime/*`
- `packages/client/src/hooks/useRealtimeCollection.ts`
- Perf/load scripts and docs.

## Must not edit
- Feature UX files unless needed for telemetry/performance instrumentation.

## Acceptance
- One logical update emitted per DB change per subscription channel.
- Unauthorized realtime subscriptions are rejected.
- Performance metrics documented.

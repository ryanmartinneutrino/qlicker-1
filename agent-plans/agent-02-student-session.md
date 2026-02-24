# Agent-02 — Student Session Parity (MIG-020)

## Scope
- Restore student session behavior parity: attempts, submit flow, visibility/correct/stats controls.
- Use shared question/response components consistently.

## Current Batch (2026-02-24)
- Wire `Session.tsx` to live session updates (`subscribe:session`) and question-level response subscriptions.
- Restore non-quiz student submission flow with attempt-aware updates and stats rendering.
- Restore quiz flow in `Session.tsx`: per-question attempts, retry toggles, and quiz submit gating.
- Use `/api/responses/session/:sessionId/me` for session-wide student response hydration.

## Primary files
- `packages/client/src/pages/{Session,ReplaySession,SessionResults}.tsx`
- Related components/hooks used by student quiz/session flows.

## Must not edit
- Server auth middleware and shared contract files.

## Acceptance
- Student session lifecycle matches Meteor behavior for MC/TF/SA/MS/NU.
- No regression in sanitization and reactive updates.

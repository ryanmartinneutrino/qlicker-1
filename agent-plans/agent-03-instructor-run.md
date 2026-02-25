# Agent-03 — Instructor Run-Session Parity (MIG-021)

## Scope
- Restore instructor run-session controls and live workflow parity.
- Ensure session status/current question behavior aligns with legacy expectations.

## Current Batch (2026-02-24)
- Expand `RunSession.tsx` controls: hide/show question, show/hide stats, show/hide correct.
- Implement attempt controls: allow/disallow responses and create new attempt on current question.
- Add live counts for joined students and responses per current attempt.
- Restore presentation mode and second-display launch behavior.

## Primary files
- `packages/client/src/pages/{RunSession,ManageSession}.tsx`
- Supporting instructor control components.

## Must not edit
- Shared enum/type contracts.

## Acceptance
- Instructor controls and live state transitions match Meteor behavior.
- Reactive updates remain correct under concurrent use.

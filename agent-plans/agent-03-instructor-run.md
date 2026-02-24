# Agent-03 — Instructor Run-Session Parity (MIG-021)

## Scope
- Restore instructor run-session controls and live workflow parity.
- Ensure session status/current question behavior aligns with legacy expectations.

## Primary files
- `packages/client/src/pages/{RunSession,ManageSession}.tsx`
- Supporting instructor control components.

## Must not edit
- Shared enum/type contracts.

## Acceptance
- Instructor controls and live state transitions match Meteor behavior.
- Reactive updates remain correct under concurrent use.

# Agent-02 — Student Session Parity (MIG-020)

## Scope
- Restore student session behavior parity: attempts, submit flow, visibility/correct/stats controls.
- Use shared question/response components consistently.

## Primary files
- `packages/client/src/pages/{Session,ReplaySession,SessionResults}.tsx`
- Related components/hooks used by student quiz/session flows.

## Must not edit
- Server auth middleware and shared contract files.

## Acceptance
- Student session lifecycle matches Meteor behavior for MC/TF/SA/MS/NU.
- No regression in sanitization and reactive updates.

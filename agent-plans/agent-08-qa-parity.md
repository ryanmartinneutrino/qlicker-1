# Agent-08 — QA/Parity Gate (MIG-040..044)

## Scope
- Expand smoke tests and add integration/e2e parity coverage.
- Execute and document manual parity checklist.
- Produce cutover checklist and rollback runbook.

## Current Batch (2026-02-24)
- Extend smoke checks for persisted course-group workflows (category/group create/toggle/delete).
- Extend smoke checks for `/api/questions` student visibility parity in sessions.
- Keep smoke assertions aligned with tightened question-library authorization.

## Primary files
- `scripts/migration-smoke.mjs`
- Integration/e2e test suites
- Migration verification docs/checklists

## Must not edit
- Production route logic except explicitly approved test hooks.

## Acceptance
- Smoke + integration + e2e suites pass.
- Manual parity checklist completed.
- Cutover/rollback runbooks are release-ready.

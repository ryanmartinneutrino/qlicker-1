# Agent 05 — Integration & Parity Test Harness

## Scope
- Expand seeded dataset for:
  - sessions
  - questions
  - responses
  - grades
- Add automated parity smoke tests for core roles:
  - student
  - professor
  - admin

## Acceptance criteria
- One-command local verification for major workflows.
- Tests run against Mongo replica-set and existing schema.

## Mandatory checks
- `./seed-mock-db.sh`
- build all workspaces
- execute integration smoke suite

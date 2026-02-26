# Migration Multi-Lane Runbook

This directory tracks parallel migration lane execution.

## Active lane docs
- `lane-01-authz.md`
- `lane-02-session-question-parity.md`
- `lane-03-course-groups-parity.md`
- `lane-04-grades-results-exports.md`
- `lane-05-realtime.md`
- `lane-06-media-video.md`
- `lane-07-db-compat-fixtures.md`
- `lane-08-integration-cutover.md`

Legacy `agent-*` packet files are retained only as historical context and are no longer the assignment source of truth.

## Assignment model
1. Launch worktrees via `./launch-migration-agents.sh` when running concurrent lanes.
2. Assign one active lane doc per agent branch/PR.
3. Require each lane PR to include:
   - completed checklist items from its lane doc
   - parity/security evidence commands + outputs
   - references to updated migration docs (`MIGRATION.md`, parity/security/realtime docs)

## Merge protocol
1. Merge security/runtime determinism lanes first (`L1`, `L5`).
2. Merge feature-parity lanes next (`L2`, `L3`, `L4`, `L6`) behind safe defaults when incomplete.
3. Merge compatibility/ops lanes last (`L7`, `L8`).
4. Keep one rolling summary PR open for operator review between major batches.

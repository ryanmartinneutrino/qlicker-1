# Migration Multi-Agent Runbook

This directory contains packet files for the current migration topology.

## Packets
- `agent-01-contracts-auth.md`
- `agent-02-student-session.md`
- `agent-03-instructor-run.md`
- `agent-04-grading.md`
- `agent-05-question-editor.md`
- `agent-06-groups-video.md`
- `agent-07-realtime-perf.md`
- `agent-08-qa-parity.md`

## Assignment model
1. Launch worktrees via `./launch-migration-agents.sh`.
2. Assign exactly one packet to each agent.
3. Require every PR to include:
   - Completed `MIG-*` task IDs.
   - Verified Meteor behaviors matched.
   - Commands + results used for validation.
   - `MIGRATION_DETAILS.md` lane status updates.

## Merge protocol
- `Agent-01` first.
- `Agent-05` second.
- `Agent-02`/`03`/`04`/`06` with rebases after each merge.
- `Agent-07` once feature lanes stabilize.
- `Agent-08` last as verification gate.

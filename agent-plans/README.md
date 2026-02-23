# Migration Multi-Agent Runbook

This folder contains ready-to-use task packets for parallel migration work.

## Agents
- `agent-01-questions-editor.md`
- `agent-02-quiz-session-parity.md`
- `agent-03-profile-image-upload.md`
- `agent-04-video-chat-parity.md`
- `agent-05-integration-parity-tests.md`

## Suggested operating model
1. Create one git worktree per agent task branch.
2. Assign exactly one packet per agent.
3. Require each agent to:
   - keep `MIGRATION.md` updated for its domain,
   - run package builds/tests relevant to changed code,
   - include screenshots for visual changes.

## Quick launch
Use `./launch-migration-agents.sh` to create local worktrees and branch names for each packet.

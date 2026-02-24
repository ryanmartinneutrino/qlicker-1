#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKTREE_DIR="$ROOT_DIR/.agent-worktrees"
mkdir -p "$WORKTREE_DIR"

agents=(
  "agent-01/contracts-auth"
  "agent-02/student-session"
  "agent-03/instructor-run"
  "agent-04/grading"
  "agent-05/question-editor"
  "agent-06/groups-video"
  "agent-07/realtime-perf"
  "agent-08/qa-parity"
)

for entry in "${agents[@]}"; do
  id="${entry%%/*}"
  slug="${entry##*/}"
  branch="migration/${id}-${slug}"
  target="$WORKTREE_DIR/${id}-${slug}"

  if git show-ref --verify --quiet "refs/heads/$branch"; then
    echo "[skip] branch exists: $branch"
  else
    git branch "$branch"
    echo "[ok] created branch: $branch"
  fi

  if [[ -d "$target/.git" ]] || [[ -f "$target/.git" ]]; then
    echo "[skip] worktree exists: $target"
  else
    git worktree add "$target" "$branch"
    echo "[ok] created worktree: $target"
  fi
done

echo
printf "Agent worktrees are ready in: %s\n" "$WORKTREE_DIR"
echo "Assign each agent one packet from agent-plans/*.md"

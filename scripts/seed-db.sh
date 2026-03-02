#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load .env if it exists so MONGO_URI is available
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$PROJECT_ROOT/.env"
  set +a
fi

if [ -z "${MONGO_URI:-}" ]; then
  if [ -n "${MONGO_PORT:-}" ]; then
    MONGO_URI="mongodb://localhost:${MONGO_PORT}/qlicker"
  else
    echo "MONGO_URI or MONGO_PORT must be set in .env"
    exit 1
  fi
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

db_name_from_uri() {
  local uri="$1"
  local no_query="${uri%%\?*}"
  local db_name="${no_query##*/}"
  if [ -z "$db_name" ] || [ "$db_name" = "$no_query" ]; then
    db_name="qlicker"
  fi
  printf '%s\n' "$db_name"
}

confirm_action() {
  local prompt="$1"
  local answer
  read -r -p "$prompt [y/N]: " answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

find_legacy_candidates() {
  local legacy_root="$PROJECT_ROOT/legacydb"
  if [ ! -d "$legacy_root" ]; then
    return 0
  fi

  find "$legacy_root" -type f -name '*.bson' -exec dirname {} \; \
    | sort -u \
    | while IFS= read -r dir; do
        if find "$dir" -maxdepth 1 -type f -name '*.bson' ! -name 'oplog.bson' | grep -q .; then
          printf '%s\n' "$dir"
        fi
      done \
    | sort -u
}

SELECTED_LEGACY_DIR=""

select_legacy_directory() {
  mapfile -t candidates < <(find_legacy_candidates)
  if [ "${#candidates[@]}" -eq 0 ]; then
    echo "No mongodump database directories found under legacydb/."
    return 1
  fi

  if [ "${#candidates[@]}" -eq 1 ]; then
    SELECTED_LEGACY_DIR="${candidates[0]}"
    echo "Using legacy dump: ${SELECTED_LEGACY_DIR#$PROJECT_ROOT/}"
    return 0
  fi

  echo "Found legacy dump directories:"
  for i in "${!candidates[@]}"; do
    echo "  $((i + 1))) ${candidates[$i]#$PROJECT_ROOT/}"
  done

  while true; do
    local choice
    read -r -p "Choose a directory [1-${#candidates[@]}]: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#candidates[@]}" ]; then
      SELECTED_LEGACY_DIR="${candidates[$((choice - 1))]}"
      return 0
    fi
    echo "Invalid choice."
  done
}

run_seed() {
  echo "Running database seed..."
  node "$SCRIPT_DIR/seed-db.js" "$@"
}

reset_to_empty() {
  require_command mongosh
  local target_db
  target_db="$(db_name_from_uri "$MONGO_URI")"

  if ! confirm_action "This will drop all data in '$target_db' at $MONGO_URI. Continue?"; then
    echo "Canceled."
    return 0
  fi

  mongosh "$MONGO_URI" --quiet --eval 'db.dropDatabase()' >/dev/null
  echo "Database '$target_db' reset to empty."
}

restore_legacy_dump() {
  require_command mongorestore
  if ! select_legacy_directory; then
    return 1
  fi

  local source_db target_db
  source_db="$(basename "$SELECTED_LEGACY_DIR")"
  target_db="$(db_name_from_uri "$MONGO_URI")"

  echo "Restore source database: $source_db"
  echo "Restore target database: $target_db"

  if ! confirm_action "This will overwrite all data in '$target_db'. Continue?"; then
    echo "Canceled."
    return 0
  fi

  mongorestore \
    --drop \
    --uri="$MONGO_URI" \
    --db="$target_db" \
    "$SELECTED_LEGACY_DIR"

  echo "Legacy restore complete."
}

interactive_menu() {
  echo "Select database action:"
  echo "  1) Seed with test users"
  echo "  2) Restore from legacy dump"
  echo "  3) Reset database to empty"

  local choice
  read -r -p "Enter choice [1-3]: " choice

  case "$choice" in
    1)
      if confirm_action "Reset database before seeding test users?"; then
        run_seed --reset
      else
        run_seed
      fi
      ;;
    2)
      restore_legacy_dump
      ;;
    3)
      reset_to_empty
      ;;
    *)
      echo "Invalid choice."
      exit 1
      ;;
  esac
}

if [ "$#" -gt 0 ]; then
  case "$1" in
    --legacy-restore)
      restore_legacy_dump
      ;;
    --reset-empty)
      reset_to_empty
      ;;
    *)
      run_seed "$@"
      ;;
  esac
else
  interactive_menu
fi

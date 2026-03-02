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

uri_without_db_from_uri() {
  local uri="$1"
  local base="${uri%%\?*}"
  local query=""
  if [ "$base" != "$uri" ]; then
    query="?${uri#*\?}"
  fi

  if [[ "$base" =~ ^(mongodb(\+srv)?://[^/]+)/[^/]+$ ]]; then
    printf '%s%s\n' "${BASH_REMATCH[1]}" "$query"
    return 0
  fi

  printf '%s%s\n' "$base" "$query"
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

  find "$legacy_root" -type f -name '*.bson' ! -name 'oplog.bson' \
    | while IFS= read -r file; do
        local rel top
        rel="${file#$legacy_root/}"
        top="${rel%%/*}"
        if [ "$top" != "$rel" ]; then
          printf '%s\n' "$legacy_root/$top"
        fi
      done \
    | sort -u
}

is_system_database_name() {
  case "$1" in
    admin|local|config)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

list_dump_databases() {
  local dump_root="$1"
  find "$dump_root" -mindepth 1 -maxdepth 1 -type d \
    | while IFS= read -r db_dir; do
        if find "$db_dir" -maxdepth 1 -type f -name '*.bson' | grep -q .; then
          basename "$db_dir"
        fi
      done \
    | sort -u
}

pick_primary_app_database() {
  local db_name
  for db_name in "$@"; do
    if ! is_system_database_name "$db_name"; then
      printf '%s\n' "$db_name"
      return 0
    fi
  done
  if [ "$#" -gt 0 ]; then
    printf '%s\n' "$1"
    return 0
  fi
  return 1
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

  local target_db restore_uri primary_source_db db_name restore_db
  local -a dump_databases

  mapfile -t dump_databases < <(list_dump_databases "$SELECTED_LEGACY_DIR")
  if [ "${#dump_databases[@]}" -eq 0 ]; then
    echo "No database directories found in selected dump."
    return 1
  fi

  if ! primary_source_db="$(pick_primary_app_database "${dump_databases[@]}")"; then
    echo "Unable to determine primary application database in selected dump."
    return 1
  fi

  target_db="$(db_name_from_uri "$MONGO_URI")"
  restore_uri="$(uri_without_db_from_uri "$MONGO_URI")"

  echo "Restore dump: ${SELECTED_LEGACY_DIR#$PROJECT_ROOT/}"
  echo "Databases in dump: ${dump_databases[*]}"
  echo "Primary application database: $primary_source_db"
  echo "Restore target database: $target_db"

  if ! confirm_action "This will overwrite all data in '$target_db'. Continue?"; then
    echo "Canceled."
    return 0
  fi

  for db_name in "${dump_databases[@]}"; do
    restore_db="$db_name"
    if [ "$db_name" = "$primary_source_db" ]; then
      restore_db="$target_db"
    fi

    echo "Restoring database '$db_name' -> '$restore_db'..."
    mongorestore \
      --drop \
      --uri="$restore_uri" \
      --db="$restore_db" \
      "$SELECTED_LEGACY_DIR/$db_name"
  done

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
      run_seed
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
    --reset)
      run_seed --reset
      ;;
    --reset-empty)
      reset_to_empty
      ;;
    --menu)
      interactive_menu
      ;;
    *)
      run_seed "$@"
      ;;
  esac
else
  run_seed
fi

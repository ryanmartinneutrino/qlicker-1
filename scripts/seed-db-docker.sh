#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load .env if present
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$PROJECT_ROOT/.env"
  set +a
fi

SERVER_CONTAINER="$(docker compose ps -q server 2>/dev/null | head -1)"
MONGO_CONTAINER="$(docker compose ps -q mongo 2>/dev/null | head -1)"

if [ -z "$SERVER_CONTAINER" ] || [ -z "$MONGO_CONTAINER" ]; then
  echo "Server and mongo containers must be running."
  echo "Start them with: docker compose up -d server mongo"
  exit 1
fi

DOCKER_MONGO_URI="$(docker exec "$SERVER_CONTAINER" printenv MONGO_URI 2>/dev/null | tr -d '\r')"
DOCKER_MONGO_URI="${DOCKER_MONGO_URI:-mongodb://mongo:27017/qlicker}"

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
  local temp_seed_script="/app/.seed-db-tmp.js"

  echo "Copying seed script to server container..."
  docker cp "$SCRIPT_DIR/seed-db.js" "$SERVER_CONTAINER:$temp_seed_script"

  echo "Running seed script inside container..."
  local status=0
  if docker exec "$SERVER_CONTAINER" node "$temp_seed_script" "$@"; then
    status=0
  else
    status=$?
  fi

  echo "Cleaning up..."
  docker exec -u 0 "$SERVER_CONTAINER" rm -f "$temp_seed_script" >/dev/null 2>&1 || true

  if [ "$status" -ne 0 ]; then
    return "$status"
  fi

  echo "Done."
}

reset_to_empty() {
  local target_db
  target_db="$(db_name_from_uri "$DOCKER_MONGO_URI")"

  if ! confirm_action "This will drop all data in '$target_db' via Docker mongo. Continue?"; then
    echo "Canceled."
    return 0
  fi

  docker exec "$MONGO_CONTAINER" mongosh "$DOCKER_MONGO_URI" --quiet --eval 'db.dropDatabase()' >/dev/null
  echo "Database '$target_db' reset to empty."
}

restore_legacy_dump() {
  if ! select_legacy_directory; then
    return 1
  fi

  local source_db dump_root target_db temp_dump_dir status
  source_db="$(basename "$SELECTED_LEGACY_DIR")"
  dump_root="$(dirname "$SELECTED_LEGACY_DIR")"
  target_db="$(db_name_from_uri "$DOCKER_MONGO_URI")"
  temp_dump_dir="/tmp/legacy-restore-$$"
  status=0

  echo "Restore source database: $source_db"
  echo "Restore target database: $target_db"

  if ! confirm_action "This will overwrite all data in '$target_db'. Continue?"; then
    echo "Canceled."
    return 0
  fi

  echo "Copying dump into mongo container..."
  docker exec "$MONGO_CONTAINER" rm -rf "$temp_dump_dir"
  docker exec "$MONGO_CONTAINER" mkdir -p "$temp_dump_dir"
  docker cp "$dump_root/." "$MONGO_CONTAINER:$temp_dump_dir/"

  echo "Running mongorestore inside mongo container..."
  if docker exec "$MONGO_CONTAINER" mongorestore \
    --drop \
    --uri="$DOCKER_MONGO_URI" \
    --db="$target_db" \
    "$temp_dump_dir/$source_db"; then
    status=0
  else
    status=$?
  fi

  docker exec "$MONGO_CONTAINER" rm -rf "$temp_dump_dir" >/dev/null 2>&1 || true

  if [ "$status" -ne 0 ]; then
    return "$status"
  fi

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

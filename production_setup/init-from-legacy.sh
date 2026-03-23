#!/usr/bin/env bash
# =============================================================================
# Qlicker Production — Initialize from Legacy Database
# =============================================================================
# Restores a mongodump from the legacy MeteorJS Qlicker instance,
# runs the question-type migration, and optionally sanitizes S3 uploads
# for private-bucket mode.
#
# Prerequisites:
#   - Place your legacy mongodump directory under ./legacydb/
#     e.g., ./legacydb/<dump_name>/<db_name>/ containing .bson and .metadata.json files
#   - Docker Compose services must be running (at least mongo and server)
#
# Usage:
#   ./init-from-legacy.sh                    # Interactive
#   ./init-from-legacy.sh --dump-dir ./legacydb/<dump_name>  # Specify dump root
#   ./init-from-legacy.sh --sanitize-s3      # Also run S3 privatization
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
LEGACY_DIR="$SCRIPT_DIR/legacydb"
DUMP_DIR=""
SANITIZE_S3=false

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { printf "${GREEN}[INFO]${NC}  %s\n" "$*"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
error() { printf "${RED}[ERROR]${NC} %s\n" "$*" >&2; }

is_system_database_name() {
  case "$1" in
    admin|local|config) return 0 ;;
    *) return 1 ;;
  esac
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

dir_has_bson_files() {
  local dir="$1"
  find "$dir" -maxdepth 1 -type f -name '*.bson' ! -name 'oplog.bson' -print -quit | grep -q .
}

list_dump_databases() {
  local dump_root="$1"
  find "$dump_root" -mindepth 1 -maxdepth 1 -type d \
    | while IFS= read -r db_dir; do
        if dir_has_bson_files "$db_dir"; then
          basename "$db_dir"
        fi
      done \
    | sort -u
}

find_legacy_candidates() {
  if [ ! -d "$LEGACY_DIR" ]; then
    return 0
  fi

  find "$LEGACY_DIR" -type f -name '*.bson' ! -name 'oplog.bson' \
    | while IFS= read -r file; do
        local rel top
        rel="${file#$LEGACY_DIR/}"
        top="${rel%%/*}"
        if [ "$top" != "$rel" ]; then
          printf '%s\n' "$LEGACY_DIR/$top"
        fi
      done \
    | sort -u
}

db_name_from_uri() {
  local uri="$1"
  local no_query db_name
  no_query="${uri%%\?*}"
  db_name="${no_query##*/}"
  if [ -z "$db_name" ] || [ "$db_name" = "$no_query" ]; then
    db_name="qlicker"
  fi
  printf '%s\n' "$db_name"
}

# Parse arguments
while [ $# -gt 0 ]; do
  case "$1" in
    --dump-dir)
      if [ $# -lt 2 ]; then
        error "--dump-dir requires a path argument"
        exit 1
      fi
      DUMP_DIR="$2"
      shift 2
      ;;
    --sanitize-s3) SANITIZE_S3=true; shift ;;
    --help|-h)
      echo "Usage: ./init-from-legacy.sh [--dump-dir DIR] [--sanitize-s3]"
      echo "  --dump-dir DIR    Path to mongodump directory"
      echo "  --sanitize-s3     Run S3 ACL sanitization after restore"
      exit 0
      ;;
    *) error "Unknown argument: $1"; exit 1 ;;
  esac
done

# Load .env
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; . "$SCRIPT_DIR/.env"; set +a
else
  error ".env file not found. Run ./setup.sh first."
  exit 1
fi

# ---- Find legacy dump -------------------------------------------------------
if [ -z "$DUMP_DIR" ]; then
  mkdir -p "$LEGACY_DIR"

  mapfile -t CANDIDATES < <(find_legacy_candidates)

  if [ "${#CANDIDATES[@]}" -eq 0 ]; then
    error "No dump directories found in $LEGACY_DIR/"
    echo ""
    echo "Place your mongodump output directory here:"
    echo "  $LEGACY_DIR/<dump_name>/<database_name>/"
    echo ""
    echo "The database directories should contain .bson and .metadata.json files."
    echo "You can create a dump with:"
    echo "  mongodump --uri='mongodb://host:port/qlicker' --out='$LEGACY_DIR'"
    exit 1
  fi

  if [ "${#CANDIDATES[@]}" -eq 1 ]; then
    DUMP_DIR="${CANDIDATES[0]}"
    info "Using dump: $(basename "$DUMP_DIR")"
  else
    echo "Found legacy dump directories:"
    for i in "${!CANDIDATES[@]}"; do
      echo "  $((i + 1))) $(basename "${CANDIDATES[$i]}")"
    done
    while true; do
      read -r -p "Choose [1-${#CANDIDATES[@]}]: " choice
      if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#CANDIDATES[@]}" ]; then
        DUMP_DIR="${CANDIDATES[$((choice - 1))]}"
        break
      fi
      echo "Invalid choice."
    done
  fi
fi

if [ ! -d "$DUMP_DIR" ]; then
  error "Dump directory not found: $DUMP_DIR"
  exit 1
fi

DUMP_DIR="$(cd "$DUMP_DIR" && pwd)"
DUMP_NAME="$(basename "$DUMP_DIR")"
TARGET_DB="$(db_name_from_uri "${MONGO_URI:-mongodb://localhost:27017/qlicker}")"

SOURCE_DB_NAMES=()
SOURCE_DB_DIRS=()

if dir_has_bson_files "$DUMP_DIR"; then
  # Accept --dump-dir pointing directly at a single database dump directory.
  SOURCE_DB_NAMES+=("$(basename "$DUMP_DIR")")
  SOURCE_DB_DIRS+=("$DUMP_DIR")
else
  mapfile -t SOURCE_DB_NAMES < <(list_dump_databases "$DUMP_DIR")
  if [ "${#SOURCE_DB_NAMES[@]}" -eq 0 ]; then
    error "No database dump directories with .bson files found in $DUMP_DIR"
    exit 1
  fi
  for db_name in "${SOURCE_DB_NAMES[@]}"; do
    SOURCE_DB_DIRS+=("$DUMP_DIR/$db_name")
  done
fi

if ! PRIMARY_SOURCE_DB="$(pick_primary_app_database "${SOURCE_DB_NAMES[@]}")"; then
  error "Unable to determine primary application database in $DUMP_DIR"
  exit 1
fi

# ---- Get containers ----------------------------------------------------------
MONGO_CONTAINER="$(docker compose -f "$COMPOSE_FILE" ps -q mongo 2>/dev/null | head -1)"
SERVER_CONTAINER="$(docker compose -f "$COMPOSE_FILE" ps -q server 2>/dev/null | head -1)"

if [ -z "$MONGO_CONTAINER" ]; then
  error "MongoDB container is not running. Start with: docker compose up -d"
  exit 1
fi
if [ -z "$SERVER_CONTAINER" ]; then
  error "Server container is not running. Start with: docker compose up -d"
  exit 1
fi

# ---- Confirmation ------------------------------------------------------------
echo ""
echo "======================================"
echo "  Initialize from Legacy Database"
echo "======================================"
echo ""
echo "  Source dump:   $DUMP_NAME"
echo "  Dump DBs:      ${SOURCE_DB_NAMES[*]}"
echo "  Primary DB:    $PRIMARY_SOURCE_DB"
echo "  Target DB:     $TARGET_DB"
echo ""
warn "This will DROP and replace data in '$TARGET_DB' (and any restored system DBs)."
echo ""
read -r -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Cancelled."
  exit 0
fi

# ---- Create pre-init backup if data exists -----------------------------------
COLLECTION_COUNT="$(docker exec "$MONGO_CONTAINER" mongosh "mongodb://localhost:27017/$TARGET_DB" --quiet --eval 'db.getCollectionNames().length' 2>/dev/null || echo 0)"
if [ "$COLLECTION_COUNT" -gt 0 ]; then
  info "Creating backup of existing data before restore..."
  "$SCRIPT_DIR/backup.sh" || warn "Backup failed, continuing anyway."
fi

# ---- Restore legacy dump -----------------------------------------------------
CONTAINER_TEMP="/tmp/legacy-restore-$$"
cleanup_restore_temp() {
  docker exec "$MONGO_CONTAINER" rm -rf "$CONTAINER_TEMP" 2>/dev/null || true
}
trap cleanup_restore_temp EXIT

info "Copying dump into mongo container..."
docker exec "$MONGO_CONTAINER" mkdir -p "$CONTAINER_TEMP"
for i in "${!SOURCE_DB_NAMES[@]}"; do
  source_db="${SOURCE_DB_NAMES[$i]}"
  source_dir="${SOURCE_DB_DIRS[$i]}"
  docker exec "$MONGO_CONTAINER" mkdir -p "$CONTAINER_TEMP/$source_db"
  docker cp "$source_dir/." "$MONGO_CONTAINER:$CONTAINER_TEMP/$source_db/"
done

info "Running mongorestore (--drop) per database..."
for source_db in "${SOURCE_DB_NAMES[@]}"; do
  restore_db="$source_db"
  if [ "$source_db" = "$PRIMARY_SOURCE_DB" ]; then
    restore_db="$TARGET_DB"
  fi
  info "Restoring '$source_db' -> '$restore_db'..."
  docker exec "$MONGO_CONTAINER" mongorestore \
    --uri="mongodb://localhost:27017" \
    --db="$restore_db" \
    --drop \
    "$CONTAINER_TEMP/$source_db"
done
info "mongorestore complete."

docker exec "$MONGO_CONTAINER" rm -rf "$CONTAINER_TEMP" 2>/dev/null || true
trap - EXIT

# ---- Run question-type migration ---------------------------------------------
info "Running question-type migration (dry run)..."
docker exec "$SERVER_CONTAINER" node scripts/migrate-question-types.js 2>&1 | tail -5

echo ""
read -r -p "Apply question-type migration? [Y/n]: " APPLY_MIGRATION
if [[ "${APPLY_MIGRATION:-Y}" =~ ^[Yy] ]]; then
  info "Applying migration..."
  docker exec "$SERVER_CONTAINER" node scripts/migrate-question-types.js --apply
  info "Migration applied."
else
  warn "Migration skipped. Run manually later:"
  echo "  docker exec <server-container> node scripts/migrate-question-types.js --apply"
fi

# ---- Sanitize S3 (optional) -------------------------------------------------
if [ "$SANITIZE_S3" = true ]; then
  if [ "${STORAGE_TYPE:-local}" = "s3" ]; then
    info "Running S3 ACL sanitization..."
    docker exec "$SERVER_CONTAINER" node -e "
      $(cat "$SCRIPT_DIR/sanitize-s3.js")
    "
    info "S3 sanitization complete."
  else
    warn "--sanitize-s3 requested but STORAGE_TYPE is not 's3'. Skipping."
  fi
fi

# ---- Done -------------------------------------------------------------------
echo ""
echo "======================================"
echo "  Legacy initialization complete!"
echo "======================================"
echo ""
echo "  Next steps:"
echo "    1. Verify the app: https://${DOMAIN:-localhost}"
echo "    2. Change the admin password:"
echo "       ./manage-user.sh change-password --email admin@example.com"
echo "    3. Create a backup: ./backup.sh"
echo ""
if [ "$SANITIZE_S3" = false ] && [ "${STORAGE_TYPE:-local}" = "s3" ]; then
  echo "  S3 note: If migrating to a private bucket, run:"
  echo "    ./init-from-legacy.sh --sanitize-s3"
  echo "    (or manually: node sanitize-s3.js inside the server container)"
  echo ""
fi

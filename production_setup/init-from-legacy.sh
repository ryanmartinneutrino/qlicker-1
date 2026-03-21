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
#     e.g., ./legacydb/qlicker/ containing .bson and .metadata.json files
#   - Docker Compose services must be running (at least mongo and server)
#
# Usage:
#   ./init-from-legacy.sh                    # Interactive
#   ./init-from-legacy.sh --dump-dir ./legacydb/qlicker  # Specify dump dir
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

# Parse arguments
while [ $# -gt 0 ]; do
  case "$1" in
    --dump-dir)    DUMP_DIR="$2"; shift 2 ;;
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

  mapfile -t CANDIDATES < <(find "$LEGACY_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)

  if [ "${#CANDIDATES[@]}" -eq 0 ]; then
    error "No dump directories found in $LEGACY_DIR/"
    echo ""
    echo "Place your mongodump output directory here:"
    echo "  $LEGACY_DIR/<database_name>/"
    echo ""
    echo "The directory should contain .bson and .metadata.json files."
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

# Verify it contains .bson files
if ! find "$DUMP_DIR" -maxdepth 1 -name '*.bson' -print -quit | grep -q .; then
  error "No .bson files found in $DUMP_DIR"
  exit 1
fi

DUMP_NAME="$(basename "$DUMP_DIR")"

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
echo "  Target DB:     qlicker"
echo ""
warn "This will DROP the existing 'qlicker' database and replace it."
echo ""
read -r -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Cancelled."
  exit 0
fi

# ---- Create pre-init backup if data exists -----------------------------------
COLLECTION_COUNT="$(docker exec "$MONGO_CONTAINER" mongosh mongodb://localhost:27017/qlicker --quiet --eval 'db.getCollectionNames().length' 2>/dev/null || echo 0)"
if [ "$COLLECTION_COUNT" -gt 0 ]; then
  info "Creating backup of existing data before restore..."
  "$SCRIPT_DIR/backup.sh" || warn "Backup failed, continuing anyway."
fi

# ---- Restore legacy dump -----------------------------------------------------
info "Copying dump into mongo container..."
CONTAINER_TEMP="/tmp/legacy-restore-$$"
docker exec "$MONGO_CONTAINER" mkdir -p "$CONTAINER_TEMP/$DUMP_NAME"
docker cp "$DUMP_DIR/." "$MONGO_CONTAINER:$CONTAINER_TEMP/$DUMP_NAME/"

info "Running mongorestore (--drop)..."
if docker exec "$MONGO_CONTAINER" mongorestore \
  --uri="mongodb://localhost:27017" \
  --db=qlicker \
  --drop \
  "$CONTAINER_TEMP/$DUMP_NAME"; then
  info "mongorestore complete."
else
  error "mongorestore failed!"
  docker exec "$MONGO_CONTAINER" rm -rf "$CONTAINER_TEMP" 2>/dev/null || true
  exit 1
fi

docker exec "$MONGO_CONTAINER" rm -rf "$CONTAINER_TEMP" 2>/dev/null || true

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

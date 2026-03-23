#!/usr/bin/env bash
# =============================================================================
# Qlicker Production — MongoDB Backup Script
# =============================================================================
# Creates a timestamped mongodump of the Qlicker database.
# Backups are stored in ./backups/ and old backups are pruned automatically.
#
# Usage:
#   ./backup.sh              # Create a backup now
#   ./backup.sh --cron       # Silent mode for cron jobs (only prints errors)
#
# Cron example (daily at 2 AM):
#   0 2 * * * /path/to/production_setup/backup.sh --cron >> /var/log/qlicker-backup.log 2>&1
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/backups"
CRON_MODE=false

if [ "${1:-}" = "--cron" ]; then
  CRON_MODE=true
fi

log() {
  if [ "$CRON_MODE" = false ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  fi
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

# Load .env
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; . "$SCRIPT_DIR/.env"; set +a
else
  error ".env file not found. Run ./setup.sh first."
  exit 1
fi

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# Get mongo container
MONGO_CONTAINER="$(docker compose -f "$SCRIPT_DIR/docker-compose.yml" ps -q mongo 2>/dev/null | head -1)"
if [ -z "$MONGO_CONTAINER" ]; then
  error "MongoDB container is not running. Start with: docker compose up -d mongo"
  exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date '+%Y%m%d_%H%M%S')"
BACKUP_NAME="qlicker_backup_${TIMESTAMP}"

log "Starting backup: $BACKUP_NAME"

# Run mongodump inside the mongo container
if docker exec "$MONGO_CONTAINER" mongodump \
  --uri="mongodb://localhost:27017/qlicker" \
  --out="/backups/$BACKUP_NAME" \
  --quiet; then
  log "Mongodump complete."
else
  error "mongodump failed!"
  exit 1
fi

# Compress and remove the raw dump inside the mongo container.
# This avoids host-side permission issues when deleting root-owned dump files.
if docker exec "$MONGO_CONTAINER" sh -lc "cd /backups && tar czf '${BACKUP_NAME}.tar.gz' '${BACKUP_NAME}' && rm -rf '${BACKUP_NAME}'"; then
  :
else
  error "Failed to compress backup inside mongo container."
  exit 1
fi

if [ -f "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" ]; then
  BACKUP_SIZE="$(du -sh "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" | cut -f1)"
  log "Compressed: ${BACKUP_NAME}.tar.gz ($BACKUP_SIZE)"
else
  error "Backup archive not found after compression."
  exit 1
fi

# Prune old backups
PRUNED=0
if [ "$RETENTION_DAYS" -gt 0 ]; then
  while IFS= read -r old_backup; do
    rm -f "$old_backup"
    PRUNED=$((PRUNED + 1))
  done < <(find "$BACKUP_DIR" -name 'qlicker_backup_*.tar.gz' -mtime "+$RETENTION_DAYS" -type f 2>/dev/null)
fi

if [ "$PRUNED" -gt 0 ]; then
  log "Pruned $PRUNED backup(s) older than $RETENTION_DAYS days."
fi

TOTAL_BACKUPS="$(find "$BACKUP_DIR" -name 'qlicker_backup_*.tar.gz' -type f 2>/dev/null | wc -l)"
log "Backup complete. Total backups: $TOTAL_BACKUPS"

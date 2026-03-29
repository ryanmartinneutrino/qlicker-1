#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SANITIZE_S3=false

while [ $# -gt 0 ]; do
  case "$1" in
    --sanitize-s3)
      SANITIZE_S3=true
      shift
      ;;
    --help|-h)
      echo "Usage: ./scripts/init-from-legacy-docker.sh [--sanitize-s3]"
      echo "  Restores a legacy dump into the Docker dev database, then applies"
      echo "  the question-type migration inside the server container."
      echo "  --sanitize-s3   Also rewrite legacy S3 URLs to /uploads/... and run the ACL pass"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

echo "Restoring legacy dump into Docker dev database..."
"$SCRIPT_DIR/seed-db-docker.sh" --legacy-restore

SERVER_CONTAINER="$(docker compose ps -q server 2>/dev/null | head -1)"
if [ -z "$SERVER_CONTAINER" ]; then
  echo "Server container is not running. Start with: docker compose up -d server"
  exit 1
fi

echo "Reconciling settings singleton inside server container..."
docker exec "$SERVER_CONTAINER" node scripts/reconcile-settings-singleton.js

echo "Applying question-type migration inside server container..."
docker exec "$SERVER_CONTAINER" node scripts/migrate-question-types.js --apply

if [ "$SANITIZE_S3" = true ]; then
  echo "Running S3 sanitization inside server container..."
  docker exec -i "$SERVER_CONTAINER" node --input-type=module - --apply < "$PROJECT_ROOT/production_setup/sanitize-s3.js"
fi

echo "Legacy initialization complete."

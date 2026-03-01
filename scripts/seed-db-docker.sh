#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Determine the server container name
CONTAINER=$(docker compose ps -q server 2>/dev/null | head -1)

if [ -z "$CONTAINER" ]; then
  echo "Server container is not running."
  echo "Start it with: docker compose up -d"
  exit 1
fi

echo "Copying seed script to server container..."
docker cp "$SCRIPT_DIR/seed-db.js" "$CONTAINER:/app/seed-db.js"

# Pass MONGO_URI from the container's environment
echo "Running seed script inside container..."
docker exec "$CONTAINER" node /app/seed-db.js "$@"

echo "Cleaning up..."
docker exec "$CONTAINER" rm -f /app/seed-db.js
echo "Done."

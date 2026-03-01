#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Running database seed..."
node "$SCRIPT_DIR/seed-db.js" "$@"

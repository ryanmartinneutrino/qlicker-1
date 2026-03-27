#!/usr/bin/env bash
# =============================================================================
# setup.sh — Interactive configuration for the Qlicker load-testing stack.
#
# • Discovers the production Qlicker Docker Compose stack
# • Reads its .env to populate sensible defaults
# • Creates a local .env consumed by docker-compose.yml and run.sh
# • Builds the seed Docker image
#
# Usage:
#   ./setup.sh                  # interactive setup
#   ./setup.sh --non-interactive  # use defaults / existing .env values only
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

# ── Colours & helpers ────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
ask()   { echo -en "${CYAN}$1${NC}"; }

NON_INTERACTIVE=false
if [[ "${1:-}" == "--non-interactive" ]]; then
  NON_INTERACTIVE=true
fi

# ── Load existing .env defaults ──────────────────────────────────────────────
existing_val() {
  # Return value from existing .env if it exists, otherwise empty
  if [[ -f "$ENV_FILE" ]]; then
    grep -E "^${1}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//'
  fi
}

DEFAULT_STACK_DIR="$(existing_val QLICKER_STACK_DIR)"
DEFAULT_STUDENTS="$(existing_val NUM_STUDENTS)"
: "${DEFAULT_STUDENTS:=500}"

# ── 1. Locate the production stack ──────────────────────────────────────────
echo ""
info "Qlicker Load Testing — Setup"
echo  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if $NON_INTERACTIVE; then
  STACK_DIR="${DEFAULT_STACK_DIR:?QLICKER_STACK_DIR must be set in .env for --non-interactive}"
else
  ask "Path to the Qlicker production_setup directory [${DEFAULT_STACK_DIR:-not set}]: "
  read -r STACK_DIR
  STACK_DIR="${STACK_DIR:-$DEFAULT_STACK_DIR}"
fi

if [[ -z "$STACK_DIR" ]]; then
  error "Production stack directory is required."
  exit 1
fi

# Resolve to absolute path
STACK_DIR="$(cd "$STACK_DIR" 2>/dev/null && pwd)" || {
  error "Directory not found: $STACK_DIR"
  exit 1
}

if [[ ! -f "$STACK_DIR/docker-compose.yml" ]]; then
  error "No docker-compose.yml found in $STACK_DIR"
  exit 1
fi

info "Using production stack at: $STACK_DIR"

# ── 2. Read production .env ─────────────────────────────────────────────────
PROD_ENV="$STACK_DIR/.env"
prod_val() {
  if [[ -f "$PROD_ENV" ]]; then
    grep -E "^${1}=" "$PROD_ENV" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//'
  fi
}

PROD_DOMAIN="$(prod_val DOMAIN)"
PROD_MONGO_URI="$(prod_val MONGO_URI)"
: "${PROD_MONGO_URI:=mongodb://mongo:27017/qlicker}"

info "Detected DOMAIN=$PROD_DOMAIN"
info "Detected MONGO_URI=$PROD_MONGO_URI"

# ── 3. Detect Docker network ───────────────────────────────────────────────
DETECTED_NETWORK=""
# Try to find the network by inspecting a running container from the stack
MONGO_CID=$(cd "$STACK_DIR" && docker compose ps -q mongo 2>/dev/null | head -1) || true
if [[ -n "$MONGO_CID" ]]; then
  DETECTED_NETWORK=$(docker inspect "$MONGO_CID" \
    --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null) || true
fi

DEFAULT_NETWORK="$(existing_val QLICKER_NETWORK)"
: "${DEFAULT_NETWORK:=$DETECTED_NETWORK}"

if [[ -n "$DETECTED_NETWORK" ]]; then
  info "Detected Docker network: $DETECTED_NETWORK"
elif [[ -n "$DEFAULT_NETWORK" ]]; then
  info "Using previously configured network: $DEFAULT_NETWORK"
else
  # Fallback: guess from directory name
  PROJ_NAME=$(basename "$STACK_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]//g')
  DEFAULT_NETWORK="${PROJ_NAME}_default"
  warn "Could not detect network (is the production stack running?)."
  warn "Guessing: $DEFAULT_NETWORK"
fi

if ! $NON_INTERACTIVE; then
  ask "Docker network for production stack [$DEFAULT_NETWORK]: "
  read -r QLICKER_NETWORK
fi
QLICKER_NETWORK="${QLICKER_NETWORK:-$DEFAULT_NETWORK}"

# Verify the network exists
if docker network inspect "$QLICKER_NETWORK" >/dev/null 2>&1; then
  info "Network '$QLICKER_NETWORK' exists ✓"
else
  warn "Network '$QLICKER_NETWORK' does not exist yet."
  warn "Make sure the production stack is running before seeding."
fi

# ── 4. Collect remaining settings ──────────────────────────────────────────
BASE_URL="https://${PROD_DOMAIN:-localhost}"
DEFAULT_BASE_URL="$(existing_val BASE_URL)"
: "${DEFAULT_BASE_URL:=$BASE_URL}"

if ! $NON_INTERACTIVE; then
  ask "Base URL for the Qlicker instance [$DEFAULT_BASE_URL]: "
  read -r BASE_URL_INPUT
  BASE_URL="${BASE_URL_INPUT:-$DEFAULT_BASE_URL}"
else
  BASE_URL="$DEFAULT_BASE_URL"
fi

if ! $NON_INTERACTIVE; then
  ask "Number of students to simulate [$DEFAULT_STUDENTS]: "
  read -r NUM_STUDENTS_INPUT
  NUM_STUDENTS="${NUM_STUDENTS_INPUT:-$DEFAULT_STUDENTS}"
else
  NUM_STUDENTS="$DEFAULT_STUDENTS"
fi

# ── 5. Write .env ──────────────────────────────────────────────────────────
cat > "$ENV_FILE" <<EOF
# =============================================================================
# Qlicker Load Testing — Environment Configuration
# Generated by setup.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# =============================================================================

# Path to the running Qlicker production_setup directory
QLICKER_STACK_DIR=$STACK_DIR

# Docker network the production stack uses (so the seed container can reach MongoDB)
QLICKER_NETWORK=$QLICKER_NETWORK

# MongoDB connection string (internal to the Docker network)
MONGO_URL=$PROD_MONGO_URI

# Qlicker instance URL (used by k6 to send HTTP/WebSocket traffic)
BASE_URL=$BASE_URL

# Number of simulated students (override with ./run.sh --students N)
NUM_STUDENTS=$NUM_STUDENTS
EOF

info "Configuration written to $ENV_FILE"

# ── 6. Build the seed image ────────────────────────────────────────────────
echo ""
info "Building the seed Docker image …"
docker compose -f "$SCRIPT_DIR/docker-compose.yml" build seed
info "Seed image built ✓"

# ── 7. Create directories ──────────────────────────────────────────────────
mkdir -p "$SCRIPT_DIR/state" "$SCRIPT_DIR/results"

# ── 8. Print next steps ────────────────────────────────────────────────────
echo ""
echo  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
info "Setup complete!"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Prepare the production stack for load testing (disable rate limits):"
echo ""
echo "       ./run.sh --prepare"
echo ""
echo "  2. Run the load test:"
echo ""
echo "       ./run.sh"
echo ""
echo "  3. After testing, restore rate limits:"
echo ""
echo "       ./run.sh --restore"
echo ""
echo "  4. Clean up seed data from the database:"
echo ""
echo "       ./run.sh --clean"
echo ""
echo  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

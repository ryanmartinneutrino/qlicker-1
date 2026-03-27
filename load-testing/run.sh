#!/usr/bin/env bash
# =============================================================================
# run.sh — Qlicker load-test runner.
#
# Orchestrates seeding, running k6, and cleanup — all inside Docker.
#
# Commands:
#   ./run.sh                     Seed the database + run k6 load test
#   ./run.sh --students N        Override the number of simulated students
#   ./run.sh --seed-only         Seed the database without running the test
#   ./run.sh --test-only         Run k6 without re-seeding (state.json must exist)
#   ./run.sh --clean             Remove load-test seed data from the database
#   ./run.sh --prepare           Disable rate limits on the production stack
#   ./run.sh --restore           Re-enable rate limits on the production stack
#
# Environment:
#   Reads .env (created by setup.sh).  Override any value on the command line:
#     NUM_STUDENTS=100 ./run.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="docker compose -f $SCRIPT_DIR/docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/.env"

# ── Colours & helpers ────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── Load .env ────────────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  error ".env not found.  Run ./setup.sh first."
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

# Allow CLI overrides
NUM_STUDENTS="${NUM_STUDENTS:-500}"
QLICKER_STACK_DIR="${QLICKER_STACK_DIR:?Set QLICKER_STACK_DIR in .env (run setup.sh)}"
QLICKER_NETWORK="${QLICKER_NETWORK:?Set QLICKER_NETWORK in .env (run setup.sh)}"
BASE_URL="${BASE_URL:?Set BASE_URL in .env (run setup.sh)}"

# ── Parse arguments ──────────────────────────────────────────────────────────
ACTION="full"   # full | seed-only | test-only | clean | prepare | restore

while [[ $# -gt 0 ]]; do
  case "$1" in
    --students)
      NUM_STUDENTS="$2"; shift 2 ;;
    --seed-only)
      ACTION="seed-only"; shift ;;
    --test-only)
      ACTION="test-only"; shift ;;
    --clean)
      ACTION="clean"; shift ;;
    --prepare)
      ACTION="prepare"; shift ;;
    --restore)
      ACTION="restore"; shift ;;
    -h|--help)
      head -25 "$0" | tail -18
      exit 0 ;;
    *)
      error "Unknown option: $1"
      exit 1 ;;
  esac
done

# ── Helper: Docker Compose for production stack ──────────────────────────────
prod_compose() {
  docker compose -f "$QLICKER_STACK_DIR/docker-compose.yml" "$@"
}

# ── Verify production network is reachable ───────────────────────────────────
check_network() {
  if ! docker network inspect "$QLICKER_NETWORK" >/dev/null 2>&1; then
    error "Docker network '$QLICKER_NETWORK' not found."
    error "Is the production stack running?  Start it with:"
    error "  cd $QLICKER_STACK_DIR && docker compose up -d"
    exit 1
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# ACTIONS
# ═══════════════════════════════════════════════════════════════════════════════

# ── prepare: disable rate limits on the production stack ─────────────────────
do_prepare() {
  info "Preparing the production stack for load testing …"

  # 1. Server-side: set DISABLE_RATE_LIMITS=true and recreate server replicas
  if grep -q "^DISABLE_RATE_LIMITS=" "$QLICKER_STACK_DIR/.env" 2>/dev/null; then
    sed -i 's/^DISABLE_RATE_LIMITS=.*/DISABLE_RATE_LIMITS=true/' "$QLICKER_STACK_DIR/.env"
  else
    echo "DISABLE_RATE_LIMITS=true" >> "$QLICKER_STACK_DIR/.env"
  fi
  info "Set DISABLE_RATE_LIMITS=true in production .env"

  info "Recreating server replicas with rate limits disabled …"
  prod_compose up -d server
  info "Server replicas restarted ✓"

  # 2. Nginx-side: comment out limit_req directives (survives until nginx restart)
  info "Disabling nginx rate-limit directives …"
  prod_compose exec -T nginx sh -c \
    "sed -i 's/^[[:space:]]*limit_req /#limit_req /g' /etc/nginx/conf.d/default.conf && nginx -s reload" \
    2>/dev/null || warn "Could not modify nginx config (is it running?)."
  info "Nginx rate limits disabled ✓"

  echo ""
  info "Production stack is ready for load testing."
  info "Run:  ./run.sh"
}

# ── restore: re-enable rate limits on the production stack ───────────────────
do_restore() {
  info "Restoring rate limits on the production stack …"

  # 1. Server-side: set DISABLE_RATE_LIMITS=false
  if grep -q "^DISABLE_RATE_LIMITS=" "$QLICKER_STACK_DIR/.env" 2>/dev/null; then
    sed -i 's/^DISABLE_RATE_LIMITS=.*/DISABLE_RATE_LIMITS=false/' "$QLICKER_STACK_DIR/.env"
  fi
  info "Set DISABLE_RATE_LIMITS=false in production .env"

  info "Recreating server replicas with rate limits enabled …"
  prod_compose up -d server

  # 2. Nginx-side: restart to re-render template (restores limit_req directives)
  info "Restarting nginx to restore rate-limit config from template …"
  prod_compose restart nginx

  echo ""
  info "Rate limits restored ✓"
}

# ── seed: populate the database ──────────────────────────────────────────────
do_seed() {
  check_network
  mkdir -p "$SCRIPT_DIR/state"

  info "Seeding database with $NUM_STUDENTS students …"
  $COMPOSE run --rm seed --students "$NUM_STUDENTS"
  info "Seeding complete ✓"

  if [[ -f "$SCRIPT_DIR/state/state.json" ]]; then
    info "State file: $SCRIPT_DIR/state/state.json"
  else
    error "state.json was not created.  Check seed output above."
    exit 1
  fi
}

# ── test: run k6 ─────────────────────────────────────────────────────────────
do_test() {
  if [[ ! -f "$SCRIPT_DIR/state/state.json" ]]; then
    error "state/state.json not found.  Run seeding first: ./run.sh --seed-only"
    exit 1
  fi

  mkdir -p "$SCRIPT_DIR/results"
  TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
  RESULT_LOG="$SCRIPT_DIR/results/k6-${TIMESTAMP}.log"

  info "Running k6 load test against $BASE_URL …"
  info "Results log: $RESULT_LOG"
  echo ""

  # Run k6 via docker compose, passing env vars and tee-ing output
  set +e
  $COMPOSE run --rm \
    -e BASE_URL="$BASE_URL" \
    -e STATE_FILE=/state/state.json \
    k6 run \
      --env BASE_URL="$BASE_URL" \
      --env STATE_FILE=/state/state.json \
      --insecure-skip-tls-verify \
      /scenarios/live-session.js \
    2>&1 | tee "$RESULT_LOG"
  K6_EXIT=${PIPESTATUS[0]}
  set -e

  echo ""
  if [[ $K6_EXIT -eq 0 ]]; then
    info "Load test PASSED ✓"
  else
    warn "Load test FAILED (exit code $K6_EXIT) — check thresholds in the log above."
  fi
  info "Full log saved to: $RESULT_LOG"

  return $K6_EXIT
}

# ── clean: remove seed data ──────────────────────────────────────────────────
do_clean() {
  check_network

  info "Cleaning load-test data from the database …"
  $COMPOSE run --rm seed --clean
  info "Cleanup complete ✓"

  # Remove local state file
  rm -f "$SCRIPT_DIR/state/state.json"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Dispatch
# ═══════════════════════════════════════════════════════════════════════════════

case "$ACTION" in
  prepare)
    do_prepare
    ;;
  restore)
    do_restore
    ;;
  seed-only)
    do_seed
    ;;
  test-only)
    do_test
    ;;
  clean)
    do_clean
    ;;
  full)
    do_seed
    echo ""
    do_test || true
    echo ""
    info "To clean up seed data later:  ./run.sh --clean"
    info "To restore rate limits:       ./run.sh --restore"
    ;;
esac

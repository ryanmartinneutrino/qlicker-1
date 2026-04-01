#!/usr/bin/env bash
# =============================================================================
# run.sh — Qlicker load-test runner.
#
# Commands:
#   ./run.sh                     Seed the database + run the k6 load test
#   ./run.sh --students N        Override the configured number of students
#   ./run.sh --session-chat MODE Run with session chat enabled or disabled
#   ./run.sh --seed-only         Seed without running k6
#   ./run.sh --test-only         Run k6 without reseeding
#   ./run.sh --clean             Remove load-test seed data from MongoDB
#   ./run.sh --prepare           Disable rate limits on the running stack
#   ./run.sh --restore           Re-enable rate limits on the running stack
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
RESULTS_DIR="$SCRIPT_DIR/results"
STATE_DIR="$SCRIPT_DIR/state"
K6_IMAGE="${K6_IMAGE:-grafana/k6:latest}"
DEFAULT_SEED_IMAGE="qlicker-load-testing-seed:local"
COMMON_SH="$SCRIPT_DIR/common.sh"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# shellcheck disable=SC1091
source "$COMMON_SH"

if [[ ! -f "$ENV_FILE" ]]; then
  error ".env not found. Run ./setup.sh first."
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

# Backward compatibility with the original production-only config.
if [[ -z "${TARGET_ENV:-}" && -n "${QLICKER_STACK_DIR:-}" ]]; then
  TARGET_ENV="prod"
  TARGET_RUNTIME="docker"
  TARGET_ENV_FILE="${TARGET_ENV_FILE:-$QLICKER_STACK_DIR/.env}"
  STACK_DIR="${STACK_DIR:-$QLICKER_STACK_DIR}"
  TARGET_COMPOSE_FILE="${TARGET_COMPOSE_FILE:-$QLICKER_STACK_DIR/docker-compose.yml}"
fi

TARGET_ENV="${TARGET_ENV:-prod}"
TARGET_RUNTIME="${TARGET_RUNTIME:-docker}"
TARGET_ENV_FILE="${TARGET_ENV_FILE:-}"
STACK_DIR="${STACK_DIR:-}"
TARGET_COMPOSE_FILE="${TARGET_COMPOSE_FILE:-}"
QLICKER_NETWORK="${QLICKER_NETWORK:-}"
MONGO_URL="${MONGO_URL:-}"
BASE_URL="${BASE_URL:-}"
NUM_STUDENTS="${NUM_STUDENTS:-500}"
SEED_IMAGE="${SEED_IMAGE:-$DEFAULT_SEED_IMAGE}"
SESSION_CHAT_ENABLED="${SESSION_CHAT_ENABLED:-true}"

if [[ -z "$STACK_DIR" && -n "$TARGET_ENV_FILE" ]]; then
  STACK_DIR="$(dirname "$TARGET_ENV_FILE")"
fi
if [[ -z "$TARGET_COMPOSE_FILE" && "$TARGET_RUNTIME" == "docker" && -n "$STACK_DIR" ]]; then
  TARGET_COMPOSE_FILE="$STACK_DIR/docker-compose.yml"
fi

if [[ -z "$MONGO_URL" || -z "$BASE_URL" ]]; then
  error "MONGO_URL and BASE_URL must be set in $ENV_FILE. Run ./setup.sh again."
  exit 1
fi

ACTION="full"

normalize_boolean_flag() {
  local value="${1:-}"
  value="${value,,}"
  case "$value" in
    1|true|yes|on|enabled)
      printf 'true\n'
      ;;
    0|false|no|off|disabled)
      printf 'false\n'
      ;;
    *)
      return 1
      ;;
  esac
}

if ! SESSION_CHAT_ENABLED="$(normalize_boolean_flag "$SESSION_CHAT_ENABLED")"; then
  error "SESSION_CHAT_ENABLED must be one of: true/false, on/off, enabled/disabled."
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --students)
      NUM_STUDENTS="$2"; shift 2 ;;
    --session-chat)
      if [[ $# -lt 2 ]]; then
        error "--session-chat requires a value: on|off"
        exit 1
      fi
      if ! SESSION_CHAT_ENABLED="$(normalize_boolean_flag "$2")"; then
        error "Invalid --session-chat value '$2'. Use on|off, true|false, or enabled|disabled."
        exit 1
      fi
      shift 2 ;;
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
      head -18 "$0"
      exit 0 ;;
    *)
      error "Unknown option: $1"
      exit 1 ;;
  esac
done

is_local_address() {
  local value="$1"
  [[ "$value" == *localhost* || "$value" == *127.0.0.1* || "$value" == *"[::1]"* ]]
}

rewrite_localhost_for_docker() {
  local value="$1"
  value="${value/localhost/host.docker.internal}"
  value="${value/127.0.0.1/host.docker.internal}"
  value="${value/\[::1\]/host.docker.internal}"
  printf '%s\n' "$value"
}

refresh_docker_network() {
  if [[ "$TARGET_RUNTIME" != "docker" ]]; then
    return 0
  fi
  if [[ -z "$STACK_DIR" || -z "$TARGET_ENV_FILE" || -z "$TARGET_COMPOSE_FILE" ]]; then
    return 0
  fi
  if [[ ! -f "$TARGET_ENV_FILE" || ! -f "$TARGET_COMPOSE_FILE" ]]; then
    return 0
  fi

  local detected_network=""
  detected_network="$(detect_docker_network "$STACK_DIR" "$TARGET_ENV_FILE" "$TARGET_COMPOSE_FILE" || true)"
  if [[ -z "$detected_network" ]]; then
    return 0
  fi

  if [[ "$QLICKER_NETWORK" != "$detected_network" ]]; then
    if [[ -n "$QLICKER_NETWORK" ]]; then
      warn "Using detected Docker network '$detected_network' instead of '$QLICKER_NETWORK'."
    else
      info "Detected Docker network: $detected_network"
    fi
    QLICKER_NETWORK="$detected_network"
  fi
}

current_mongo_url() {
  local runtime_mongo_url="$MONGO_URL"
  if [[ -n "$TARGET_ENV_FILE" && -f "$TARGET_ENV_FILE" ]]; then
    local resolved_runtime_mongo_url=""
    resolved_runtime_mongo_url="$(resolve_mongo_url "$TARGET_ENV_FILE" || true)"
    if [[ -n "$resolved_runtime_mongo_url" ]]; then
      runtime_mongo_url="$resolved_runtime_mongo_url"
    fi
  fi
  printf '%s\n' "$runtime_mongo_url"
}

stack_compose() {
  docker compose \
    --project-directory "$STACK_DIR" \
    --env-file "$TARGET_ENV_FILE" \
    -f "$TARGET_COMPOSE_FILE" \
    "$@"
}

set_boolean_env_var() {
  local key="$1"
  local value="$2"
  local file_path="$3"

  if [[ ! -f "$file_path" ]]; then
    error "Environment file not found: $file_path"
    exit 1
  fi

  if grep -q "^${key}=" "$file_path" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file_path"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file_path"
  fi
}

check_network_if_needed() {
  refresh_docker_network
  if [[ -n "$QLICKER_NETWORK" ]]; then
    if ! docker network inspect "$QLICKER_NETWORK" >/dev/null 2>&1; then
      error "Docker network '$QLICKER_NETWORK' not found."
      error "Start the target stack before seeding, or re-run ./setup.sh."
      exit 1
    fi
  fi
}

seed_runner() {
  local seed_mongo_url
  seed_mongo_url="$(current_mongo_url)"
  if is_local_address "$seed_mongo_url"; then
    seed_mongo_url="$(rewrite_localhost_for_docker "$seed_mongo_url")"
  fi

  local -a network_args=()
  if [[ -n "$QLICKER_NETWORK" ]]; then
    network_args=(--network "$QLICKER_NETWORK")
  fi

  local -a seed_env=()
  local pass_through_key=""
  for pass_through_key in MONGO_CONNECT_RETRIES MONGO_CONNECT_RETRY_DELAY_MS; do
    if [[ -n "${!pass_through_key:-}" ]]; then
      seed_env+=(-e "$pass_through_key=${!pass_through_key}")
    fi
  done

  docker run --rm \
    "${network_args[@]}" \
    --add-host=host.docker.internal:host-gateway \
    -e MONGO_URL="$seed_mongo_url" \
    "${seed_env[@]}" \
    -e STATE_DIR=/state \
    -v "$STATE_DIR:/state" \
    "$SEED_IMAGE" \
    "$@"
}

k6_runner() {
  local k6_base_url="$BASE_URL"
  if is_local_address "$k6_base_url"; then
    k6_base_url="$(rewrite_localhost_for_docker "$k6_base_url")"
  fi

  local -a network_args=()
  if [[ -n "$QLICKER_NETWORK" ]]; then
    network_args=(--network "$QLICKER_NETWORK")
  fi

  local -a docker_env=()
  local -a k6_env=()
  local pass_through_key=""
  for pass_through_key in \
    SESSION_CHAT_ENABLED \
    ANSWER_WINDOW_S \
    STATS_PAUSE_S \
    CORRECT_PAUSE_S \
    JOIN_GRACE_S \
    RESPONSE_ADDED_REFRESH_MS \
    STUDENT_LOGIN_SPREAD_S \
    CHAT_ACTIVITY_EVERY_N_QUESTIONS \
    CHAT_VIEWER_STUDENT_FRACTION \
    CHAT_QUICK_POST_STUDENT_FRACTION \
    CHAT_RANDOM_POST_STUDENT_FRACTION \
    CHAT_RANDOM_UPVOTE_STUDENT_FRACTION \
    CHAT_ACTION_JITTER_MS \
    CHAT_REPLY_PROFESSOR_LIMIT \
    PROFESSOR_REPLY_DELAY_MS; do
    if [[ -n "${!pass_through_key:-}" ]]; then
      docker_env+=(-e "$pass_through_key=${!pass_through_key}")
      k6_env+=(--env "$pass_through_key=${!pass_through_key}")
    fi
  done

  docker run --rm \
    "${network_args[@]}" \
    --add-host=host.docker.internal:host-gateway \
    -e BASE_URL="$k6_base_url" \
    -e STATE_FILE=/state/state.json \
    "${docker_env[@]}" \
    -v "$SCRIPT_DIR/scenarios:/scenarios:ro" \
    -v "$STATE_DIR:/state:ro" \
    -v "$RESULTS_DIR:/results" \
    "$K6_IMAGE" \
    run \
      --env BASE_URL="$k6_base_url" \
      --env STATE_FILE=/state/state.json \
      "${k6_env[@]}" \
      /scenarios/live-session.js
}

require_seed_image() {
  if ! docker image inspect "$SEED_IMAGE" >/dev/null 2>&1; then
    error "Seed image '$SEED_IMAGE' not found."
    error "Run ./setup.sh to build it."
    exit 1
  fi
}

do_prepare() {
  info "Preparing the $TARGET_ENV/$TARGET_RUNTIME stack for load testing …"
  set_boolean_env_var DISABLE_RATE_LIMITS true "$TARGET_ENV_FILE"
  info "Set DISABLE_RATE_LIMITS=true in $TARGET_ENV_FILE"

  if [[ "$TARGET_RUNTIME" == "docker" ]]; then
    if [[ -z "$TARGET_COMPOSE_FILE" || ! -f "$TARGET_COMPOSE_FILE" ]]; then
      error "Docker compose file not found: $TARGET_COMPOSE_FILE"
      exit 1
    fi

    info "Recreating the server service with rate limits disabled …"
    stack_compose up -d server

    if [[ "$TARGET_ENV" == "prod" ]]; then
      info "Disabling nginx limit_req directives …"
      stack_compose exec -T nginx sh -c \
        "sed -i 's/^[[:space:]]*limit_req /#limit_req /g' /etc/nginx/conf.d/default.conf && nginx -s reload" \
        2>/dev/null || warn "Could not modify nginx config (is the prod nginx container running?)."
    fi

    info "Prepare complete ✓"
    return 0
  fi

  warn "Native runtime detected."
  warn "Restart the server process to apply DISABLE_RATE_LIMITS=true before running the test."
  if [[ -x "$STACK_DIR/scripts/qlicker.sh" ]]; then
    warn "If you use qlicker.sh: (cd $STACK_DIR && ./scripts/qlicker.sh restart)"
  fi
}

do_restore() {
  info "Restoring rate limits on the $TARGET_ENV/$TARGET_RUNTIME stack …"
  set_boolean_env_var DISABLE_RATE_LIMITS false "$TARGET_ENV_FILE"
  info "Set DISABLE_RATE_LIMITS=false in $TARGET_ENV_FILE"

  if [[ "$TARGET_RUNTIME" == "docker" ]]; then
    if [[ -z "$TARGET_COMPOSE_FILE" || ! -f "$TARGET_COMPOSE_FILE" ]]; then
      error "Docker compose file not found: $TARGET_COMPOSE_FILE"
      exit 1
    fi

    info "Recreating the server service with rate limits enabled …"
    stack_compose up -d server

    if [[ "$TARGET_ENV" == "prod" ]]; then
      info "Restarting nginx to restore its rendered rate-limit config …"
      stack_compose restart nginx
    fi

    info "Restore complete ✓"
    return 0
  fi

  warn "Native runtime detected."
  warn "Restart the server process to apply DISABLE_RATE_LIMITS=false."
  if [[ -x "$STACK_DIR/scripts/qlicker.sh" ]]; then
    warn "If you use qlicker.sh: (cd $STACK_DIR && ./scripts/qlicker.sh restart)"
  fi
}

do_seed() {
  require_seed_image
  check_network_if_needed
  mkdir -p "$STATE_DIR"

  info "Seeding database with $NUM_STUDENTS students …"
  seed_runner --students "$NUM_STUDENTS"
  info "Seeding complete ✓"

  if [[ ! -f "$STATE_DIR/state.json" ]]; then
    error "state/state.json was not created. Check the seed output above."
    exit 1
  fi

  info "State file: $STATE_DIR/state.json"
}

do_test() {
  check_network_if_needed
  if [[ ! -f "$STATE_DIR/state.json" ]]; then
    error "state/state.json not found. Run seeding first: ./run.sh --seed-only"
    exit 1
  fi

  mkdir -p "$RESULTS_DIR"
  local timestamp
  timestamp="$(date +%Y%m%d-%H%M%S)"
  local result_log="$RESULTS_DIR/k6-${timestamp}.log"
  local session_chat_label="disabled"
  if [[ "$SESSION_CHAT_ENABLED" == "true" ]]; then
    session_chat_label="enabled"
  fi

  info "Running k6 load test against $BASE_URL …"
  info "Session chat: $session_chat_label"
  info "Results log: $result_log"
  echo ""

  set +e
  k6_runner 2>&1 | tee "$result_log"
  local k6_exit=${PIPESTATUS[0]}
  set -e

  echo ""
  if [[ $k6_exit -eq 0 ]]; then
    info "Load test PASSED ✓"
  else
    warn "Load test FAILED (exit code $k6_exit) — check thresholds in the log above."
  fi
  info "Full log saved to: $result_log"

  return $k6_exit
}

do_clean() {
  require_seed_image
  check_network_if_needed

  info "Cleaning load-test data from the database …"
  seed_runner --clean
  info "Cleanup complete ✓"

  rm -f "$STATE_DIR/state.json"
}

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
    TEST_EXIT=0
    do_test || TEST_EXIT=$?
    echo ""
    info "To clean up seed data later:  ./run.sh --clean"
    info "To restore rate limits:       ./run.sh --restore"
    exit "$TEST_EXIT"
    ;;
esac

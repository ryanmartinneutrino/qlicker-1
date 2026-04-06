#!/usr/bin/env bash
# =============================================================================
# Qlicker Production — Interactive Setup Script
# =============================================================================
# Generates the .env file, optionally obtains Let's Encrypt certificates,
# and optionally pulls app Docker images.
#
# Usage:
#   ./setup.sh                  # Interactive .env setup
#   ./setup.sh --init-certs     # Obtain initial Let's Encrypt certificate
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

# ---- Colors ----------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { printf "${GREEN}[INFO]${NC}  %s\n" "$*"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
error() { printf "${RED}[ERROR]${NC} %s\n" "$*"; }

# ---- Helpers ---------------------------------------------------------------
require_command() {
  if ! command -v "$1" &>/dev/null; then
    error "$1 is required but not installed."
    echo "  Install: $2"
    exit 1
  fi
}

choose_token_value() {
  local token_name="$1" existing_value="$2" output_var="$3" selected response
  if [ -n "$existing_value" ]; then
    while true; do
      read -r -p "$token_name already exists. Keep? [Y/n]: " response
      case "${response:-Y}" in
        [Yy]*) selected="$existing_value"; break ;;
        [Nn]*) selected="$(openssl rand -hex 32)"; info "Generated new $token_name"; break ;;
        *) echo "Please answer y or n." ;;
      esac
    done
  else
    selected="$(openssl rand -hex 32)"
    info "Generated $token_name"
  fi
  printf -v "$output_var" '%s' "$selected"
}

is_truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    1|y|yes|true|on) return 0 ;;
    *) return 1 ;;
  esac
}

prompt_yes_no() {
  local prompt="$1" default_value="${2:-false}" output_var="$3" response normalized
  local default_hint='y/N'
  if is_truthy "$default_value"; then default_hint='Y/n'; fi

  while true; do
    read -r -p "$prompt [$default_hint]: " response
    normalized="$(printf '%s' "${response:-}" | tr '[:upper:]' '[:lower:]')"
    if [ -z "$normalized" ]; then
      if is_truthy "$default_value"; then
        printf -v "$output_var" 'true'
      else
        printf -v "$output_var" 'false'
      fi
      return 0
    fi
    case "$normalized" in
      y|yes) printf -v "$output_var" 'true'; return 0 ;;
      n|no) printf -v "$output_var" 'false'; return 0 ;;
      *) echo "Please answer y or n." ;;
    esac
  done
}

pull_required_images() {
  local force_pull="${1:-false}" image
  local seen="|"
  local images=("${SERVER_IMAGE:-}" "${CLIENT_IMAGE:-}")

  for image in "${images[@]}"; do
    [ -n "$image" ] || continue

    case "$seen" in
      *"|$image|"*) continue ;;
      *) seen="${seen}${image}|" ;;
    esac

    if [ "$force_pull" = true ]; then
      info "Pulling (forced): $image"
      docker pull "$image"
      continue
    fi

    if docker image inspect "$image" >/dev/null 2>&1; then
      info "Image already present locally: $image"
    else
      info "Image missing locally. Pulling: $image"
      docker pull "$image"
    fi
  done
}

ensure_backup_directory_permissions() {
  local configured_backup_path="${1:-./backups}"
  local backup_dir compose_backup_dir
  local preferred_user="${SUDO_USER:-${USER:-}}"
  local owner_uid owner_gid

  compose_backup_dir="$SCRIPT_DIR/backups"
  backup_dir="$(resolve_host_path "$configured_backup_path")"

  if ! mkdir -p "$backup_dir"; then
    warn "Could not create $backup_dir. Create it manually before running backups."
    return 0
  fi

  if [ -n "$preferred_user" ] && id "$preferred_user" >/dev/null 2>&1; then
    owner_uid="$(id -u "$preferred_user")"
    owner_gid="$(id -g "$preferred_user")"
    if ! chown -R "$owner_uid:$owner_gid" "$backup_dir" 2>/dev/null; then
      warn "Could not update ownership on $backup_dir (requires elevated permissions in some environments)."
    fi
  fi

  if ! chmod 770 "$backup_dir" 2>/dev/null; then
    warn "Could not set permissions to 770 on $backup_dir."
  fi

  # Keep ./backups as a convenience path for scripts/operators while allowing
  # archives to live on another disk.
  if [ "$backup_dir" = "$compose_backup_dir" ]; then
    if [ -L "$compose_backup_dir" ]; then
      if rm -f "$compose_backup_dir" 2>/dev/null && mkdir -p "$compose_backup_dir" 2>/dev/null; then
        info "Using local backup directory at $compose_backup_dir."
      else
        warn "Could not replace symlink at $compose_backup_dir with a directory."
      fi
    fi
    return 0
  fi

  if [ -L "$compose_backup_dir" ]; then
    if ! rm -f "$compose_backup_dir" 2>/dev/null; then
      warn "Could not replace existing symlink at $compose_backup_dir."
      return 0
    fi
  elif [ -d "$compose_backup_dir" ]; then
    if [ -n "$(find "$compose_backup_dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
      warn "Cannot create symlink at $compose_backup_dir because that directory is not empty."
      warn "Move existing backup files first, then run: ln -sfn \"$backup_dir\" \"$compose_backup_dir\""
      return 0
    fi
    if ! rmdir "$compose_backup_dir" 2>/dev/null; then
      warn "Could not remove empty directory at $compose_backup_dir to create symlink."
      return 0
    fi
  elif [ -e "$compose_backup_dir" ]; then
    warn "Cannot create symlink at $compose_backup_dir because a file already exists there."
    return 0
  fi

  if ln -s "$backup_dir" "$compose_backup_dir" 2>/dev/null; then
    info "Linked $compose_backup_dir -> $backup_dir"
  else
    warn "Could not create symlink: $compose_backup_dir -> $backup_dir"
  fi
}

extract_image_repo() {
  local image_ref="$1" default_repo="$2" without_digest last_segment
  without_digest="${image_ref%@*}"
  if [ -z "$without_digest" ]; then
    printf '%s' "$default_repo"
    return 0
  fi
  last_segment="${without_digest##*/}"
  if [[ "$last_segment" == *:* ]]; then
    printf '%s' "${without_digest%:*}"
  else
    printf '%s' "$without_digest"
  fi
}

extract_image_tag() {
  local image_ref="$1" default_tag="$2" without_digest last_segment
  without_digest="${image_ref%@*}"
  last_segment="${without_digest##*/}"
  if [[ "$last_segment" == *:* ]]; then
    printf '%s' "${last_segment##*:}"
  else
    printf '%s' "$default_tag"
  fi
}

resolve_host_path() {
  local path="$1"
  if [[ "$path" == /* ]]; then
    printf '%s' "$path"
  else
    printf '%s/%s' "$SCRIPT_DIR" "${path#./}"
  fi
}

local_certs_exist() {
  [ -f "$SCRIPT_DIR/certs/fullchain.pem" ] && [ -f "$SCRIPT_DIR/certs/privkey.pem" ]
}

any_local_cert_exists() {
  [ -f "$SCRIPT_DIR/certs/fullchain.pem" ] || [ -f "$SCRIPT_DIR/certs/privkey.pem" ]
}

write_tls_paths_to_env() {
  local cert_path="$1" key_path="$2" tmp_env
  tmp_env="$(mktemp)"

  awk -v cert="$cert_path" -v key="$key_path" '
    BEGIN { cert_set=0; key_set=0 }
    /^TLS_CERT_PATH=/ { print "TLS_CERT_PATH=" cert; cert_set=1; next }
    /^TLS_KEY_PATH=/  { print "TLS_KEY_PATH=" key; key_set=1; next }
    { print }
    END {
      if (!cert_set) print "TLS_CERT_PATH=" cert
      if (!key_set) print "TLS_KEY_PATH=" key
    }
  ' "$ENV_FILE" > "$tmp_env"

  mv "$tmp_env" "$ENV_FILE"
}

http_get() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --max-time 10 "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$url"
  else
    return 127
  fi
}

verify_http01_preflight() {
  local domain="$1"
  local probe_token probe_value probe_url fetched

  probe_token="qlicker-acme-probe-$(openssl rand -hex 6)"
  probe_value="qlicker-acme-ok-$(date +%s)"
  probe_url="http://$domain/.well-known/acme-challenge/$probe_token"

  docker compose -f "$SCRIPT_DIR/docker-compose.yml" run --rm --entrypoint /bin/sh certbot \
    -c "mkdir -p /var/www/certbot/.well-known/acme-challenge && printf '%s' '$probe_value' > /var/www/certbot/.well-known/acme-challenge/$probe_token"

  if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    warn "Neither curl nor wget is installed on the host. Skipping HTTP-01 preflight check."
    return 0
  fi

  if ! fetched="$(http_get "$probe_url" 2>/dev/null)"; then
    error "HTTP-01 preflight failed: could not fetch $probe_url"
    warn "Check DNS for $domain, ensure port 80 is open, and ensure no external proxy blocks ACME."
    return 1
  fi

  if [ "$fetched" != "$probe_value" ]; then
    error "HTTP-01 preflight failed: challenge content mismatch from $probe_url"
    warn "The request is not reaching this nginx/certbot webroot pair."
    warn "Check DNS, reverse proxies/CDN settings, and any host-level web server on port 80."
    return 1
  fi

  return 0
}

generate_self_signed_cert() {
  local cert_path="$1" key_path="$2" domain="$3"
  local cert_host_path key_host_path

  cert_host_path="$(resolve_host_path "$cert_path")"
  key_host_path="$(resolve_host_path "$key_path")"

  mkdir -p "$(dirname "$cert_host_path")" "$(dirname "$key_host_path")"
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$key_host_path" \
    -out "$cert_host_path" \
    -subj "/CN=$domain" 2>/dev/null
}

# ---- Let's Encrypt initial certificate -------------------------------------
init_certs() {
  require_command docker "https://docs.docker.com/get-docker/"

  if [ ! -f "$ENV_FILE" ]; then
    error ".env file not found. Run ./setup.sh first to create it."
    exit 1
  fi

  set -a; . "$ENV_FILE"; set +a

  if [ -z "${DOMAIN:-}" ]; then
    error "DOMAIN is not set in .env"
    exit 1
  fi

  read -r -p "Email for Let's Encrypt notifications: " CERTBOT_EMAIL
  if [ -z "$CERTBOT_EMAIL" ]; then
    error "Email is required for Let's Encrypt."
    exit 1
  fi

  info "Obtaining certificate for $DOMAIN ..."

  if any_local_cert_exists; then
    warn "Existing files in ./certs/ will be overwritten with new Let's Encrypt certificates."
    read -r -p "Continue and overwrite ./certs/fullchain.pem and ./certs/privkey.pem? [y/N]: " OVERWRITE_CERTS
    if [[ ! "${OVERWRITE_CERTS:-N}" =~ ^[Yy]$ ]]; then
      warn "Keeping existing files in ./certs/. Let's Encrypt initialization cancelled."
      return 1
    fi
  fi

  # Start nginx temporarily for the ACME challenge
  mkdir -p "$SCRIPT_DIR/certs"
  # Create a temporary self-signed cert so nginx can start
  if [ ! -f "$SCRIPT_DIR/certs/fullchain.pem" ] || [ ! -f "$SCRIPT_DIR/certs/privkey.pem" ]; then
    openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
      -keyout "$SCRIPT_DIR/certs/privkey.pem" \
      -out "$SCRIPT_DIR/certs/fullchain.pem" \
      -subj "/CN=$DOMAIN" 2>/dev/null
    info "Created temporary self-signed certificate for initial ACME challenge."
  fi

  docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d nginx

  info "Running HTTP-01 preflight for $DOMAIN ..."
  if ! verify_http01_preflight "$DOMAIN"; then
    return 1
  fi

  local certbot_ok attempt
  certbot_ok=false
  for attempt in 1 2; do
    info "Requesting Let's Encrypt certificate (attempt $attempt/2) ..."
    if docker compose -f "$SCRIPT_DIR/docker-compose.yml" run --rm --entrypoint certbot certbot \
      certonly --webroot -w /var/www/certbot \
      --email "$CERTBOT_EMAIL" \
      --agree-tos --no-eff-email \
      --non-interactive --keep-until-expiring \
      --preferred-challenges http \
      -d "$DOMAIN"; then
      certbot_ok=true
      break
    fi

    warn "Certbot attempt $attempt failed."
    if [ "$attempt" -lt 2 ]; then
      warn "Retrying in 5 seconds ..."
      sleep 5
    fi
  done

  if [ "$certbot_ok" != true ]; then
    error "Let's Encrypt certificate request failed after 2 attempts."
    warn "Common causes: DNS not pointing to this host, port 80 blocked, or CDN/proxy interception."
    warn "If using Cloudflare, set the DNS record to 'DNS only' while issuing the certificate."
    return 1
  fi

  local cert_tmp key_tmp
  cert_tmp="$(mktemp)"
  key_tmp="$(mktemp)"

  docker compose -f "$SCRIPT_DIR/docker-compose.yml" run --rm --entrypoint /bin/sh certbot \
    -c "cat /etc/letsencrypt/live/$DOMAIN/fullchain.pem" > "$cert_tmp"
  docker compose -f "$SCRIPT_DIR/docker-compose.yml" run --rm --entrypoint /bin/sh certbot \
    -c "cat /etc/letsencrypt/live/$DOMAIN/privkey.pem" > "$key_tmp"

  if [ ! -s "$cert_tmp" ] || [ ! -s "$key_tmp" ]; then
    rm -f "$cert_tmp" "$key_tmp"
    error "Failed to export Let's Encrypt certificates from certbot."
    return 1
  fi

  cp "$cert_tmp" "$SCRIPT_DIR/certs/fullchain.pem"
  cp "$key_tmp" "$SCRIPT_DIR/certs/privkey.pem"
  chmod 644 "$SCRIPT_DIR/certs/fullchain.pem"
  chmod 600 "$SCRIPT_DIR/certs/privkey.pem"
  rm -f "$cert_tmp" "$key_tmp"

  info "Updated ./certs/fullchain.pem and ./certs/privkey.pem with Let's Encrypt certificates."

  # Update .env to point at local cert paths used by nginx volume mounts
  write_tls_paths_to_env "./certs/fullchain.pem" "./certs/privkey.pem"

  # Restart nginx with real certs
  docker compose -f "$SCRIPT_DIR/docker-compose.yml" restart nginx

  info "Certificate obtained! The certbot service will auto-renew."
  return 0
}

# ---- Handle --init-certs flag -----------------------------------------------
if [ "${1:-}" = "--init-certs" ]; then
  init_certs
  exit 0
fi

# =============================================================================
# Interactive .env setup
# =============================================================================
echo "======================================"
echo "  Qlicker — Production Setup"
echo "======================================"
echo ""

require_command docker "https://docs.docker.com/get-docker/"
require_command openssl "sudo apt-get install openssl  OR  brew install openssl"

# Check Docker Compose
if docker compose version &>/dev/null 2>&1; then
  info "Docker Compose $(docker compose version --short 2>/dev/null)"
else
  error "Docker Compose plugin not found."
  echo "  Install: https://docs.docker.com/compose/install/"
  exit 1
fi

# ---------------------------------------------------------------------------
# Load defaults from existing config files (most-specific wins)
# ---------------------------------------------------------------------------
# Priority: production .env  >  root-level .env  >  production .env.example
# This ensures re-runs propose the current production values, and first-time
# users coming from the dev setup inherit their existing configuration.
# ---------------------------------------------------------------------------
LOADED_FROM=""

if [ -f "$ENV_FILE" ]; then
  info "Existing production .env found — using current values as defaults."
  set -a; . "$ENV_FILE"; set +a
  LOADED_FROM="$ENV_FILE"
elif [ -f "$PROJECT_ROOT/.env" ]; then
  info "Root-level .env found (development config) — importing as defaults."
  set -a; . "$PROJECT_ROOT/.env"; set +a
  LOADED_FROM="$PROJECT_ROOT/.env"
elif [ -f "$ENV_EXAMPLE" ]; then
  # .env.example is not sourced directly (it has comments and ${} refs), but
  # we note it so the user knows where static defaults originate.
  info "No existing .env found. Using .env.example defaults."
fi

# Show summary of imported defaults
if [ -n "$LOADED_FROM" ]; then
  echo ""
  echo "  Imported defaults from: $LOADED_FROM"
  [ -n "${DOMAIN:-}" ]       && echo "    DOMAIN=$DOMAIN"
  [ -n "${SERVER_IMAGE:-}" ] && echo "    SERVER_IMAGE=$SERVER_IMAGE"
  [ -n "${CLIENT_IMAGE:-}" ] && echo "    CLIENT_IMAGE=$CLIENT_IMAGE"
  [ -n "${MAIL_URL:-}" ]     && echo "    MAIL_URL=$MAIL_URL"
  [ -n "${BACKUP_HOST_PATH:-}" ] && echo "    BACKUP_HOST_PATH=$BACKUP_HOST_PATH"
  [ -n "${JWT_SECRET:-}" ]   && echo "    JWT_SECRET=(set)"
  [ -n "${SERVER_REPLICAS:-}" ] && echo "    SERVER_REPLICAS=$SERVER_REPLICAS"
  [ -n "${CERTBOT_AUTORENEW:-}" ] && echo "    CERTBOT_AUTORENEW=$CERTBOT_AUTORENEW"
  echo ""
  echo "  Press Enter at each prompt to keep the shown default, or type a new value."
fi

# ---- Domain -----------------------------------------------------------------
echo ""
echo "--- Domain Configuration ---"
DEFAULT_DOMAIN="${DOMAIN:-qlicker.example.com}"
read -r -p "Domain name [$DEFAULT_DOMAIN]: " DOMAIN_INPUT
DOMAIN="${DOMAIN_INPUT:-$DEFAULT_DOMAIN}"

# ---- Images -----------------------------------------------------------------
echo ""
echo "--- Container Images ---"
echo "  Enter image tags to use for server/client containers."
echo "  Existing image repositories (including custom registries) are preserved."
DEFAULT_SERVER_IMAGE="${SERVER_IMAGE:-qlicker/qlicker-server:latest}"
DEFAULT_CLIENT_IMAGE="${CLIENT_IMAGE:-qlicker/qlicker-client:latest}"
SERVER_IMAGE_REPO="$(extract_image_repo "$DEFAULT_SERVER_IMAGE" "qlicker/qlicker-server")"
CLIENT_IMAGE_REPO="$(extract_image_repo "$DEFAULT_CLIENT_IMAGE" "qlicker/qlicker-client")"
DEFAULT_SERVER_IMAGE_TAG="$(extract_image_tag "$DEFAULT_SERVER_IMAGE" "latest")"
DEFAULT_CLIENT_IMAGE_TAG="$(extract_image_tag "$DEFAULT_CLIENT_IMAGE" "latest")"
read -r -p "Server image tag [$DEFAULT_SERVER_IMAGE_TAG]: " SERVER_IMAGE_TAG_INPUT
SERVER_IMAGE_TAG="${SERVER_IMAGE_TAG_INPUT:-$DEFAULT_SERVER_IMAGE_TAG}"
read -r -p "Client image tag [$DEFAULT_CLIENT_IMAGE_TAG]: " CLIENT_IMAGE_TAG_INPUT
CLIENT_IMAGE_TAG="${CLIENT_IMAGE_TAG_INPUT:-$DEFAULT_CLIENT_IMAGE_TAG}"
SERVER_IMAGE="${SERVER_IMAGE_REPO}:${SERVER_IMAGE_TAG}"
CLIENT_IMAGE="${CLIENT_IMAGE_REPO}:${CLIENT_IMAGE_TAG}"
info "Using SERVER_IMAGE=$SERVER_IMAGE"
info "Using CLIENT_IMAGE=$CLIENT_IMAGE"

# ---- TLS -------------------------------------------------------------------
echo ""
echo "--- TLS Certificate ---"
echo "  Options:"
echo "    1) I already have certificate files (Let's Encrypt or other)"
echo "    2) Generate a Let's Encrypt certificate now"
echo "    3) Generate a self-signed certificate (testing only)"
echo ""
DEFAULT_TLS_CERT="${TLS_CERT_PATH:-./certs/fullchain.pem}"
DEFAULT_TLS_KEY="${TLS_KEY_PATH:-./certs/privkey.pem}"
DEFAULT_CERTBOT_AUTORENEW="${CERTBOT_AUTORENEW:-false}"
LOCAL_TLS_CERT="./certs/fullchain.pem"
LOCAL_TLS_KEY="./certs/privkey.pem"
REQUEST_LE_CERTS=false
CERTBOT_AUTORENEW="$DEFAULT_CERTBOT_AUTORENEW"

while true; do
  read -r -p "Choose TLS option [1-3]: " TLS_OPTION
  case "${TLS_OPTION:-}" in
    1)
      USE_EXISTING_LOCAL_CERTS=false
      if local_certs_exist; then
        read -r -p "Found certificates in ./certs/. Use these files? [Y/n]: " USE_LOCAL_CERTS
        case "${USE_LOCAL_CERTS:-Y}" in
          [Yy]*)
            TLS_CERT_PATH="$LOCAL_TLS_CERT"
            TLS_KEY_PATH="$LOCAL_TLS_KEY"
            USE_EXISTING_LOCAL_CERTS=true
            info "Using existing certificates from ./certs/"
            ;;
        esac
      fi

      if [ "$USE_EXISTING_LOCAL_CERTS" != true ]; then
        read -r -p "TLS certificate path [$DEFAULT_TLS_CERT]: " TLS_CERT_INPUT
        TLS_CERT_PATH="${TLS_CERT_INPUT:-$DEFAULT_TLS_CERT}"

        read -r -p "TLS private key path [$DEFAULT_TLS_KEY]: " TLS_KEY_INPUT
        TLS_KEY_PATH="${TLS_KEY_INPUT:-$DEFAULT_TLS_KEY}"

        CERT_HOST_PATH="$(resolve_host_path "$TLS_CERT_PATH")"
        KEY_HOST_PATH="$(resolve_host_path "$TLS_KEY_PATH")"
        MISSING_TLS_FILES=false

        if [ ! -f "$CERT_HOST_PATH" ]; then
          warn "Certificate file not found: $TLS_CERT_PATH"
          MISSING_TLS_FILES=true
        fi
        if [ ! -f "$KEY_HOST_PATH" ]; then
          warn "Private key file not found: $TLS_KEY_PATH"
          MISSING_TLS_FILES=true
        fi

        if [ "$MISSING_TLS_FILES" = true ]; then
          read -r -p "Continue with missing certificate files? [y/N]: " CONTINUE_WITH_MISSING_CERTS
          if [[ ! "${CONTINUE_WITH_MISSING_CERTS:-N}" =~ ^[Yy]$ ]]; then
            continue
          fi
        fi
      fi

      CERTBOT_AUTORENEW_DEFAULT="$DEFAULT_CERTBOT_AUTORENEW"
      if ! is_truthy "$CERTBOT_AUTORENEW_DEFAULT"; then
        if [[ "$TLS_CERT_PATH" == ./certs/* && "$TLS_KEY_PATH" == ./certs/* ]]; then
          CERTBOT_AUTORENEW_DEFAULT=true
        elif [[ "$TLS_CERT_PATH" == *letsencrypt* || "$TLS_KEY_PATH" == *letsencrypt* ]]; then
          CERTBOT_AUTORENEW_DEFAULT=true
        fi
      fi
      echo ""
      echo "  If these files are managed by Let's Encrypt, enable auto-renew to keep certs current."
      prompt_yes_no "Enable automatic Let's Encrypt renewal?" "$CERTBOT_AUTORENEW_DEFAULT" CERTBOT_AUTORENEW
      break
      ;;
    2)
      TLS_CERT_PATH="$LOCAL_TLS_CERT"
      TLS_KEY_PATH="$LOCAL_TLS_KEY"
      REQUEST_LE_CERTS=true
      prompt_yes_no "Enable automatic Let's Encrypt renewal after setup?" "true" CERTBOT_AUTORENEW
      info "Let's Encrypt selected. setup.sh will run certificate initialization after writing .env."
      break
      ;;
    3)
      TLS_CERT_PATH="$LOCAL_TLS_CERT"
      TLS_KEY_PATH="$LOCAL_TLS_KEY"
      CERTBOT_AUTORENEW=false
      if local_certs_exist; then
        read -r -p "Existing certificates found in ./certs/. Regenerate self-signed files? [y/N]: " REPLACE_SELF_SIGNED
        if [[ ! "${REPLACE_SELF_SIGNED:-N}" =~ ^[Yy]$ ]]; then
          info "Keeping existing certificates in ./certs/"
          break
        fi
      fi

      generate_self_signed_cert "$TLS_CERT_PATH" "$TLS_KEY_PATH" "$DOMAIN"
      info "Self-signed certificate generated in ./certs/"
      warn "For production, replace with a real certificate or run: ./setup.sh --init-certs"
      break
      ;;
    *)
      echo "Please choose 1, 2, or 3."
      ;;
  esac
done

# ---- Scaling ----------------------------------------------------------------
echo ""
echo "--- Server Scaling ---"
echo "  Each API server replica handles ~500 concurrent WebSocket connections."
echo "  Recommended: 2 for small deployments, 3-4 for 1000+ concurrent users."
DEFAULT_REPLICAS="${SERVER_REPLICAS:-2}"
read -r -p "Number of API server replicas [$DEFAULT_REPLICAS]: " REPLICAS_INPUT
SERVER_REPLICAS="${REPLICAS_INPUT:-$DEFAULT_REPLICAS}"

# Validate numeric
if ! [[ "$SERVER_REPLICAS" =~ ^[0-9]+$ ]] || [ "$SERVER_REPLICAS" -lt 1 ]; then
  warn "Invalid replica count. Using default: 2"
  SERVER_REPLICAS=2
fi

# ---- JWT Secrets ------------------------------------------------------------
echo ""
echo "--- JWT Secrets ---"
choose_token_value "JWT_SECRET" "${JWT_SECRET:-}" JWT_SECRET
choose_token_value "JWT_REFRESH_SECRET" "${JWT_REFRESH_SECRET:-}" JWT_REFRESH_SECRET

# ---- Email ------------------------------------------------------------------
echo ""
echo "--- Email Configuration ---"
echo "  Required for password reset and email verification."
echo "  Format: smtp://user:password@smtp.example.com:587"
DEFAULT_MAIL_URL="${MAIL_URL:-}"
read -r -p "MAIL_URL [$DEFAULT_MAIL_URL]: " MAIL_URL_INPUT
MAIL_URL="${MAIL_URL_INPUT:-$DEFAULT_MAIL_URL}"
if [ -z "$MAIL_URL" ]; then
  warn "MAIL_URL not set — email features will not work until configured."
fi

# ---- Database ---------------------------------------------------------------
echo ""
echo "--- Database ---"
echo "  Default uses the built-in Docker MongoDB service."
echo "  Change this only if using an external/managed MongoDB instance."
DEFAULT_MONGO_ROOT_USERNAME="${MONGO_INITDB_ROOT_USERNAME:-qlickerAdmin}"
read -r -p "MongoDB admin username [$DEFAULT_MONGO_ROOT_USERNAME]: " MONGO_INITDB_ROOT_USERNAME_INPUT
MONGO_INITDB_ROOT_USERNAME="${MONGO_INITDB_ROOT_USERNAME_INPUT:-$DEFAULT_MONGO_ROOT_USERNAME}"
choose_token_value "MONGO_INITDB_ROOT_PASSWORD" "${MONGO_INITDB_ROOT_PASSWORD:-}" MONGO_INITDB_ROOT_PASSWORD
DEFAULT_MONGO_URI="${MONGO_URI:-mongodb://${MONGO_INITDB_ROOT_USERNAME}:${MONGO_INITDB_ROOT_PASSWORD}@mongo:27017/qlicker?authSource=admin}"
read -r -p "MONGO_URI [$DEFAULT_MONGO_URI]: " MONGO_URI_INPUT
MONGO_URI="${MONGO_URI_INPUT:-$DEFAULT_MONGO_URI}"
DEFAULT_MONGO_CACHE_GB="${MONGO_WIREDTIGER_CACHE_SIZE_GB:-0.25}"
read -r -p "Mongo WiredTiger cache size in GB [$DEFAULT_MONGO_CACHE_GB]: " MONGO_CACHE_INPUT
MONGO_WIREDTIGER_CACHE_SIZE_GB="${MONGO_CACHE_INPUT:-$DEFAULT_MONGO_CACHE_GB}"
MONGO_MAX_POOL_SIZE="${MONGO_MAX_POOL_SIZE:-25}"
MONGO_MIN_POOL_SIZE="${MONGO_MIN_POOL_SIZE:-0}"
MONGO_SERVER_SELECTION_TIMEOUT_MS="${MONGO_SERVER_SELECTION_TIMEOUT_MS:-10000}"
MONGO_SOCKET_TIMEOUT_MS="${MONGO_SOCKET_TIMEOUT_MS:-45000}"
MONGO_CONNECT_RETRIES="${MONGO_CONNECT_RETRIES:-6}"
MONGO_CONNECT_RETRY_DELAY_MS="${MONGO_CONNECT_RETRY_DELAY_MS:-2000}"

# ---- Redis ------------------------------------------------------------------
echo ""
echo "--- Redis ---"
echo "  Required for multi-instance WebSocket synchronization."
echo "  Default uses the built-in Docker Redis service."
choose_token_value "REDIS_PASSWORD" "${REDIS_PASSWORD:-}" REDIS_PASSWORD
DEFAULT_REDIS_URL="${REDIS_URL:-redis://:${REDIS_PASSWORD}@redis:6379}"
read -r -p "REDIS_URL [$DEFAULT_REDIS_URL]: " REDIS_URL_INPUT
REDIS_URL="${REDIS_URL_INPUT:-$DEFAULT_REDIS_URL}"

echo ""
info "Storage backend defaults to local on first boot."
echo "  Switch to S3 or Azure later from Admin -> Storage after signing in."

# ---- Backup manager ---------------------------------------------------------
echo ""
echo "--- Backup Storage ---"
DEFAULT_BACKUP_HOST_PATH="${BACKUP_HOST_PATH:-./backups}"
read -r -p "Backup host directory [$DEFAULT_BACKUP_HOST_PATH]: " BACKUP_HOST_PATH_INPUT
BACKUP_HOST_PATH="${BACKUP_HOST_PATH_INPUT:-$DEFAULT_BACKUP_HOST_PATH}"
if [ -z "$BACKUP_HOST_PATH" ]; then
  BACKUP_HOST_PATH="./backups"
fi
if [[ "$BACKUP_HOST_PATH" == *[[:space:]]* ]]; then
  warn "Backup host path contains whitespace. Docker Compose path parsing may fail."
fi
BACKUP_HOST_PATH_RESOLVED="$(resolve_host_path "$BACKUP_HOST_PATH")"
info "Backup archives will be stored on host at: $BACKUP_HOST_PATH_RESOLVED"

BACKUP_CHECK_INTERVAL_SECONDS="${BACKUP_CHECK_INTERVAL_SECONDS:-60}"
TZ="${TZ:-UTC}"
info "Ensuring backup directory exists with writable permissions..."
ensure_backup_directory_permissions "$BACKUP_HOST_PATH"

# ---- Write .env file --------------------------------------------------------
echo ""
info "Writing .env file..."

ORIGINAL_UMASK="$(umask)"
umask 077
cat > "$ENV_FILE" <<EOF
# =============================================================================
# Qlicker Production Environment — generated by setup.sh
# =============================================================================

# Domain & TLS
DOMAIN=$DOMAIN
TLS_CERT_PATH=$TLS_CERT_PATH
TLS_KEY_PATH=$TLS_KEY_PATH
CERTBOT_AUTORENEW=$CERTBOT_AUTORENEW

# Images
SERVER_IMAGE=$SERVER_IMAGE
CLIENT_IMAGE=$CLIENT_IMAGE

# Scaling
SERVER_REPLICAS=$SERVER_REPLICAS

# Secrets
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET

# Database
MONGO_INITDB_ROOT_USERNAME=$MONGO_INITDB_ROOT_USERNAME
MONGO_INITDB_ROOT_PASSWORD=$MONGO_INITDB_ROOT_PASSWORD
MONGO_URI=$MONGO_URI
MONGO_WIREDTIGER_CACHE_SIZE_GB=$MONGO_WIREDTIGER_CACHE_SIZE_GB
MONGO_MAX_POOL_SIZE=$MONGO_MAX_POOL_SIZE
MONGO_MIN_POOL_SIZE=$MONGO_MIN_POOL_SIZE
MONGO_SERVER_SELECTION_TIMEOUT_MS=$MONGO_SERVER_SELECTION_TIMEOUT_MS
MONGO_SOCKET_TIMEOUT_MS=$MONGO_SOCKET_TIMEOUT_MS
MONGO_CONNECT_RETRIES=$MONGO_CONNECT_RETRIES
MONGO_CONNECT_RETRY_DELAY_MS=$MONGO_CONNECT_RETRY_DELAY_MS

# Email
MAIL_URL=$MAIL_URL

# Redis
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_URL=$REDIS_URL

# Internal
API_PORT=3001
NODE_ENV=production
ROOT_URL=https://$DOMAIN
BACKUP_HOST_PATH=$BACKUP_HOST_PATH
BACKUP_CHECK_INTERVAL_SECONDS=$BACKUP_CHECK_INTERVAL_SECONDS
TZ=$TZ
EOF
umask "$ORIGINAL_UMASK"
chmod 600 "$ENV_FILE" 2>/dev/null || warn "Could not restrict $ENV_FILE to mode 600."

info ".env written to $ENV_FILE"

# ---- Optionally initialize Let's Encrypt -------------------------------------
if [ "$REQUEST_LE_CERTS" = true ]; then
  echo ""
  info "Starting Let's Encrypt certificate initialization..."
  if init_certs; then
    set -a; . "$ENV_FILE"; set +a
    TLS_CERT_PATH="${TLS_CERT_PATH:-$LOCAL_TLS_CERT}"
    TLS_KEY_PATH="${TLS_KEY_PATH:-$LOCAL_TLS_KEY}"
    info "Let's Encrypt certificates configured successfully."
  else
    warn "Let's Encrypt initialization did not complete."
    warn "You can retry later with: ./setup.sh --init-certs"
  fi
fi

# ---- Optionally pull app images ---------------------------------------------
echo ""
PULL_IMAGES_NOW=false
FORCE_PULL_IMAGES=false
prompt_yes_no "Pull app images now?" "true" PULL_IMAGES_NOW
if [ "$PULL_IMAGES_NOW" = true ]; then
  echo "  Choose whether to refresh tags even if images already exist locally."
  echo "  Use this to update mutable tags such as :latest."
  prompt_yes_no "Force pull and refresh existing tags?" "false" FORCE_PULL_IMAGES
  pull_required_images "$FORCE_PULL_IMAGES"
  info "Image pull step completed."
fi

# ---- Done -------------------------------------------------------------------
echo ""
echo "======================================"
echo "  Setup Complete!"
echo "======================================"
echo ""
echo "  .env file:   $ENV_FILE"
echo "  Replicas:    $SERVER_REPLICAS API servers"
echo "  Domain:      $DOMAIN"
echo "  TLS cert:    $TLS_CERT_PATH"
echo "  Auto-renew:  $CERTBOT_AUTORENEW"
echo "  Backups:     $BACKUP_HOST_PATH"
echo ""
echo "  Next steps:"
echo "    1. Review and edit .env if needed"
if [[ "$TLS_CERT_PATH" == ./certs/* ]]; then
if [ "$CERTBOT_AUTORENEW" = true ]; then
echo "    2. Let's Encrypt auto-renew is enabled."
echo "       If you have not issued certs yet: ./setup.sh --init-certs"
else
echo "    2. For real TLS: ./setup.sh --init-certs  (Let's Encrypt)"
echo "       Or replace ./certs/ files with your own certificate"
fi
fi
echo "    3. Start:   docker compose up -d"
echo "    4. Check:   docker compose ps"
echo "    5. Logs:    docker compose logs -f"
echo ""
echo "  Initialize from legacy database:"
echo "    ./init-from-legacy.sh"
echo ""
echo "  Create backup:"
echo "    ./backup.sh"
echo ""
echo "  Manage users:"
echo "    ./manage-user.sh --help"
echo ""

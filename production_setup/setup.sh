#!/usr/bin/env bash
# =============================================================================
# Qlicker Production — Interactive Setup Script
# =============================================================================
# Generates the .env file, optionally obtains Let's Encrypt certificates,
# and builds/pulls Docker images.
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

  docker compose -f "$SCRIPT_DIR/docker-compose.yml" run --rm --entrypoint certbot certbot \
    certonly --webroot -w /var/www/certbot \
    --email "$CERTBOT_EMAIL" \
    --agree-tos --no-eff-email \
    --non-interactive --keep-until-expiring \
    -d "$DOMAIN"

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
  [ -n "${MAIL_URL:-}" ]     && echo "    MAIL_URL=$MAIL_URL"
  [ -n "${STORAGE_TYPE:-}" ] && echo "    STORAGE_TYPE=$STORAGE_TYPE"
  [ -n "${JWT_SECRET:-}" ]   && echo "    JWT_SECRET=(set)"
  [ -n "${SERVER_REPLICAS:-}" ] && echo "    SERVER_REPLICAS=$SERVER_REPLICAS"
  echo ""
  echo "  Press Enter at each prompt to keep the shown default, or type a new value."
fi

# ---- Domain -----------------------------------------------------------------
echo ""
echo "--- Domain Configuration ---"
DEFAULT_DOMAIN="${DOMAIN:-qlicker.example.com}"
read -r -p "Domain name [$DEFAULT_DOMAIN]: " DOMAIN_INPUT
DOMAIN="${DOMAIN_INPUT:-$DEFAULT_DOMAIN}"

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
LOCAL_TLS_CERT="./certs/fullchain.pem"
LOCAL_TLS_KEY="./certs/privkey.pem"
REQUEST_LE_CERTS=false

while true; do
  read -r -p "Choose TLS option [1-3]: " TLS_OPTION
  case "${TLS_OPTION:-}" in
    1)
      if local_certs_exist; then
        read -r -p "Found certificates in ./certs/. Use these files? [Y/n]: " USE_LOCAL_CERTS
        case "${USE_LOCAL_CERTS:-Y}" in
          [Yy]*)
            TLS_CERT_PATH="$LOCAL_TLS_CERT"
            TLS_KEY_PATH="$LOCAL_TLS_KEY"
            info "Using existing certificates from ./certs/"
            break
            ;;
        esac
      fi

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
      break
      ;;
    2)
      TLS_CERT_PATH="$LOCAL_TLS_CERT"
      TLS_KEY_PATH="$LOCAL_TLS_KEY"
      REQUEST_LE_CERTS=true
      info "Let's Encrypt selected. setup.sh will run certificate initialization after writing .env."
      break
      ;;
    3)
      TLS_CERT_PATH="$LOCAL_TLS_CERT"
      TLS_KEY_PATH="$LOCAL_TLS_KEY"
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
DEFAULT_MONGO_URI="${MONGO_URI:-mongodb://mongo:27017/qlicker}"
read -r -p "MONGO_URI [$DEFAULT_MONGO_URI]: " MONGO_URI_INPUT
MONGO_URI="${MONGO_URI_INPUT:-$DEFAULT_MONGO_URI}"

# ---- Redis ------------------------------------------------------------------
echo ""
echo "--- Redis ---"
echo "  Required for multi-instance WebSocket synchronization."
echo "  Default uses the built-in Docker Redis service."
DEFAULT_REDIS_URL="${REDIS_URL:-redis://redis:6379}"
read -r -p "REDIS_URL [$DEFAULT_REDIS_URL]: " REDIS_URL_INPUT
REDIS_URL="${REDIS_URL_INPUT:-$DEFAULT_REDIS_URL}"

# ---- Storage ----------------------------------------------------------------
echo ""
echo "--- File Storage ---"
echo "  Options: local (default), s3, azure"
DEFAULT_STORAGE="${STORAGE_TYPE:-local}"
read -r -p "Storage type [$DEFAULT_STORAGE]: " STORAGE_INPUT
STORAGE_TYPE="${STORAGE_INPUT:-$DEFAULT_STORAGE}"

AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-}"
AWS_BUCKET="${AWS_BUCKET:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ENDPOINT="${AWS_ENDPOINT:-}"
AWS_FORCE_PATH_STYLE="${AWS_FORCE_PATH_STYLE:-false}"
AZURE_ACCOUNT_NAME="${AZURE_ACCOUNT_NAME:-}"
AZURE_ACCOUNT_KEY="${AZURE_ACCOUNT_KEY:-}"
AZURE_CONTAINER_NAME="${AZURE_CONTAINER_NAME:-}"

if [ "$STORAGE_TYPE" = "s3" ]; then
  echo "  Configure S3 settings:"
  read -r -p "  AWS_BUCKET [$AWS_BUCKET]: " input; AWS_BUCKET="${input:-$AWS_BUCKET}"
  read -r -p "  AWS_REGION [$AWS_REGION]: " input; AWS_REGION="${input:-$AWS_REGION}"
  read -r -p "  AWS_ACCESS_KEY_ID [$AWS_ACCESS_KEY_ID]: " input; AWS_ACCESS_KEY_ID="${input:-$AWS_ACCESS_KEY_ID}"
  read -r -p "  AWS_SECRET_ACCESS_KEY: " input; AWS_SECRET_ACCESS_KEY="${input:-$AWS_SECRET_ACCESS_KEY}"
  read -r -p "  AWS_ENDPOINT (blank for AWS) [$AWS_ENDPOINT]: " input; AWS_ENDPOINT="${input:-$AWS_ENDPOINT}"
  read -r -p "  AWS_FORCE_PATH_STYLE [$AWS_FORCE_PATH_STYLE]: " input; AWS_FORCE_PATH_STYLE="${input:-$AWS_FORCE_PATH_STYLE}"
elif [ "$STORAGE_TYPE" = "azure" ]; then
  echo "  Configure Azure Blob settings:"
  read -r -p "  AZURE_ACCOUNT_NAME [$AZURE_ACCOUNT_NAME]: " input; AZURE_ACCOUNT_NAME="${input:-$AZURE_ACCOUNT_NAME}"
  read -r -p "  AZURE_ACCOUNT_KEY: " input; AZURE_ACCOUNT_KEY="${input:-$AZURE_ACCOUNT_KEY}"
  read -r -p "  AZURE_CONTAINER_NAME [$AZURE_CONTAINER_NAME]: " input; AZURE_CONTAINER_NAME="${input:-$AZURE_CONTAINER_NAME}"
fi

# ---- Backup retention -------------------------------------------------------
echo ""
DEFAULT_RETENTION="${BACKUP_RETENTION_DAYS:-30}"
read -r -p "Backup retention (days) [$DEFAULT_RETENTION]: " RETENTION_INPUT
BACKUP_RETENTION_DAYS="${RETENTION_INPUT:-$DEFAULT_RETENTION}"

# ---- Write .env file --------------------------------------------------------
echo ""
info "Writing .env file..."

cat > "$ENV_FILE" <<EOF
# =============================================================================
# Qlicker Production Environment — generated by setup.sh
# =============================================================================

# Domain & TLS
DOMAIN=$DOMAIN
TLS_CERT_PATH=$TLS_CERT_PATH
TLS_KEY_PATH=$TLS_KEY_PATH

# Scaling
SERVER_REPLICAS=$SERVER_REPLICAS

# Secrets
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET

# Database
MONGO_URI=$MONGO_URI

# Email
MAIL_URL=$MAIL_URL

# Redis
REDIS_URL=$REDIS_URL

# Storage
STORAGE_TYPE=$STORAGE_TYPE
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
AWS_BUCKET=$AWS_BUCKET
AWS_REGION=$AWS_REGION
AWS_ENDPOINT=$AWS_ENDPOINT
AWS_FORCE_PATH_STYLE=$AWS_FORCE_PATH_STYLE
AZURE_ACCOUNT_NAME=$AZURE_ACCOUNT_NAME
AZURE_ACCOUNT_KEY=$AZURE_ACCOUNT_KEY
AZURE_CONTAINER_NAME=$AZURE_CONTAINER_NAME

# Internal
API_PORT=3001
NODE_ENV=production
ROOT_URL=https://$DOMAIN
BACKUP_RETENTION_DAYS=$BACKUP_RETENTION_DAYS
EOF

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

# ---- Optionally build images ------------------------------------------------
echo ""
read -r -p "Build Docker images now? [y/N]: " BUILD_NOW
if [[ "${BUILD_NOW:-N}" =~ ^[Yy]$ ]]; then
  info "Building images..."
  docker compose -f "$SCRIPT_DIR/docker-compose.yml" build
  info "Images built successfully."
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
echo ""
echo "  Next steps:"
echo "    1. Review and edit .env if needed"
if [[ "$TLS_CERT_PATH" == ./certs/* ]]; then
echo "    2. For real TLS: ./setup.sh --init-certs  (Let's Encrypt)"
echo "       Or replace ./certs/ files with your own certificate"
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

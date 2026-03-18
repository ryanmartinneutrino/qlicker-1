#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSO_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$SSO_DIR")"
ENV_FILE="$SSO_DIR/.env"
STATE_FILE="${QCLICKER_E2E_STATE_FILE:-/tmp/qlicker-sso-e2e-state.json}"
ADMIN_STATE_FILE="${QCLICKER_E2E_ADMIN_STATE_FILE:-/tmp/qlicker-sso-e2e-admin.json}"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$SSO_DIR/.env.example" "$ENV_FILE"
  echo "Created $ENV_FILE from .env.example. Review it before re-running if you need custom ports or credentials."
fi

load_env_file() {
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    local key="${line%%=*}"
    local value="${line#*=}"
    value="${value%$'\r'}"
    if [[ "$value" =~ ^\".*\"$ || "$value" =~ ^\'.*\'$ ]]; then
      value="${value:1:-1}"
    fi
    export "$key=$value"
  done < "$ENV_FILE"
}

load_env_file

"$SCRIPT_DIR/generate-certs.sh"
node "$SCRIPT_DIR/render-config.mjs"

cleanup() {
  (cd "$SSO_DIR" && docker compose down >/dev/null 2>&1 || true)
}
trap cleanup EXIT

(cd "$SSO_DIR" && docker compose up -d --build)

echo "Waiting for SimpleSAMLphp IdP to become healthy..."
for _ in {1..30}; do
  if curl -fsS "${SSOSERVER_BASE_URL}/simplesaml/" >/dev/null 2>&1; then
    break
  fi
  sleep 2
 done

curl -fsS "${SSOSERVER_BASE_URL}/simplesaml/" >/dev/null

echo "Ensuring Playwright Chromium is installed..."
(
  cd "$REPO_ROOT/client"
  npx playwright install chromium >/dev/null
)

echo "Running Playwright SSO smoke tests..."
(
  cd "$REPO_ROOT/client"
  APP_PORT="$(echo "$QCLICKER_APP_URL" | sed -E 's#^https?://[^:]+:([0-9]+).*$#\1#')" \
  API_PORT="$(echo "$QCLICKER_API_URL" | sed -E 's#^https?://[^:]+:([0-9]+).*$#\1#')" \
  QCLICKER_E2E_STATE_FILE="$STATE_FILE" \
  QCLICKER_E2E_ADMIN_STATE_FILE="$ADMIN_STATE_FILE" \
  QCLICKER_SSO_IDP_BASE_URL="$SSOSERVER_BASE_URL" \
  npm run test:e2e -- --config playwright.sso.config.js
)

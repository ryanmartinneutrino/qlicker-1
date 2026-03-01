#!/bin/bash
set -e

echo "======================================"
echo "  Qlicker - Native Setup Script"
echo "======================================"
echo ""

ERRORS=()
WARNINGS=()

# --------------------------------------------------
# Check Node.js >= 20
# --------------------------------------------------
if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 20 ]; then
    echo "[OK] Node.js $NODE_VERSION"
  else
    ERRORS+=("Node.js >= 20 required (found $NODE_VERSION)")
  fi
else
  ERRORS+=("Node.js not found")
fi

# --------------------------------------------------
# Check npm >= 10
# --------------------------------------------------
if command -v npm &>/dev/null; then
  NPM_VERSION=$(npm -v)
  NPM_MAJOR=$(echo "$NPM_VERSION" | cut -d. -f1)
  if [ "$NPM_MAJOR" -ge 10 ]; then
    echo "[OK] npm $NPM_VERSION"
  else
    ERRORS+=("npm >= 10 required (found $NPM_VERSION)")
  fi
else
  ERRORS+=("npm not found")
fi

# --------------------------------------------------
# Check MongoDB (mongod or mongosh)
# --------------------------------------------------
MONGO_FOUND=false
if command -v mongod &>/dev/null; then
  echo "[OK] mongod found"
  MONGO_FOUND=true
elif command -v mongosh &>/dev/null; then
  echo "[OK] mongosh found"
  MONGO_FOUND=true
else
  WARNINGS+=("MongoDB not found (mongod or mongosh). You can install it or use Docker instead.")
fi

# --------------------------------------------------
# Offer to install missing dependencies (Debian/Ubuntu)
# --------------------------------------------------
if [ ${#ERRORS[@]} -gt 0 ]; then
  echo ""
  echo "Missing dependencies:"
  for err in "${ERRORS[@]}"; do
    echo "  - $err"
  done

  if [ -f /etc/debian_version ]; then
    echo ""
    read -r -p "Attempt to install missing dependencies via apt-get? [y/N] " INSTALL_DEPS
    if [[ "$INSTALL_DEPS" =~ ^[Yy]$ ]]; then
      echo "Updating package list..."
      sudo apt-get update -qq

      if ! command -v node &>/dev/null || [ "$NODE_MAJOR" -lt 20 ]; then
        echo "Installing Node.js 20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
      fi

      if ! command -v mongod &>/dev/null && ! command -v mongosh &>/dev/null; then
        echo "Installing mongosh..."
        sudo apt-get install -y mongosh 2>/dev/null || echo "  mongosh not available in default repos. Install MongoDB manually."
      fi
    fi
  else
    echo ""
    echo "Automatic installation is only supported on Debian/Ubuntu."
    echo "Please install the missing dependencies manually and re-run this script."
    exit 1
  fi
fi

# --------------------------------------------------
# Ask for ports
# --------------------------------------------------
echo ""
echo "--- Port Configuration ---"

read -r -p "Client port [3000]: " APP_PORT
APP_PORT=${APP_PORT:-3000}

# Check for openssl (needed for secret generation)
if ! command -v openssl &>/dev/null; then
  echo "[ERROR] openssl is required to generate JWT secrets but was not found."
  echo "  Install it (e.g., sudo apt-get install openssl) and re-run."
  exit 1
fi

read -r -p "API/Server port [3001]: " API_PORT
API_PORT=${API_PORT:-3001}

read -r -p "MongoDB port [27017]: " MONGO_PORT
MONGO_PORT=${MONGO_PORT:-27017}

# Check if ports are free
check_port() {
  local PORT=$1
  local NAME=$2
  if command -v lsof &>/dev/null; then
    if lsof -iTCP:"$PORT" -sTCP:LISTEN -t &>/dev/null; then
      echo "[WARN] Port $PORT ($NAME) is already in use"
    else
      echo "[OK] Port $PORT ($NAME) is available"
    fi
  elif command -v ss &>/dev/null; then
    if ss -tlnp | grep -q ":$PORT "; then
      echo "[WARN] Port $PORT ($NAME) is already in use"
    else
      echo "[OK] Port $PORT ($NAME) is available"
    fi
  fi
}

check_port "$APP_PORT" "Client"
check_port "$API_PORT" "Server"
check_port "$MONGO_PORT" "MongoDB"

# --------------------------------------------------
# Generate .env file
# --------------------------------------------------
echo ""
echo "--- Generating .env file ---"

JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cat > "$PROJECT_ROOT/.env" <<EOF
# Server
PORT=$API_PORT
HOST=0.0.0.0
MONGO_URI=mongodb://localhost:$MONGO_PORT/qlicker
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
ROOT_URL=http://localhost:$APP_PORT
MAIL_URL=smtp://user:pass@smtp.example.com:587
NODE_ENV=development

# Client
VITE_API_URL=http://localhost:$API_PORT
VITE_WS_URL=ws://localhost:$API_PORT

# Ports (used by scripts)
APP_PORT=$APP_PORT
API_PORT=$API_PORT
MONGO_PORT=$MONGO_PORT

# Storage (optional)
STORAGE_TYPE=local
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_BUCKET=
AWS_REGION=
AZURE_ACCOUNT_NAME=
AZURE_ACCOUNT_KEY=
AZURE_CONTAINER_NAME=
EOF

echo "[OK] .env file generated at $PROJECT_ROOT/.env"

# --------------------------------------------------
# Install npm dependencies
# --------------------------------------------------
echo ""
echo "--- Installing dependencies ---"

echo "Installing server dependencies..."
(cd "$PROJECT_ROOT/server" && npm install)

echo "Installing client dependencies..."
(cd "$PROJECT_ROOT/client" && npm install)

# --------------------------------------------------
# Summary
# --------------------------------------------------
echo ""
echo "======================================"
echo "  Setup Complete!"
echo "======================================"
echo ""
echo "  Client URL:   http://localhost:$APP_PORT"
echo "  API URL:      http://localhost:$API_PORT"
echo "  MongoDB:      mongodb://localhost:$MONGO_PORT/qlicker"
echo ""
echo "  .env file:    $PROJECT_ROOT/.env"
echo ""
if [ ${#WARNINGS[@]} -gt 0 ]; then
  echo "  Warnings:"
  for w in "${WARNINGS[@]}"; do
    echo "    - $w"
  done
  echo ""
fi
echo "  Next steps:"
echo "    1. Start MongoDB:  mongod --dbpath /data/db"
echo "    2. Seed database:  ./scripts/seed-db.sh"
echo "    3. Start Qlicker:  ./scripts/qlicker.sh start"
echo ""

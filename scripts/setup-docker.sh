#!/bin/bash
set -e

echo "======================================"
echo "  Qlicker - Docker Setup Script"
echo "======================================"
echo ""

# --------------------------------------------------
# Check for Docker
# --------------------------------------------------
if command -v docker &>/dev/null; then
  DOCKER_VERSION=$(docker --version | head -1)
  echo "[OK] $DOCKER_VERSION"
else
  echo "[ERROR] Docker is not installed."
  echo "  Install Docker: https://docs.docker.com/get-docker/"
  exit 1
fi

# --------------------------------------------------
# Check for Docker Compose
# --------------------------------------------------
if docker compose version &>/dev/null 2>&1; then
  COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || docker compose version)
  echo "[OK] Docker Compose $COMPOSE_VERSION"
elif command -v docker-compose &>/dev/null; then
  COMPOSE_VERSION=$(docker-compose --version | head -1)
  echo "[OK] $COMPOSE_VERSION"
else
  echo "[ERROR] Docker Compose is not installed."
  echo "  Install Docker Compose: https://docs.docker.com/compose/install/"
  exit 1
fi

# --------------------------------------------------
# Ask for ports
# --------------------------------------------------
echo ""
echo "--- Port Configuration ---"

read -r -p "Client port [3000]: " APP_PORT
APP_PORT=${APP_PORT:-3000}

read -r -p "API/Server port [3001]: " API_PORT
API_PORT=${API_PORT:-3001}

read -r -p "MongoDB port [27017]: " MONGO_PORT
MONGO_PORT=${MONGO_PORT:-27017}

# --------------------------------------------------
# Ask for MAIL_URL
# --------------------------------------------------
echo ""
echo "--- Email Configuration ---"
echo "  MAIL_URL is required for email verification and password reset."
echo "  Format: smtp://user:password@smtp.example.com:587"
echo "  Leave blank to skip (emails will not be sent until configured)."
read -r -p "MAIL_URL []: " MAIL_URL
MAIL_URL=${MAIL_URL:-}
if [ -z "$MAIL_URL" ]; then
  echo "[WARN] MAIL_URL not set — email features (verification, password reset) will not work."
  echo "       Set MAIL_URL in the .env file later to enable email."
fi

# --------------------------------------------------
# Generate .env file for Docker Compose
# --------------------------------------------------
echo ""
echo "--- Generating .env file ---"

JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cat > "$PROJECT_ROOT/.env" <<EOF
# Docker Compose Environment
APP_PORT=$APP_PORT
API_PORT=$API_PORT
MONGO_PORT=$MONGO_PORT

# Server
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
ROOT_URL=http://localhost:$APP_PORT
MAIL_URL=$MAIL_URL
NODE_ENV=production
EOF

echo "[OK] .env file generated at $PROJECT_ROOT/.env"

# --------------------------------------------------
# Optionally build images
# --------------------------------------------------
echo ""
read -r -p "Build Docker images now? [y/N] " BUILD_NOW
if [[ "$BUILD_NOW" =~ ^[Yy]$ ]]; then
  echo "Building images..."
  (cd "$PROJECT_ROOT" && docker compose build)
  echo "[OK] Images built successfully"
fi

# --------------------------------------------------
# Instructions
# --------------------------------------------------
echo ""
echo "======================================"
echo "  Docker Setup Complete!"
echo "======================================"
echo ""
echo "  .env file: $PROJECT_ROOT/.env"
echo ""
echo "  Start all services:"
echo "    docker compose up -d"
echo ""
echo "  Stop all services:"
echo "    docker compose down"
echo ""
echo "  View logs:"
echo "    docker compose logs -f"
echo ""
echo "  Seed the database:"
echo "    ./scripts/seed-db-docker.sh"
echo ""
echo "  Endpoints:"
echo "    Client:  http://localhost:$APP_PORT"
echo "    API:     http://localhost:$API_PORT"
echo "    MongoDB: localhost:$MONGO_PORT"
echo ""
echo "  Production (with load balancing):"
echo "    docker compose -f docker-compose.prod.yml up -d"
echo ""

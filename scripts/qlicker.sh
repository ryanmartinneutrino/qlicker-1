#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_ROOT/.qlicker.pids"

# Load .env if present
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env"
  set +a
fi

APP_PORT=${APP_PORT:-3000}
API_PORT=${API_PORT:-3001}
MONGO_PORT=${MONGO_PORT:-27017}

start() {
  if [ -f "$PID_FILE" ]; then
    echo "Qlicker appears to be already running. Run './scripts/qlicker.sh stop' first."
    exit 1
  fi

  echo "Starting Qlicker..."
  PIDS=()

  # Start MongoDB if mongod is available and not already running
  if command -v mongod &>/dev/null; then
    if ! pgrep -x mongod &>/dev/null; then
      echo "  Starting MongoDB on port $MONGO_PORT..."
      mongod --port "$MONGO_PORT" --dbpath /tmp/qlicker-mongo --fork --logpath /tmp/qlicker-mongo.log 2>/dev/null || \
        (mkdir -p /tmp/qlicker-mongo && mongod --port "$MONGO_PORT" --dbpath /tmp/qlicker-mongo --fork --logpath /tmp/qlicker-mongo.log)
      MONGO_PID=$(pgrep -x mongod | tail -1)
      if [ -n "$MONGO_PID" ]; then
        PIDS+=("mongo:$MONGO_PID")
        echo "  [OK] MongoDB started (PID: $MONGO_PID)"
      fi
    else
      echo "  [OK] MongoDB already running"
    fi
  else
    echo "  [SKIP] mongod not found — assuming MongoDB is running externally"
  fi

  # Start server
  echo "  Starting server on port $API_PORT..."
  (cd "$PROJECT_ROOT/server" && node src/server.js &)
  SERVER_PID=$!
  PIDS+=("server:$SERVER_PID")
  echo "  [OK] Server started (PID: $SERVER_PID)"

  # Start client dev server
  echo "  Starting client on port $APP_PORT..."
  (cd "$PROJECT_ROOT/client" && npm run dev &)
  CLIENT_PID=$!
  PIDS+=("client:$CLIENT_PID")
  echo "  [OK] Client started (PID: $CLIENT_PID)"

  # Write PID file
  printf "%s\n" "${PIDS[@]}" > "$PID_FILE"

  echo ""
  echo "Qlicker is running!"
  echo "  Client: http://localhost:$APP_PORT"
  echo "  API:    http://localhost:$API_PORT"
  echo ""
  echo "  PID file: $PID_FILE"
  echo "  Stop with: ./scripts/qlicker.sh stop"
}

stop() {
  if [ ! -f "$PID_FILE" ]; then
    echo "No PID file found. Qlicker may not be running."
    exit 0
  fi

  echo "Stopping Qlicker..."
  while IFS= read -r line; do
    NAME=$(echo "$line" | cut -d: -f1)
    PID=$(echo "$line" | cut -d: -f2)
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null || true
      echo "  [OK] Stopped $NAME (PID: $PID)"
    else
      echo "  [SKIP] $NAME (PID: $PID) not running"
    fi
  done < "$PID_FILE"

  rm -f "$PID_FILE"
  echo "Qlicker stopped."
}

restart() {
  stop
  sleep 1
  start
}

status() {
  if [ ! -f "$PID_FILE" ]; then
    echo "Qlicker is not running (no PID file found)."
    exit 0
  fi

  echo "Qlicker status:"
  ALL_RUNNING=true
  while IFS= read -r line; do
    NAME=$(echo "$line" | cut -d: -f1)
    PID=$(echo "$line" | cut -d: -f2)
    if kill -0 "$PID" 2>/dev/null; then
      echo "  [RUNNING] $NAME (PID: $PID)"
    else
      echo "  [STOPPED] $NAME (PID: $PID)"
      ALL_RUNNING=false
    fi
  done < "$PID_FILE"

  if $ALL_RUNNING; then
    echo ""
    echo "All services are running."
  else
    echo ""
    echo "Some services have stopped."
  fi
}

case "${1:-}" in
  start)   start ;;
  stop)    stop ;;
  restart) restart ;;
  status)  status ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac

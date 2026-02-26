#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

: "${QCLICKER_CLIENT_PORT:=3200}"
: "${QCLICKER_SERVER_PORT:=3211}"
: "${QCLICKER_MONGO_PORT:=27018}"
: "${QCLICKER_ROOT_URL:=http://localhost:${QCLICKER_CLIENT_PORT}}"
: "${QCLICKER_RESTORE_LEGACY:=false}"
: "${QCLICKER_SEED_MOCK:=true}"

./scripts/guard-legacydb.sh

echo "[migration-compose-up] using ports: client=${QCLICKER_CLIENT_PORT} server=${QCLICKER_SERVER_PORT} mongo=${QCLICKER_MONGO_PORT}"
echo "[migration-compose-up] starting mongo + replica-set init"
docker compose up -d mongo1 mongo-init

if [[ "${QCLICKER_RESTORE_LEGACY}" == "true" ]]; then
  echo "[migration-compose-up] restoring legacy backup via docker profile"
  docker compose --profile legacy-restore run --rm legacy-restore
fi

echo "[migration-compose-up] starting server + client"
docker compose up -d server client

if [[ "${QCLICKER_SEED_MOCK}" == "true" && "${QCLICKER_RESTORE_LEGACY}" != "true" ]]; then
  echo "[migration-compose-up] seeding mock dataset"
  MONGO_URL="mongodb://localhost:${QCLICKER_MONGO_PORT}/qlicker?directConnection=true" ./seed-mock-db.sh
fi

cat <<EOF
[migration-compose-up] ready
- client: http://localhost:${QCLICKER_CLIENT_PORT}
- server: http://localhost:${QCLICKER_SERVER_PORT}
- mongo:  localhost:${QCLICKER_MONGO_PORT}

Export these for migration scripts:
  export API_BASE_URL=http://localhost:${QCLICKER_SERVER_PORT}
  export CLIENT_BASE_URL=http://localhost:${QCLICKER_CLIENT_PORT}
  export MONGO_PORT=${QCLICKER_MONGO_PORT}
  export MONGO_URL=mongodb://localhost:${QCLICKER_MONGO_PORT}/qlicker?directConnection=true
EOF

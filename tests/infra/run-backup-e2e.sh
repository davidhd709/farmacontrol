#!/usr/bin/env bash
# ==============================================================================
# Prueba de punta a punta de respaldos (AUD-013): PostgreSQL 18 real, herramientas de la
# imagen de la API, destino externo simulado con un remoto local de rclone.
# Requiere Docker y pnpm. Uso: tests/infra/run-backup-e2e.sh
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NETWORK=fc-backup-e2e
PG=fc-backup-e2e-pg
PG_PORT="${BACKUP_E2E_PG_PORT:-15499}"
# Misma imagen base que infra/docker/Dockerfile
TOOLS_IMAGE="$(grep -m1 -oE 'node:[^ ]+' "${ROOT_DIR}/infra/docker/Dockerfile")"

cleanup() {
  docker rm -f "${PG}" >/dev/null 2>&1 || true
  docker network rm "${NETWORK}" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker network create "${NETWORK}" >/dev/null
docker run -d --name "${PG}" --network "${NETWORK}" -p "127.0.0.1:${PG_PORT}:5432" \
  -e POSTGRES_PASSWORD=x -e POSTGRES_DB=farmacontrol postgres:18-alpine >/dev/null
until docker exec "${PG}" pg_isready -U postgres -d farmacontrol >/dev/null 2>&1; do sleep 1; done
sleep 2

echo "== Aplicando migraciones"
DATABASE_URL="postgresql://postgres:x@127.0.0.1:${PG_PORT}/farmacontrol?schema=public" \
  pnpm --dir "${ROOT_DIR}" --filter @farmacia/database exec prisma migrate deploy >/dev/null

# label=disable: los volúmenes montados desde discos sin etiquetas SELinux
docker run --rm --security-opt label=disable --network "${NETWORK}" -e TZ=America/Bogota \
  -v "${ROOT_DIR}/infra/scripts:/app/infra/scripts:ro" \
  -v "${ROOT_DIR}/tests/infra/backup-e2e.check.sh:/check.sh:ro" \
  --entrypoint sh "${TOOLS_IMAGE}" -c 'apk add --no-cache bash >/dev/null 2>&1 && bash /check.sh'

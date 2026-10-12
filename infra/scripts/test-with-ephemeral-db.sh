#!/usr/bin/env bash
# ==============================================================================
# Pruebas del monorepo contra un PostgreSQL temporal y exclusivo (FARM-AUD-014)
#
#   pnpm test                       suite completa
#   pnpm test apps/api/test/...     argumentos adicionales para Vitest
#   pnpm test:watch                 Vitest en modo observación (limpia al salir)
#
# 1. Exige Docker y un cliente PostgreSQL (pg_dump, pg_restore, pg_isready, psql) de la
#    misma versión mayor que el servidor o superior: la prueba de respaldos usa pg_dump real.
# 2. Crea un contenedor postgres:18-alpine con nombre, credenciales y puerto propios, datos en
#    tmpfs y etiqueta com.farmacontrol.test-run=<id>, y marca su base con COMMENT ON DATABASE
#    desde dentro del contenedor.
# 3. Descarta toda variable PG* heredada y exporta un entorno de conexión y de respaldos
#    completo (el .env local no se lee). Comprueba con psql (misma libpq que pg_dump) que ese
#    entorno llega a la base marcada.
# 4. Verifica el aislamiento, aplica migraciones y ejecuta Vitest en su propio grupo de
#    procesos: SIGINT/SIGTERM se reenvían solo a ese grupo.
# 5. Al salir, aun con fallos o señales, elimina solo el contenedor y el directorio temporal
#    cuya identidad (nombre + etiqueta, sello) corresponde a esta ejecución.
#
# FARMACIA_TEST_KEEP=1 conserva el contenedor para investigar un fallo.
# ==============================================================================

set -euo pipefail
umask 077

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG_MAJOR=18
PG_IMAGE="postgres:${PG_MAJOR}-alpine"
LABEL_KEY="com.farmacontrol.test-run"
DB_NAME="farmacia_test"
DB_USER="farmacontrol_ephemeral"
VITEST_MODE="${FARMACIA_TEST_VITEST_MODE:-run}"
SIGNAL_GRACE_SECONDS=20

log() { echo "[test-db] $*"; }
die() { echo "[test-db] ❌ $*" >&2; exit 1; }

case "${VITEST_MODE}" in
  run|watch) ;;
  *) die "FARMACIA_TEST_VITEST_MODE debe ser 'run' o 'watch'." ;;
esac

# Variables de libpq heredadas (PGHOSTADDR, PGSERVICE, PGPASSFILE, PGOPTIONS, PGCLUSTER...)
# podrían desviar pg_dump o node-postgres: se descartan todas y luego se fijan las permitidas
while IFS= read -r inherited; do
  unset "${inherited}"
done < <(compgen -e | grep '^PG' || true)

command -v docker >/dev/null 2>&1 || die "Docker es necesario para crear la base temporal de pruebas."
docker info >/dev/null 2>&1 || die "Docker no responde; no se ejecuta ninguna prueba."

for tool in pg_dump pg_restore pg_isready psql; do
  command -v "${tool}" >/dev/null 2>&1 \
    || die "Falta ${tool}: instale el cliente PostgreSQL ${PG_MAJOR} (la prueba de respaldos usa pg_dump real)."
done
CLIENT_MAJOR="$(pg_dump --version | sed -E 's/^[^0-9]*([0-9]+).*/\1/')"
if ! [[ "${CLIENT_MAJOR}" =~ ^[0-9]+$ ]] || [ "${CLIENT_MAJOR}" -lt "${PG_MAJOR}" ]; then
  die "pg_dump es de PostgreSQL ${CLIENT_MAJOR:-desconocido}; se requiere ${PG_MAJOR} o superior para volcar el servidor de pruebas."
fi

random_hex() { od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'; }

RUN_ID="$(date -u +%Y%m%d%H%M%S)-$(random_hex 6)"
CONTAINER_NAME="farmacontrol-test-${RUN_ID}"
DB_PASSWORD="$(random_hex 24)"
CONTAINER_ID=""
CONTAINER_REQUESTED=0
RUN_TMP=""
RUN_TMP_STAMP=".farmacontrol-test-run"
TEST_PID=""

# Elimina el contenedor solo si su nombre y su etiqueta son los de esta ejecución
remove_own_container() {
  local ref="$1" identity
  identity="$(docker inspect -f "{{.Name}}|{{index .Config.Labels \"${LABEL_KEY}\"}}" "${ref}" 2>/dev/null || true)"
  if [ -z "${identity}" ]; then
    return 0
  fi
  if [ "${identity}" = "/${CONTAINER_NAME}|${RUN_ID}" ]; then
    docker rm -f -v "${ref}" >/dev/null 2>&1 && log "Contenedor temporal eliminado."
  else
    log "⚠️ No se eliminó ${ref}: su nombre o etiqueta no corresponden a esta ejecución."
  fi
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  # Primero el directorio (instantáneo) y luego el contenedor: si un SIGKILL corta la limpieza
  # queda como mucho un contenedor etiquetado en tmpfs, no archivos en disco
  if [ -n "${RUN_TMP}" ] && [ -f "${RUN_TMP}/${RUN_TMP_STAMP}" ] \
    && [ "$(cat "${RUN_TMP}/${RUN_TMP_STAMP}")" = "${RUN_ID}" ]; then
    rm -rf "${RUN_TMP}"
  fi
  if [ "${CONTAINER_REQUESTED}" = "1" ]; then
    if [ "${FARMACIA_TEST_KEEP:-0}" = "1" ] && [ -n "${CONTAINER_ID}" ]; then
      log "Contenedor conservado: ${CONTAINER_NAME} (127.0.0.1:${PG_PORT:-?}, base ${DB_NAME}, usuario ${DB_USER})."
      log "Conectarse con: docker exec -it ${CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME}"
      log "Eliminarlo después con: docker rm -f -v ${CONTAINER_NAME}"
    else
      # Sin identificador (docker run falló a medias) se recupera por el nombre de esta ejecución
      remove_own_container "${CONTAINER_ID:-${CONTAINER_NAME}}"
    fi
  fi
  exit "${status}"
}

# Reenvía la señal solo al grupo de procesos de Vitest de esta ejecución y espera su salida
on_signal() {
  local signal="$1" code="$2"
  trap '' INT TERM
  if [ -n "${TEST_PID}" ] && kill -0 "${TEST_PID}" 2>/dev/null; then
    log "Señal ${signal}: deteniendo Vitest..."
    kill -s "${signal}" -- "-${TEST_PID}" 2>/dev/null || true
    for _ in $(seq 1 "${SIGNAL_GRACE_SECONDS}"); do
      kill -0 "${TEST_PID}" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "${TEST_PID}" 2>/dev/null; then
      kill -s KILL -- "-${TEST_PID}" 2>/dev/null || true
    fi
  fi
  exit "${code}"
}

trap cleanup EXIT
trap 'on_signal INT 130' INT
trap 'on_signal TERM 143' TERM

# Directorio temporal propio (0700), fuera del repositorio, con sello de la ejecución
RUN_TMP="$(mktemp -d "${TMPDIR:-/tmp}/farmacontrol-test-${RUN_ID}.XXXXXX")"
# Ruta canónica (sin enlaces en ningún componente): el guard la exige así
RUN_TMP="$(cd "${RUN_TMP}" && pwd -P)"
echo "${RUN_ID}" > "${RUN_TMP}/${RUN_TMP_STAMP}"
mkdir -p "${RUN_TMP}/backups"

# Credenciales por archivo: no aparecen en la línea de comandos (ps) del cliente Docker
cat > "${RUN_TMP}/postgres.env" <<EOF
POSTGRES_USER=${DB_USER}
POSTGRES_PASSWORD=${DB_PASSWORD}
POSTGRES_DB=${DB_NAME}
EOF

log "Ejecución ${RUN_ID}: creando ${CONTAINER_NAME} (${PG_IMAGE}, tmpfs, solo 127.0.0.1)..."
CONTAINER_REQUESTED=1
CONTAINER_ID="$(docker run -d \
  --name "${CONTAINER_NAME}" \
  --label "${LABEL_KEY}=${RUN_ID}" \
  --env-file "${RUN_TMP}/postgres.env" \
  -p 127.0.0.1::5432 \
  --tmpfs /var/lib/postgresql:rw,size=2g \
  "${PG_IMAGE}")" || die "No se pudo crear o iniciar la base temporal."
rm -f "${RUN_TMP}/postgres.env"

# Puerto asignado por Docker: nunca colisiona con instancias existentes
PG_PORT="$(docker port "${CONTAINER_ID}" 5432/tcp | grep -m1 '^127\.0\.0\.1:' | cut -d: -f2)"
[ -n "${PG_PORT}" ] || die "No se pudo determinar el puerto de la base temporal."

# Durante la inicialización el servidor solo escucha por socket; TCP indica que ya está listo
READY=0
for _ in $(seq 1 60); do
  if docker exec "${CONTAINER_ID}" pg_isready -h 127.0.0.1 -p 5432 -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
[ "${READY}" = "1" ] || die "La base temporal no quedó disponible en 60 s."

# Marca de propiedad: se escribe dentro del contenedor creado, sin pasar por la red del host
MARKER="farmacontrol-test-run:${RUN_ID}"
docker exec "${CONTAINER_ID}" psql -v ON_ERROR_STOP=1 -q -U "${DB_USER}" -d "${DB_NAME}" \
  -c "COMMENT ON DATABASE ${DB_NAME} IS '${MARKER}'" >/dev/null

DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PG_PORT}/${DB_NAME}?schema=public"

export FARMACIA_TEST_RUN_ID="${RUN_ID}"
export FARMACIA_TEST_RUN_DIR="${RUN_TMP}"
export NODE_ENV=test
export DATABASE_URL="${DB_URL}"
export DATABASE_TEST_URL="${DB_URL}"
export DB_USER DB_PASSWORD DB_NAME DB_TEST_NAME="${DB_NAME}" DB_PORT="${PG_PORT}"
export PGHOST=127.0.0.1 PGPORT="${PG_PORT}" PGUSER="${DB_USER}" PGPASSWORD="${DB_PASSWORD}" PGDATABASE="${DB_NAME}"
export BACKUP_DIR="${RUN_TMP}/backups"
export BACKUP_REMOTE="" BACKUP_AGE_RECIPIENT="" BACKUP_REQUIRE_OFFSITE=false

# El entorno libpq (el mismo que usa pg_dump en backup.sh) debe llegar a la base marcada
LIBPQ_MARKER="$(psql -X -A -t -q -c "SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = current_database()" 2>/dev/null || true)"
[ "${LIBPQ_MARKER}" = "${MARKER}" ] || die "El entorno libpq no llega a la base temporal de esta ejecución."

cd "${REPO_ROOT}"
mkdir -p "${REPO_ROOT}/.test-runs"

# Las pruebas importan @farmacia/contracts y @farmacia/database desde dist. Se compila con un
# candado y solo si las fuentes cambiaron: una ejecución simultánea no reescribe el dist que
# otra está usando
build_shared_packages() {
  local pkg dir
  if command -v flock >/dev/null 2>&1; then
    exec 9>"${REPO_ROOT}/.test-runs/.build.lock"
    flock 9
  fi
  for pkg in contracts database; do
    dir="${REPO_ROOT}/packages/${pkg}"
    if [ ! -f "${dir}/dist/index.js" ] \
      || [ -n "$(find "${dir}/src" "${dir}/package.json" "${dir}/tsconfig.json" -newer "${dir}/dist/index.js" -print -quit)" ]; then
      log "Compilando @farmacia/${pkg}..."
      pnpm --silent --filter "@farmacia/${pkg}" build
    fi
  done
  if command -v flock >/dev/null 2>&1; then
    flock -u 9
    exec 9>&-
  fi
}
build_shared_packages

log "Verificando aislamiento y aplicando migraciones..."
pnpm --silent --filter @farmacia/database db:test:migrate

RESULT_LOG="${REPO_ROOT}/.test-runs/${RUN_ID}.log"

if [ "${VITEST_MODE}" = "watch" ]; then
  # Modo interactivo: Vitest necesita la terminal; Ctrl+C llega a todo el grupo
  log "Ejecutando Vitest (watch)."
  set +e
  pnpm exec vitest "$@"
  TEST_STATUS=$?
  set -e
else
  log "Ejecutando Vitest (run); registro en .test-runs/${RUN_ID}.log"
  # Grupo de procesos propio (job control) para reenviar señales solo a esta ejecución
  set -m
  { pnpm exec vitest run "$@" 2>&1 < /dev/null | tee "${RESULT_LOG}"; exit "${PIPESTATUS[0]}"; } &
  TEST_PID=$!
  set +m
  set +e
  wait "${TEST_PID}"
  TEST_STATUS=$?
  set -e
  TEST_PID=""
fi

log "Vitest terminó con código ${TEST_STATUS}."
exit "${TEST_STATUS}"

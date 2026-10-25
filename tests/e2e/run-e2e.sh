#!/usr/bin/env bash
# ==============================================================================
# E2E de FarmaControl. Lo invoca infra/scripts/test-with-ephemeral-db.sh en modo e2e, con
# DATABASE_URL apuntando a la base temporal ya migrada; no se ejecuta solo.
#
# 1. Siembra permisos (RBAC) y un administrador con contraseña aleatoria.
# 2. Compila el API y la web, y los arranca en puertos libres de 127.0.0.1 (la web en modo
#    preview, con el mismo proxy /api/v1 que usa en desarrollo).
# 3. Ejecuta Playwright con los argumentos recibidos y detiene ambos procesos al salir.
# ==============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="${FARMACIA_TEST_RUN_DIR:?Se ejecuta desde test-with-ephemeral-db.sh}/e2e"
mkdir -p "${LOG_DIR}"

log() { echo "[e2e] $*"; }
die() { echo "[e2e] ❌ $*" >&2; exit 1; }

[ -n "${DATABASE_URL:-}" ] || die "Falta DATABASE_URL de la base temporal."

free_port() {
  node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}

API_PID=""
WEB_PID=""
stop_servers() {
  for pid in "${WEB_PID}" "${API_PID}"; do
    if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      for _ in $(seq 1 10); do kill -0 "${pid}" 2>/dev/null || break; sleep 1; done
      kill -9 "${pid}" 2>/dev/null || true
    fi
  done
}
trap stop_servers EXIT

wait_for_url() {
  local url="$1" name="$2" pid="$3" log_file="$4"
  for _ in $(seq 1 90); do
    if curl -fsS -o /dev/null "${url}" 2>/dev/null; then
      return 0
    fi
    kill -0 "${pid}" 2>/dev/null || { tail -n 40 "${log_file}" >&2; die "${name} terminó antes de responder."; }
    sleep 1
  done
  tail -n 40 "${log_file}" >&2
  die "${name} no respondió en 90 s (${url})."
}

cd "${REPO_ROOT}"

ADMIN_USERNAME="e2e_admin"
ADMIN_PASSWORD="E2e-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"

log "Sembrando permisos, plan de cuentas y administrador..."
pnpm --silent db:seed:rbac >"${LOG_DIR}/seed.log" 2>&1 || { cat "${LOG_DIR}/seed.log" >&2; die "Falló la siembra RBAC."; }
# Igual que una instalación: compras y ventas contabilizan en su transacción y exigen mapeos (ADR-004)
pnpm --silent db:seed:puc >>"${LOG_DIR}/seed.log" 2>&1 || { cat "${LOG_DIR}/seed.log" >&2; die "Falló la siembra del plan de cuentas."; }
INITIAL_ADMIN_USERNAME="${ADMIN_USERNAME}" INITIAL_ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
  pnpm --silent db:seed:admin >>"${LOG_DIR}/seed.log" 2>&1 || { cat "${LOG_DIR}/seed.log" >&2; die "Falló la creación del administrador."; }

API_PORT="$(free_port)"
WEB_PORT="$(free_port)"

log "Compilando API y web..."
pnpm --silent --filter @farmacia/api build >"${LOG_DIR}/build.log" 2>&1 || { tail -n 40 "${LOG_DIR}/build.log" >&2; die "Falló la compilación del API."; }
pnpm --silent --filter @farmacia/web exec vite build >>"${LOG_DIR}/build.log" 2>&1 || { tail -n 40 "${LOG_DIR}/build.log" >&2; die "Falló la compilación de la web."; }

log "Arrancando API en 127.0.0.1:${API_PORT}..."
(
  cd apps/api
  # Límite de login alto: las pruebas inician muchas sesiones desde la misma IP
  API_PORT="${API_PORT}" AUTH_RATE_LIMIT_MAX_ATTEMPTS=1000 AUTH_RATE_LIMIT_IP_MAX_ATTEMPTS=1000 \
    exec node dist/main.js
) >"${LOG_DIR}/api.log" 2>&1 &
API_PID=$!
wait_for_url "http://127.0.0.1:${API_PORT}/api/v1/health" "El API" "${API_PID}" "${LOG_DIR}/api.log"

log "Arrancando web en 127.0.0.1:${WEB_PORT}..."
(
  cd apps/web
  FARMACIA_API_PROXY_TARGET="http://127.0.0.1:${API_PORT}" \
    exec pnpm exec vite preview --host 127.0.0.1 --port "${WEB_PORT}" --strictPort
) >"${LOG_DIR}/web.log" 2>&1 &
WEB_PID=$!
wait_for_url "http://127.0.0.1:${WEB_PORT}/" "La web" "${WEB_PID}" "${LOG_DIR}/web.log"

export E2E_BASE_URL="http://127.0.0.1:${WEB_PORT}"
export E2E_ADMIN_USERNAME="${ADMIN_USERNAME}"
export E2E_ADMIN_PASSWORD="${ADMIN_PASSWORD}"
export E2E_OUTPUT_DIR="${REPO_ROOT}/.test-runs/e2e-${FARMACIA_TEST_RUN_ID}"

log "Ejecutando Playwright (resultados en .test-runs/e2e-${FARMACIA_TEST_RUN_ID})..."
set +e
pnpm exec playwright test --config tests/e2e/playwright.config.ts "$@"
STATUS=$?
set -e

if [ "${STATUS}" -ne 0 ]; then
  log "Últimas líneas del API:"
  tail -n 30 "${LOG_DIR}/api.log" || true
fi
exit "${STATUS}"

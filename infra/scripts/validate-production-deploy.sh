#!/usr/bin/env bash
# ==============================================================================
# FarmaControl — Script de Verificación de Configuración de Despliegue en Producción
# Valida la integridad estática de Dockerfile, Compose, Caddyfile, Nginx y Scripts.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "=================================================================="
echo " [DEPLOY CHECK] Iniciando verificación de infraestructura..."
echo " Directorio raíz: ${ROOT_DIR}"
echo "=================================================================="

FAILED=0

# 1. Validar Dockerfile multi-stage
echo " [1/5] Verificando Dockerfile multi-stage..."
DOCKERFILE="${ROOT_DIR}/infra/docker/Dockerfile"
if [ ! -f "${DOCKERFILE}" ]; then
  echo "  [ERROR] No se encontró ${DOCKERFILE}" >&2
  FAILED=1
else
  for stage in "AS build" "AS api" "AS worker" "AS web"; do
    if grep -q "${stage}" "${DOCKERFILE}"; then
      echo "  [OK] Etapa encontrada: ${stage}"
    else
      echo "  [ERROR] Falta la etapa requerida: ${stage}" >&2
      FAILED=1
    fi
  done
  if grep -q "postgresql-client" "${DOCKERFILE}"; then
    echo "  [OK] Herramientas postgresql-client instaladas en la etapa api"
  else
    echo "  [ERROR] postgresql-client no encontrado en Dockerfile" >&2
    FAILED=1
  fi
fi

# 2. Validar Caddyfile
echo " [2/5] Verificando Caddyfile..."
CADDYFILE="${ROOT_DIR}/infra/caddy/Caddyfile"
if [ ! -f "${CADDYFILE}" ]; then
  echo "  [ERROR] No se encontró ${CADDYFILE}" >&2
  FAILED=1
else
  if grep -q "reverse_proxy api:3000" "${CADDYFILE}" && grep -q "reverse_proxy web:80" "${CADDYFILE}"; then
    echo "  [OK] Caddyfile contiene enrutamiento inverso para API y Web"
  else
    echo "  [ERROR] Caddyfile incompleto o faltan directivas de reverse_proxy" >&2
    FAILED=1
  fi
  for header in "Content-Security-Policy" "Strict-Transport-Security" "X-Frame-Options" "X-Content-Type-Options"; do
    if grep -q "${header}" "${CADDYFILE}"; then
      echo "  [OK] Cabecera de seguridad configurada: ${header}"
    else
      echo "  [ERROR] Falta la cabecera de seguridad en Caddy: ${header}" >&2
      FAILED=1
    fi
  done
fi

# Caddy es el único proxy: una configuración nginx de host contradiría la topología
if [ -d "${ROOT_DIR}/infra/nginx" ]; then
  echo "  [ERROR] infra/nginx existe: la topología aprobada usa solo Caddy" >&2
  FAILED=1
fi

# 3. Validar Nginx SPA & Caching
echo " [3/5] Verificando Nginx Web Configuration..."
NGINX_CONF="${ROOT_DIR}/infra/docker/nginx-web.conf"
if [ ! -f "${NGINX_CONF}" ]; then
  echo "  [ERROR] No se encontró ${NGINX_CONF}" >&2
  FAILED=1
else
  if grep -q "try_files \$uri \$uri/ /index.html" "${NGINX_CONF}" && grep -q "immutable" "${NGINX_CONF}"; then
    echo "  [OK] Nginx configurado con SPA fallback y caché inmutable de assets"
  else
    echo "  [ERROR] Nginx configuration carece de SPA fallback o directivas de caché" >&2
    FAILED=1
  fi
fi

# 4. Validar sintaxis de scripts de respaldo y recuperación
echo " [4/5] Verificando scripts bash de infraestructura..."
for script in backup.sh verify-backup.sh restore.sh create-test-db.sh; do
  SCRIPT_PATH="${ROOT_DIR}/infra/scripts/${script}"
  if [ -f "${SCRIPT_PATH}" ]; then
    if bash -n "${SCRIPT_PATH}"; then
      echo "  [OK] Sintaxis correcta: ${script}"
    else
      echo "  [ERROR] Error de sintaxis en: ${script}" >&2
      FAILED=1
    fi
  else
    echo "  [WARN] Script no encontrado: ${script}"
  fi
done

# 5. Validar Docker Compose de producción
echo " [5/5] Verificando docker-compose.production.yml..."
COMPOSE_FILE="${ROOT_DIR}/infra/compose/docker-compose.production.yml"
if [ ! -f "${COMPOSE_FILE}" ]; then
  echo "  [ERROR] No se encontró ${COMPOSE_FILE}" >&2
  FAILED=1
else
  for svc in "caddy:" "postgres:" "api:" "worker:" "web:" "migrate:" "backup-job:"; do
    if grep -q "${svc}" "${COMPOSE_FILE}"; then
      echo "  [OK] Servicio configurado: ${svc}"
    else
      echo "  [ERROR] Falta el servicio en compose: ${svc}" >&2
      FAILED=1
    fi
  done
fi

echo "=================================================================="
if [ "${FAILED}" -eq 0 ]; then
  echo " [RESULTADO: INFRAESTRUCTURA DE PRODUCCIÓN 100% VÁLIDA]"
  echo "=================================================================="
  exit 0
else
  echo " [RESULTADO: ERRORES DETECTADOS EN LA INFRAESTRUCTURA]" >&2
  echo "=================================================================="
  exit 1
fi

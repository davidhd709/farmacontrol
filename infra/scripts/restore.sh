#!/usr/bin/env bash
# ==============================================================================
# Sistema de Gestión para Farmacia — Script de Restauración (HU-024)
# ==============================================================================

set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5434}"
PGUSER="${PGUSER:-farmacia_user}"
PGPASSWORD="${PGPASSWORD:-farmacia_dev_password_change_me}"
TARGET_DB="${TARGET_DB:-farmacia_restore_test}"
CONFIRM_OVERWRITE="${CONFIRM_OVERWRITE:-0}"

export PGPASSWORD

function show_usage() {
  echo "Uso: $0 <archivo_backup.dump> [--target-db <nombre_db>] [--confirm-overwrite]"
  echo ""
  echo "Ejemplo:"
  echo "  $0 infra/backups/farmacia_backup.dump --target-db farmacia_test --confirm-overwrite"
  exit 1
}

if [ "$#" -lt 1 ]; then
  show_usage
fi

BACKUP_FILE="$1"
shift

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target-db)
      TARGET_DB="$2"
      shift 2
      ;;
    --confirm-overwrite)
      CONFIRM_OVERWRITE=1
      shift
      ;;
    *)
      echo "[ERROR] Parámetro desconocido: $1" >&2
      show_usage
      ;;
  esac
done

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[ERROR] El archivo de copia de seguridad no existe: ${BACKUP_FILE}" >&2
  exit 1
fi

echo "=================================================================="
echo " [RESTORE] Iniciando proceso de restauración"
echo " [RESTORE] Archivo origen:   ${BACKUP_FILE}"
echo " [RESTORE] Base de destino:  ${TARGET_DB}"
echo " [RESTORE] Servidor:         ${PGHOST}:${PGPORT} (Usuario: ${PGUSER})"
echo "=================================================================="

# 1. Validar conectividad al motor PostgreSQL
if ! pg_isready -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" >/dev/null 2>&1; then
  echo "[ERROR] No es posible conectar al servidor PostgreSQL en ${PGHOST}:${PGPORT}" >&2
  exit 1
fi

# 2. Verificar Checksum SHA-256 si el archivo .sha256 está presente
SHA256_FILE="${BACKUP_FILE}.sha256"
if [ -f "${SHA256_FILE}" ]; then
  echo " [RESTORE] Verificando suma criptográfica SHA-256..."
  EXPECTED_HASH="$(awk '{print $1}' "${SHA256_FILE}")"
  ACTUAL_HASH="$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')"

  if [ "${EXPECTED_HASH}" != "${ACTUAL_HASH}" ]; then
    echo "[ERROR] Corrupción detectada: El hash SHA-256 no coincide." >&2
    echo "  Esperado: ${EXPECTED_HASH}" >&2
    echo "  Obtenido: ${ACTUAL_HASH}" >&2
    exit 1
  fi
  echo " [RESTORE] Integridad SHA-256 verificada: OK"
else
  echo " [AVISO] No se encontró archivo .sha256 complementario; continuando con verificación física."
fi

# 3. Validar consistencia interna del archivo con pg_restore
echo " [RESTORE] Validando catálogo y cabecera del volcado con pg_restore..."
if ! pg_restore --list "${BACKUP_FILE}" >/dev/null 2>&1; then
  echo "[ERROR] El volcado está corrupto o no corresponde a formato custom de pg_dump." >&2
  exit 1
fi

# 4. Comprobar si la base de destino ya existe
DB_EXISTS="$(psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${TARGET_DB}';" 2>/dev/null || echo 0)"

if [ "${DB_EXISTS}" = "1" ]; then
  if [ "${CONFIRM_OVERWRITE}" != "1" ]; then
    echo "[ERROR] La base de datos '${TARGET_DB}' ya existe. Debe especificar --confirm-overwrite para sobreescribirla." >&2
    exit 1
  fi
  echo " [RESTORE] La base de datos '${TARGET_DB}' ya existe. Limpiando y restaurando con sobreescritura..."
else
  echo " [RESTORE] Creando base de datos destino '${TARGET_DB}'..."
  psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d postgres -c "CREATE DATABASE \"${TARGET_DB}\";" >/dev/null
fi

# 5. Ejecutar la restauración
echo " [RESTORE] Restaurando esquema y datos..."
# Cualquier error detiene la restauración: una base a medias no debe darse por restaurada
if ! pg_restore \
  -h "${PGHOST}" \
  -p "${PGPORT}" \
  -U "${PGUSER}" \
  -d "${TARGET_DB}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "${BACKUP_FILE}"; then
  echo "[ERROR] pg_restore falló; la base '${TARGET_DB}' puede haber quedado incompleta." >&2
  exit 1
fi

# 6. Verificación post-restauración
echo " [RESTORE] Realizando comprobaciones de consistencia post-restauración..."
TABLES_COUNT="$(psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${TARGET_DB}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"

echo " [RESTORE] Tablas restauradas en public schema: ${TABLES_COUNT}"

if [ "${TABLES_COUNT}" -eq 0 ]; then
  echo "[ERROR] La restauración finalizó pero no se detectaron tablas en el esquema 'public'." >&2
  exit 1
fi

echo "=================================================================="
echo " [RESTAURACIÓN COMPLETADA CON ÉXITO]"
echo " Base de datos: ${TARGET_DB}"
echo " Tablas:        ${TABLES_COUNT}"
echo " Fecha:         $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "=================================================================="

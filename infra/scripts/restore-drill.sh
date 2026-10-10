#!/usr/bin/env bash
# ==============================================================================
# FarmaControl — Simulacro de restauración (AUD-013)
# Restaura un respaldo en una base temporal, comprueba que esté completo y la elimina.
# Nunca toca la base de producción.
#
# Uso:
#   restore-drill.sh <archivo.dump>      Respaldo local
#   restore-drill.sh --from-remote       Último respaldo cifrado de BACKUP_REMOTE
#                                        (requiere AGE_IDENTITY_FILE con la clave privada)
# Variables: PGHOST, PGPORT, PGUSER, PGPASSWORD, BACKUP_REMOTE, AGE_IDENTITY_FILE,
#            KEEP_DRILL_DB=1 para conservar la base temporal y revisarla.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5434}"
PGUSER="${PGUSER:-farmacia_user}"
export PGPASSWORD="${PGPASSWORD:-farmacia_dev_password_change_me}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
AGE_IDENTITY_FILE="${AGE_IDENTITY_FILE:-}"
KEEP_DRILL_DB="${KEEP_DRILL_DB:-0}"

if [ "$#" -ne 1 ]; then
  sed -n '6,13p' "${BASH_SOURCE[0]}"
  exit 1
fi

STARTED_AT="$(date +%s)"
WORK_DIR="$(mktemp -d)"
DRILL_DB="farmacia_restore_drill_${STARTED_AT}"
DB_CREATED=0

cleanup() {
  rm -rf "${WORK_DIR}"
  if [ "${DB_CREATED}" = "1" ] && [ "${KEEP_DRILL_DB}" != "1" ]; then
    psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d postgres -qc "DROP DATABASE IF EXISTS \"${DRILL_DB}\";" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [ "$1" = "--from-remote" ]; then
  if [ -z "${BACKUP_REMOTE}" ] || [ -z "${AGE_IDENTITY_FILE}" ]; then
    echo "[DRILL] --from-remote requiere BACKUP_REMOTE y AGE_IDENTITY_FILE." >&2
    exit 1
  fi
  LATEST="$(rclone lsf --files-only --include 'farmacia_*.dump.age' "${BACKUP_REMOTE}" | sort | tail -n 1)"
  if [ -z "${LATEST}" ]; then
    echo "[DRILL] No hay respaldos cifrados en ${BACKUP_REMOTE}." >&2
    exit 1
  fi
  DUMP_NAME="${LATEST%.age}"
  echo "[DRILL] Descargando ${LATEST} desde ${BACKUP_REMOTE}..."
  rclone copyto "${BACKUP_REMOTE}/${LATEST}" "${WORK_DIR}/${LATEST}"
  rclone copyto "${BACKUP_REMOTE}/${DUMP_NAME}.sha256" "${WORK_DIR}/${DUMP_NAME}.sha256"
  echo "[DRILL] Descifrando con la clave privada..."
  age --decrypt --identity "${AGE_IDENTITY_FILE}" --output "${WORK_DIR}/${DUMP_NAME}" "${WORK_DIR}/${LATEST}"
  DUMP_FILE="${WORK_DIR}/${DUMP_NAME}"
  if [ ! -f "${DUMP_FILE}.sha256" ]; then
    echo "[DRILL] Falta el .sha256 del respaldo descargado." >&2
    exit 1
  fi
else
  DUMP_FILE="$1"
  if [ ! -f "${DUMP_FILE}.sha256" ]; then
    echo "[DRILL] Falta ${DUMP_FILE}.sha256: un simulacro exige verificar la suma." >&2
    exit 1
  fi
fi

EXPECTED_TABLES="$(pg_restore --list "${DUMP_FILE}" | grep -c ' TABLE public ' || true)"
echo "[DRILL] Tablas en el respaldo: ${EXPECTED_TABLES}"

DB_CREATED=1
"${SCRIPT_DIR}/restore.sh" "${DUMP_FILE}" --target-db "${DRILL_DB}"

query() {
  psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${DRILL_DB}" -tAc "$1"
}

RESTORED_TABLES="$(query "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")"
MIGRATIONS="$(query "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;")"
USERS="$(query "SELECT count(*) FROM users;")"

FAILED=0
if [ "${RESTORED_TABLES}" != "${EXPECTED_TABLES}" ]; then
  echo "[DRILL] [ERROR] Se restauraron ${RESTORED_TABLES} de ${EXPECTED_TABLES} tablas." >&2
  FAILED=1
fi
if [ "${MIGRATIONS}" -eq 0 ]; then
  echo "[DRILL] [ERROR] El respaldo no tiene migraciones aplicadas." >&2
  FAILED=1
fi

ELAPSED="$(( $(date +%s) - STARTED_AT ))"
echo "=================================================================="
echo " [SIMULACRO] Respaldo:        $(basename "${DUMP_FILE}")"
echo " [SIMULACRO] Tablas:          ${RESTORED_TABLES}/${EXPECTED_TABLES}"
echo " [SIMULACRO] Migraciones:     ${MIGRATIONS}"
echo " [SIMULACRO] Usuarios:        ${USERS}"
echo " [SIMULACRO] Tiempo total:    ${ELAPSED} s"
if [ "${KEEP_DRILL_DB}" = "1" ]; then
  echo " [SIMULACRO] Base conservada: ${DRILL_DB}"
fi
if [ "${FAILED}" -eq 0 ]; then
  echo " [SIMULACRO SUPERADO]"
else
  echo " [SIMULACRO FALLIDO]" >&2
fi
echo "=================================================================="
exit "${FAILED}"

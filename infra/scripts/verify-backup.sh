#!/usr/bin/env bash
# ==============================================================================
# Sistema de Gestión para Farmacia — Verificación de Integridad de Respaldo (HU-024)
# ==============================================================================

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Uso: $0 <archivo_backup.dump>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[ERROR] El archivo no existe: ${BACKUP_FILE}" >&2
  exit 1
fi

echo "=================================================================="
echo " [VERIFY] Verificando archivo: ${BACKUP_FILE}"
echo "=================================================================="

# 1. Verificar Checksum SHA-256
SHA256_FILE="${BACKUP_FILE}.sha256"
if [ -f "${SHA256_FILE}" ]; then
  EXPECTED_HASH="$(awk '{print $1}' "${SHA256_FILE}")"
  ACTUAL_HASH="$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')"

  if [ "${EXPECTED_HASH}" != "${ACTUAL_HASH}" ]; then
    echo "[FAIL] Checksum SHA-256 no coincide (Archivo corrupto)" >&2
    exit 2
  fi
  echo " [OK] Checksum criptográfico SHA-256 verificado (${ACTUAL_HASH})"
fi

# 2. Verificar cabeceras y tabla de contenidos con pg_restore
TABLES_ENTRIES="$(pg_restore --list "${BACKUP_FILE}" 2>/dev/null | wc -l)"

if [ "${TABLES_ENTRIES}" -lt 5 ]; then
  echo "[FAIL] El archivo no contiene una estructura válida de PostgreSQL." >&2
  exit 3
fi

FILE_SIZE_BYTES="$(stat -c%s "${BACKUP_FILE}" 2>/dev/null || stat -f%z "${BACKUP_FILE}")"
echo " [OK] Estructura interna de PostgreSQL validada (${TABLES_ENTRIES} entradas del catálogo, ${FILE_SIZE_BYTES} bytes)."
echo "=================================================================="
echo " [RESULTADO: RESPALDO VÁLIDO E ÍNTEGRO]"
echo "=================================================================="
exit 0

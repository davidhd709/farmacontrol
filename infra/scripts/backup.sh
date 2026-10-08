#!/usr/bin/env bash
# ==============================================================================
# Sistema de Gestión para Farmacia — Script de Copias de Seguridad (HU-024)
# Formato: PostgreSQL Custom Format (-Fc) comprimido con verificación SHA-256
# ==============================================================================

set -euo pipefail

# 1. Configuración por variables de entorno con valores por defecto
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5434}"
PGUSER="${PGUSER:-farmacia_user}"
PGPASSWORD="${PGPASSWORD:-farmacia_dev_password_change_me}"
PGDATABASE="${PGDATABASE:-farmacia_test}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

export PGPASSWORD

TIMESTAMP="$(date -u +"%Y%m%d_%H%M%S")"
BACKUP_FILENAME="farmacia_${PGDATABASE}_${TIMESTAMP}.dump"
BACKUP_FILEPATH="${BACKUP_DIR}/${BACKUP_FILENAME}"
SHA256_FILEPATH="${BACKUP_FILEPATH}.sha256"
META_FILEPATH="${BACKUP_DIR}/${BACKUP_FILENAME}.meta.json"
LATEST_META_FILEPATH="${BACKUP_DIR}/latest_backup.json"

echo "=================================================================="
echo " [BACKUP] Iniciando copia de seguridad para: ${PGDATABASE}"
echo " [BACKUP] Destino: ${BACKUP_FILEPATH}"
echo " [BACKUP] Servidor: ${PGHOST}:${PGPORT} (Usuario: ${PGUSER})"
echo "=================================================================="

# 2. Asegurar que existe el directorio de destino
mkdir -p "${BACKUP_DIR}"

# 3. Validar conectividad con PostgreSQL
if ! pg_isready -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" >/dev/null 2>&1; then
  echo " [ERROR] No es posible conectar al servidor PostgreSQL en ${PGHOST}:${PGPORT}" >&2
  exit 1
fi

# 4. Ejecutar el volcado lógico en formato binario custom (-Fc)
echo " [BACKUP] Extrayendo volcado lógico con pg_dump..."
pg_dump \
  -h "${PGHOST}" \
  -p "${PGPORT}" \
  -U "${PGUSER}" \
  -d "${PGDATABASE}" \
  -Fc \
  --verbose \
  --file="${BACKUP_FILEPATH}" 2>&1 | grep -v "^pg_dump: saving" || true

if [ ! -s "${BACKUP_FILEPATH}" ]; then
  echo " [ERROR] El archivo de respaldo no se generó o está vacío: ${BACKUP_FILEPATH}" >&2
  exit 1
fi

FILE_SIZE_BYTES="$(stat -c%s "${BACKUP_FILEPATH}" 2>/dev/null || stat -f%z "${BACKUP_FILEPATH}")"
echo " [BACKUP] Volcado generado exitosamente (${FILE_SIZE_BYTES} bytes)."

# 5. Calcular checksum criptográfico SHA-256
echo " [BACKUP] Calculando suma de verificación SHA-256..."
SHA256_HASH="$(sha256sum "${BACKUP_FILEPATH}" | awk '{print $1}')"
echo "${SHA256_HASH}  ${BACKUP_FILENAME}" > "${SHA256_FILEPATH}"
echo " [BACKUP] SHA-256: ${SHA256_HASH}"

# 6. Validar integridad inmediata del archivo volcado
echo " [BACKUP] Verificando integridad física del volcado con pg_restore..."
if ! pg_restore --list "${BACKUP_FILEPATH}" >/dev/null 2>&1; then
  echo " [ERROR] La verificación de integridad del archivo volcado falló (archivo corrupto)." >&2
  exit 1
fi
echo " [BACKUP] Verificación de integridad superada exitosamente."

# 7. Generar archivo de metadatos JSON
ISO_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
PG_VERSION="$(pg_dump --version | head -n1)"

cat <<EOF > "${META_FILEPATH}"
{
  "filename": "${BACKUP_FILENAME}",
  "filepath": "${BACKUP_FILEPATH}",
  "database": "${PGDATABASE}",
  "createdAt": "${ISO_DATE}",
  "sizeBytes": ${FILE_SIZE_BYTES},
  "sha256": "${SHA256_HASH}",
  "verified": true,
  "pgVersion": "${PG_VERSION}"
}
EOF

# Actualizar el puntero del último respaldo
cp "${META_FILEPATH}" "${LATEST_META_FILEPATH}"

# 8. Política de retención: rotación de backups antiguos (> RETENTION_DAYS días)
echo " [BACKUP] Aplicando política de retención (${RETENTION_DAYS} días)..."
find "${BACKUP_DIR}" -type f \( -name "*.dump" -o -name "*.sha256" -o -name "*.meta.json" \) \
  ! -name "latest_backup.json" -mtime +"${RETENTION_DAYS}" -exec rm -f {} + 2>/dev/null || true

echo "=================================================================="
echo " [BACKUP COMPLETADO EXITOSAMENTE]"
echo " Archivo:    ${BACKUP_FILENAME}"
echo " Tamaño:     ${FILE_SIZE_BYTES} bytes"
echo " SHA-256:    ${SHA256_HASH}"
echo " Fecha:      ${ISO_DATE}"
echo " Metadatos:  ${META_FILEPATH}"
echo "=================================================================="

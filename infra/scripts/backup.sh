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

# Copia fuera del servidor (AUD-013). BACKUP_REMOTE es un destino de rclone (ej. "offsite:farmacia");
# BACKUP_AGE_RECIPIENT es la clave pública age: el servidor cifra pero no puede descifrar.
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
BACKUP_AGE_RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"
BACKUP_REQUIRE_OFFSITE="${BACKUP_REQUIRE_OFFSITE:-false}"
REMOTE_RETENTION_DAYS="${REMOTE_RETENTION_DAYS:-90}"

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
# Un pg_dump fallido puede dejar un archivo parcial: su código de salida decide, no el tamaño
if ! pg_dump \
  -h "${PGHOST}" \
  -p "${PGPORT}" \
  -U "${PGUSER}" \
  -d "${PGDATABASE}" \
  -Fc \
  --file="${BACKUP_FILEPATH}"; then
  rm -f "${BACKUP_FILEPATH}"
  echo " [ERROR] pg_dump falló; no se conserva el archivo parcial." >&2
  exit 1
fi

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

# 7. Copia cifrada fuera del servidor
OFFSITE_LOCATION=""
if [ -n "${BACKUP_REMOTE}" ]; then
  if [ -z "${BACKUP_AGE_RECIPIENT}" ]; then
    echo " [ERROR] BACKUP_REMOTE está configurado pero falta BACKUP_AGE_RECIPIENT: nunca se sube un respaldo sin cifrar." >&2
    exit 1
  fi
  ENCRYPTED_FILEPATH="${BACKUP_FILEPATH}.age"
  echo " [BACKUP] Cifrando copia externa con age..."
  age --encrypt --recipient "${BACKUP_AGE_RECIPIENT}" --output "${ENCRYPTED_FILEPATH}" "${BACKUP_FILEPATH}"

  echo " [BACKUP] Subiendo copia cifrada a ${BACKUP_REMOTE}..."
  # El .sha256 es del volcado en claro: permite verificarlo después de descifrar
  if ! rclone copyto "${ENCRYPTED_FILEPATH}" "${BACKUP_REMOTE}/${BACKUP_FILENAME}.age" \
    || ! rclone copyto "${SHA256_FILEPATH}" "${BACKUP_REMOTE}/${BACKUP_FILENAME}.sha256"; then
    rm -f "${ENCRYPTED_FILEPATH}"
    echo " [ERROR] No se pudo subir la copia externa. El respaldo local se conserva." >&2
    exit 1
  fi
  rm -f "${ENCRYPTED_FILEPATH}"
  OFFSITE_LOCATION="${BACKUP_REMOTE}/${BACKUP_FILENAME}.age"
  echo " [BACKUP] Copia externa cifrada: ${OFFSITE_LOCATION}"

  echo " [BACKUP] Retención externa (${REMOTE_RETENTION_DAYS} días)..."
  if ! rclone delete --min-age "${REMOTE_RETENTION_DAYS}d" --include "farmacia_*" "${BACKUP_REMOTE}"; then
    echo " [AVISO] No se pudo aplicar la retención externa; la copia de hoy sí quedó subida." >&2
  fi
elif [ "${BACKUP_REQUIRE_OFFSITE}" = "true" ]; then
  echo " [ERROR] BACKUP_REQUIRE_OFFSITE=true pero BACKUP_REMOTE no está configurado. El respaldo quedó solo en este servidor." >&2
  exit 1
fi

if [ -n "${OFFSITE_LOCATION}" ]; then
  OFFSITE_JSON="\"${OFFSITE_LOCATION}\""
else
  OFFSITE_JSON="null"
fi

# 8. Generar archivo de metadatos JSON
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
  "pgVersion": "${PG_VERSION}",
  "offsite": ${OFFSITE_JSON}
}
EOF

# Actualizar el puntero del último respaldo
cp "${META_FILEPATH}" "${LATEST_META_FILEPATH}"

# 9. Política de retención: rotación de backups antiguos (> RETENTION_DAYS días)
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
echo " Externa:    ${OFFSITE_LOCATION:-no configurada}"
echo "=================================================================="

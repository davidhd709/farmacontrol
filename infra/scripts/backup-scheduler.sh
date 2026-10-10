#!/usr/bin/env bash
# ==============================================================================
# FarmaControl — Programador de respaldos (AUD-013)
# Ejecuta backup.sh una vez al día a BACKUP_TIME (HH:MM, hora de TZ). Corre como servicio
# de Compose con restart: unless-stopped, así sobrevive a reinicios del servidor sin cron
# en el host. Cada ejecución queda en los logs del contenedor.
# ==============================================================================

set -uo pipefail

BACKUP_TIME="${BACKUP_TIME:-02:00}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAST_RUN_DATE=""

if ! [[ "${BACKUP_TIME}" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
  echo "[SCHEDULER] BACKUP_TIME inválido: '${BACKUP_TIME}'. Use HH:MM (24 h)." >&2
  exit 1
fi

echo "[SCHEDULER] Respaldo diario programado a las ${BACKUP_TIME} (TZ=${TZ:-UTC})."

while true; do
  NOW_TIME="$(date +%H:%M)"
  TODAY="$(date +%Y-%m-%d)"
  if [ "${NOW_TIME}" = "${BACKUP_TIME}" ] && [ "${LAST_RUN_DATE}" != "${TODAY}" ]; then
    LAST_RUN_DATE="${TODAY}"
    echo "[SCHEDULER] $(date -Iseconds) Iniciando respaldo programado."
    if "${SCRIPT_DIR}/backup.sh"; then
      echo "[SCHEDULER] $(date -Iseconds) Respaldo programado completado."
    else
      # Sin reintento automático: un fallo repetido llenaría el disco o el destino externo.
      # La pantalla de respaldos marca el RPO vencido a las 24 h.
      echo "[SCHEDULER] $(date -Iseconds) [ERROR] El respaldo programado falló (código $?)." >&2
    fi
  fi
  sleep 30
done

#!/usr/bin/env bash
# Se ejecuta dentro del contenedor que lanza run-backup-e2e.sh. No usar directamente.
set -uo pipefail
apk add --no-cache bash postgresql18-client age rclone tzdata >/dev/null 2>&1
export PGHOST=fc-backup-e2e-pg PGPORT=5432 PGUSER=postgres PGPASSWORD=x
S=/app/infra/scripts
pass=0; fail=0
ok(){ echo "PASS: $1"; pass=$((pass+1)); }
ko(){ echo "FAIL: $1"; fail=$((fail+1)); }

echo "== Base 'farmacontrol' con el esquema de las migraciones"
psql -d farmacontrol -tAc "SELECT count(*) FROM _prisma_migrations" >/dev/null && ok "esquema migrado disponible" || ko "esquema migrado"

mkdir -p /keys /offsite /backups
age-keygen -o /keys/backup.key 2>/dev/null
RECIPIENT="$(age-keygen -y /keys/backup.key)"
export PGDATABASE=farmacontrol BACKUP_DIR=/backups
export RCLONE_CONFIG_OFFSITE_TYPE=local

echo "== 1. Respaldo con copia externa cifrada"
if BACKUP_REMOTE=offsite:/offsite BACKUP_AGE_RECIPIENT="$RECIPIENT" BACKUP_REQUIRE_OFFSITE=true $S/backup.sh > /tmp/b1.log 2>&1; then ok "backup.sh terminó"; else ko "backup.sh"; cat /tmp/b1.log; fi
ls -la /offsite
AGEF="$(ls /offsite/*.dump.age | head -1)"
[ -n "$AGEF" ] && ok "archivo .age en destino externo" || ko "sin .age"
ls /offsite/*.dump.sha256 >/dev/null 2>&1 && ok ".sha256 en destino externo" || ko "sin .sha256"
head -c 5 "$AGEF" | grep -q PGDMP && ko "copia externa en claro" || ok "la copia externa no es un volcado en claro"
ls /backups/*.dump.age >/dev/null 2>&1 && ko "quedó .age local" || ok "no queda .age temporal local"
grep -q '"offsite": "offsite:/offsite/' /backups/latest_backup.json && ok "metadatos registran la copia externa" || { ko "metadatos"; cat /backups/latest_backup.json; }

echo "== 2. Simulacro de restauración desde el destino externo"
if BACKUP_REMOTE=offsite:/offsite AGE_IDENTITY_FILE=/keys/backup.key $S/restore-drill.sh --from-remote > /tmp/d1.log 2>&1; then ok "simulacro superado"; else ko "simulacro"; fi
tail -12 /tmp/d1.log
[ "$(psql -d postgres -tAc "SELECT count(*) FROM pg_database WHERE datname LIKE 'farmacia_restore_drill_%'")" = "0" ] && ok "base temporal eliminada" || ko "quedó base temporal"

echo "== 3. Casos negativos"
BACKUP_REQUIRE_OFFSITE=true $S/backup.sh > /tmp/n1.log 2>&1 && ko "sin destino debía fallar" || ok "sin destino externo y REQUIRE_OFFSITE=true falla"
grep -q "BACKUP_REQUIRE_OFFSITE=true" /tmp/n1.log && ok "mensaje claro sin destino" || ko "mensaje sin destino"
BACKUP_REMOTE=offsite:/offsite $S/backup.sh > /tmp/n2.log 2>&1 && ko "sin clave debía fallar" || ok "destino sin clave pública falla (no sube en claro)"
BEFORE=$(ls /offsite | wc -l)
age-keygen -o /keys/otra.key 2>/dev/null
BACKUP_REMOTE=offsite:/offsite AGE_IDENTITY_FILE=/keys/otra.key $S/restore-drill.sh --from-remote > /tmp/n3.log 2>&1 && ko "clave equivocada debía fallar" || ok "clave privada equivocada no descifra"
PGDATABASE=no_existe $S/backup.sh > /tmp/n4.log 2>&1 && ko "base inexistente debía fallar" || ok "pg_dump fallido hace fallar el respaldo"
ls /backups/*no_existe*.dump >/dev/null 2>&1 && ko "quedó volcado parcial" || ok "no queda volcado parcial"
cp /backups/$(basename "${AGEF%.age}") /tmp/corrupto.dump && cp /backups/$(basename "${AGEF%.age}").sha256 /tmp/corrupto.dump.sha256
printf 'X' | dd of=/tmp/corrupto.dump bs=1 seek=2000 conv=notrunc 2>/dev/null
$S/restore-drill.sh /tmp/corrupto.dump > /tmp/n5.log 2>&1 && ko "volcado alterado debía fallar" || ok "volcado alterado rechazado por SHA-256"

echo "== 4. Programador: ejecuta una vez en el minuto programado"
NEXT=$(date -d @$(( $(date +%s) + 60 )) +%H:%M)
rm -rf /offsite/* ; 
BACKUP_TIME=$NEXT BACKUP_REMOTE=offsite:/offsite BACKUP_AGE_RECIPIENT="$RECIPIENT" BACKUP_REQUIRE_OFFSITE=true timeout 150 $S/backup-scheduler.sh > /tmp/s1.log 2>&1
grep -c "Respaldo programado completado" /tmp/s1.log | grep -qx 1 && ok "programador ejecutó exactamente una vez" || { ko "programador"; cat /tmp/s1.log; }
ls /offsite/*.dump.age >/dev/null 2>&1 && ok "programador subió copia externa" || ko "programador sin copia externa"
BACKUP_TIME=25:00 $S/backup-scheduler.sh >/dev/null 2>&1 && ko "hora inválida debía fallar" || ok "hora inválida rechazada"

echo "== RESULTADO: $pass PASS, $fail FAIL"
[ $fail -eq 0 ]

# Runbook: respaldos y restauración

**Requerimientos:** `HU-024`, `RF-026`, `RNF-002`, `CA-006` · **Hallazgo:** AUD-013 · **Actualizado:** 10 de octubre de 2026

Todos los comandos se ejecutan en el servidor, desde la raíz del repositorio desplegado (por ejemplo `/opt/farmacontrol`), con el stack de `infra/compose/docker-compose.production.yml`.

```bash
cd /opt/farmacontrol
alias fc='docker compose --env-file infra/compose/.env -f infra/compose/docker-compose.production.yml'
```

## 1. Qué protege y qué no

| Objetivo | Valor | Cómo se cumple |
|---|---|---|
| RPO | ≤ 24 horas | Respaldo diario a `BACKUP_TIME` (02:00, hora de Bogotá) |
| RTO | ≤ 4 horas | Restauración con `restore.sh`; el simulacro mide el tiempo real |
| Integridad | Verificada | SHA-256 del volcado y `pg_restore --list` antes de darlo por bueno |
| Fuera del servidor | Sí | Copia cifrada con `age` en un destino de `rclone` de otro proveedor |

**Limitación conocida:** el RPO es de un día. Lo que se registre entre el último respaldo y una falla total del servidor se pierde. Un RPO de minutos requiere archivado continuo de WAL (PITR), que no está implementado.

## 2. Cómo funciona

1. El servicio `backup-scheduler` (siempre activo, `restart: unless-stopped`) ejecuta `infra/scripts/backup.sh` una vez al día a `BACKUP_TIME`.
2. `backup.sh`:
   - genera el volcado con `pg_dump -Fc` (cliente PostgreSQL 18, igual al servidor; un cliente más viejo se niega a respaldar);
   - calcula el SHA-256 y verifica el volcado con `pg_restore --list`;
   - cifra una copia con la **clave pública** `age` y la sube a `BACKUP_REMOTE` junto con el `.sha256`;
   - borra en el destino externo lo que tenga más de `REMOTE_RETENTION_DAYS` (90) y en local lo que tenga más de `RETENTION_DAYS` (30).
3. El volumen local `farmacontrol_backups` guarda los volcados **sin cifrar**, con el mismo nivel de exposición que el volumen de la base. La copia que sale del servidor siempre va cifrada: `backup.sh` falla si hay destino pero no clave.
4. El servidor solo tiene la clave pública: quien lo comprometa no puede leer las copias externas.

Si el destino externo no está configurado, el respaldo local se genera igual, pero el job termina con error (`BACKUP_REQUIRE_OFFSITE=true`) y queda en los logs.

## 3. Puesta en marcha (una sola vez)

1. **Generar el par de claves en un equipo seguro, no en el servidor:**
   ```bash
   age-keygen -o farmacontrol-backup.key
   # Muestra "Public key: age1..."
   ```
   Guardar `farmacontrol-backup.key` en el gestor de contraseñas del administrador y en una segunda copia fuera de línea (USB o impresa). **Sin esta clave los respaldos externos no se pueden restaurar.**
2. **Crear el destino externo** en un proveedor distinto al del servidor (bucket S3/R2/B2 o servidor SFTP), con credenciales limitadas a ese bucket.
3. **Configurar** `infra/compose/backup.env` a partir de `backup.env.example`: clave pública, destino y credenciales de `rclone`. Este archivo no se versiona.
4. **Levantar el programador y probar:**
   ```bash
   fc up -d backup-scheduler
   fc --profile backup run --rm backup-job      # respaldo inmediato
   fc logs backup-job backup-scheduler
   ```
   El resumen debe mostrar `Externa: <destino>/farmacia_<base>_<fecha>.dump.age`.
5. **Hacer el primer simulacro** (sección 6) antes de dar el sistema por listo.

## 4. Operación diaria

- **Revisar:** la pantalla *Respaldos* del sistema marca el RPO en rojo si el último respaldo tiene más de 24 horas.
- **Logs:** `fc logs --since 48h backup-scheduler`. Cada ejecución termina en `Respaldo programado completado` o en `[ERROR]`.
- **Antes de migrar o desplegar:** `fc --profile backup run --rm backup-job`.

## 5. Restauración

### 5.1 Desde el respaldo local (la base se dañó, el servidor sigue)

```bash
fc stop api worker
fc run --rm --entrypoint bash backup-job -c 'ls -t /app/infra/backups/*.dump | head'
fc run --rm --entrypoint bash backup-job -c \
  '/app/infra/scripts/restore.sh /app/infra/backups/<archivo>.dump --target-db "$PGDATABASE" --confirm-overwrite'
fc start api worker
```

### 5.2 Desde la copia externa (servidor perdido)

1. Provisionar el servidor nuevo, clonar el repositorio y crear `infra/compose/.env` y `infra/compose/backup.env`.
2. `fc up -d postgres` y esperar a que esté `healthy`.
3. Copiar la clave privada al servidor **solo durante la restauración**, por ejemplo en `/root/restore.key`.
4. Descargar, descifrar y restaurar:
   ```bash
   fc run --rm -v /root/restore.key:/run/restore.key:ro --entrypoint bash backup-job -c '
     set -e
     LATEST=$(rclone lsf --files-only --include "farmacia_*.dump.age" "$BACKUP_REMOTE" | sort | tail -n 1)
     cd /tmp
     rclone copyto "$BACKUP_REMOTE/$LATEST" "$LATEST"
     rclone copyto "$BACKUP_REMOTE/${LATEST%.age}.sha256" "${LATEST%.age}.sha256"
     age --decrypt --identity /run/restore.key --output "${LATEST%.age}" "$LATEST"
     /app/infra/scripts/restore.sh "/tmp/${LATEST%.age}" --target-db "$PGDATABASE" --confirm-overwrite'
   ```
5. `shred -u /root/restore.key`, luego `fc up -d` y completar la sección 7.

`restore.sh` verifica el SHA-256 y el catálogo antes de tocar la base, y se detiene ante el primer error de `pg_restore`.

## 6. Simulacro de restauración

`infra/scripts/restore-drill.sh` restaura en una base temporal (`farmacia_restore_drill_<marca>`), compara las tablas restauradas con las del respaldo, comprueba las migraciones, mide el tiempo y borra la base temporal. No toca la base de producción.

```bash
# Desde la copia externa: prueba también el descifrado y la clave guardada
fc run --rm -v /root/restore.key:/run/restore.key:ro -e AGE_IDENTITY_FILE=/run/restore.key \
  --entrypoint /app/infra/scripts/restore-drill.sh backup-job --from-remote

# Desde un respaldo local
fc run --rm --entrypoint /app/infra/scripts/restore-drill.sh backup-job /app/infra/backups/<archivo>.dump
```

Termina en `[SIMULACRO SUPERADO]` o `[SIMULACRO FALLIDO]` (código de salida 1).

**Frecuencia:** al poner el sistema en marcha, después de cambiar el destino o la clave, y cada tres meses. Anotar fecha, respaldo usado, tiempo total y responsable.

## 7. Verificación después de restaurar

- [ ] El administrador inicia sesión y los roles conservan sus permisos.
- [ ] La última venta coincide con el último comprobante físico:
  ```sql
  SELECT invoice_number, total, created_at FROM sales ORDER BY created_at DESC LIMIT 1;
  ```
- [ ] Existencias de dos o tres productos de alta rotación coinciden con el conteo físico.
- [ ] Saldo de caja coincide con el último arqueo.
- [ ] `GET /api/v1/health` responde `200` con `"database": "up"`.
- [ ] Registrar en la bitácora qué respaldo se usó y qué datos se perdieron desde ese momento.

## 8. Variables

| Variable | Dónde | Valor por defecto | Uso |
|---|---|---|---|
| `BACKUP_TIME` | `backup.env` | `02:00` | Hora diaria del respaldo (TZ del contenedor) |
| `TZ` | `.env` | `America/Bogota` | Zona horaria del programador |
| `BACKUP_AGE_RECIPIENT` | `backup.env` | — | Clave pública `age` |
| `BACKUP_REMOTE` | `backup.env` | — | Destino `rclone` (`remoto:bucket`) |
| `RCLONE_CONFIG_<REMOTO>_*` | `backup.env` | — | Definición del remoto de `rclone` |
| `RETENTION_DAYS` | `.env` | `30` | Retención local |
| `REMOTE_RETENTION_DAYS` | `backup.env` | `90` | Retención externa |
| `AGE_IDENTITY_FILE` | al restaurar | — | Clave privada, solo durante restauración o simulacro |

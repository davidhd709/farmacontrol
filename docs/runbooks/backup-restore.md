# Runbook Operativo: Copias de Seguridad, Resiliencia y Protocolo de Restauración

**Documento:** Runbook de Continuidad de Negocio y Recuperación ante Desastres (DR)  
**Épica Relacionada:** ÉPICA 10 (`HU-024`)  
**Requerimientos:** `RF-026`, `RNF-002`, `CA-006`  
**Referencia Arquitectónica:** `docs/arquitectura-software-farmacia.md` (Secciones 19 y 20)  

---

## 1. Objetivos del Negocio y Resiliencia

El sistema de gestión de la farmacia maneja transacciones de venta en tiempo real, trazabilidad de lotes bajo regla FEFO, control de caja y cartera de clientes. La pérdida de datos o la indisponibilidad prolongada paraliza la dispensación física de medicamentos.

| Métrica | Objetivo Comprometido | Definición Operativa |
|---|---|---|
| **RPO (Recovery Point Objective)** | **≤ 15 minutos** | Máxima pérdida de datos tolerable ante fallo catastrófico (garantizado en producción mediante archivado continuo WAL / PITR y respaldos lógicos diarios). |
| **RTO (Recovery Time Objective)** | **≤ 4 horas** | Tiempo máximo para restaurar completamente el servicio y reanudar la atención al público en la farmacia. |
| **Integridad Criptográfica** | **100% verificada** | Ningún volcado se considera válido sin su respectivo hash SHA-256 contrastado y validación estructural del catálogo de PostgreSQL. |

---

## 2. Estrategia de Copias de Seguridad

1. **Formato:** PostgreSQL Custom Format (`-Fc`), comprimido, portable, compatible con restauración concurrente (`pg_restore -j`) y validación de catálogo sin volcar a disco.
2. **Checksum:** Cada respaldo genera un archivo complementario `.dump.sha256` y metadatos estructurados `.meta.json`.
3. **Frecuencia:**
   - Respaldo lógico diario automatizado (a las 02:00 UTC).
   - Respaldo lógico manual obligatorio **antes de cualquier migración de Prisma o despliegue a producción**.
4. **Retención Local y Externa:**
   - 30 días de retención en almacenamiento local / servidor principal (`RETENTION_DAYS=30`).
   - Replicación a almacenamiento de objetos secundario (S3 / R2 / Backup VPS) fuera del proveedor primario.

---

## 3. Herramientas y Scripts en el Repositorio

Los scripts se encuentran versionados en [infra/scripts/](file:///run/media/ingenierohenrydavid/0E05E2BD5C0F60A7/HENRY/PROYECTOS/Farmacia/infra/scripts):

- `infra/scripts/backup.sh`: Genera volcado lógico, calcula SHA-256, valida integridad física, genera metadatos JSON y rota archivos antiguos.
- `infra/scripts/verify-backup.sh`: Valida el hash SHA-256 y verifica la tabla de contenido interna de un archivo `.dump`.
- `infra/scripts/restore.sh`: Valida la integridad, crea la base si no existe y restaura el esquema y los datos mediante `pg_restore`.

### Variables de Entorno Utilizadas

```bash
PGHOST="localhost"                                   # Servidor PostgreSQL
PGPORT="5434"                                        # Puerto de conexión
PGUSER="farmacia_user"                               # Usuario con permisos de lectura/escritura
PGPASSWORD="farmacia_dev_password_change_me"         # Contraseña
PGDATABASE="farmacia_db"                             # Base de datos a respaldar
BACKUP_DIR="/var/backups/farmacia"                   # Directorio persistente de copias
RETENTION_DAYS="30"                                  # Días de retención
```

---

## 4. Automatización con Cron o Systemd Timer

Para programar la ejecución desatendida del respaldo diario a las 02:00 AM hora local:

```bash
# Editar crontab del usuario de despliegue
crontab -e

# Agregar la siguiente línea (ajustar paths y variables de entorno):
0 2 * * * /run/media/ingenierohenrydavid/0E05E2BD5C0F60A7/HENRY/PROYECTOS/Farmacia/infra/scripts/backup.sh >> /var/log/farmacia_backup.log 2>&1
```

---

## 5. Procedimiento de Ejecución Manual

### 5.1 Generar un respaldo inmediato (pre-despliegue)

```bash
cd /run/media/ingenierohenrydavid/0E05E2BD5C0F60A7/HENRY/PROYECTOS/Farmacia
./infra/scripts/backup.sh
```

Salida esperada:
```text
==================================================================
 [BACKUP COMPLETADO EXITOSAMENTE]
 Archivo:    farmacia_farmacia_db_20260927_044324.dump
 Tamaño:     92918 bytes
 SHA-256:    fb910231a3a3f9eec5bdf3cc0beb90a52ca20f773884766a83b4c2e4112dcd0e
 Fecha:      2026-09-27T04:43:24Z
 Metadatos:  infra/backups/farmacia_farmacia_db_20260927_044324.dump.meta.json
==================================================================
```

### 5.2 Verificar la integridad de un respaldo existente

```bash
./infra/scripts/verify-backup.sh infra/backups/farmacia_farmacia_db_20260927_044324.dump
```

---

## 6. Protocolo de Restauración ante Desastres (Disaster Recovery)

### Escenario A: Corrupción o Pérdida de Datos en el Servidor Activo

1. **Detener el tráfico de entrada:**
   Poner la aplicación en modo mantenimiento o detener los contenedores `api` y `worker` para evitar inconsistencias:
   ```bash
   docker compose stop api worker
   ```

2. **Identificar el último respaldo íntegro:**
   Consultar `infra/backups/latest_backup.json` o listar los archivos disponibles:
   ```bash
   cat infra/backups/latest_backup.json
   ```

3. **Verificar el archivo de respaldo seleccionado:**
   ```bash
   ./infra/scripts/verify-backup.sh infra/backups/farmacia_farmacia_db_20260927_044324.dump
   ```

4. **Ejecutar la restauración sobre la base de datos principal:**
   ```bash
   ./infra/scripts/restore.sh \
     infra/backups/farmacia_farmacia_db_20260927_044324.dump \
     --target-db farmacia_db \
     --confirm-overwrite
   ```

5. **Ejecutar la suite de validación post-restauración (Ver Sección 7).**

6. **Reanudar los servicios de la aplicación:**
   ```bash
   docker compose start api worker
   ```

---

### Escenario B: Recuperación en Servidor Nuevo (Bare Metal / Reemplazo Catastrófico)

1. **Provisionar el nuevo nodo:**
   Instalar Docker y Docker Compose según la guía de infraestructura.

2. **Clonar el repositorio y configurar variables de entorno:**
   ```bash
   git clone <URL_REPOSITORIO> /opt/farmacia
   cd /opt/farmacia
   cp .env.example .env
   # Configurar contraseñas seguras y rutas de producción
   ```

3. **Copiar los archivos de respaldo desde el almacenamiento secundario:**
   ```bash
   mkdir -p infra/backups
   scp backup_server:/remote/backups/farmacia_*.dump* infra/backups/
   ```

4. **Iniciar el motor PostgreSQL:**
   ```bash
   docker compose up -d postgres
   # Esperar a que el healthcheck de postgres indique 'healthy'
   ```

5. **Restaurar la base de datos completa:**
   ```bash
   ./infra/scripts/restore.sh \
     infra/backups/farmacia_backup_reciente.dump \
     --target-db farmacia_db \
     --confirm-overwrite
   ```

6. **Iniciar el resto del stack:**
   ```bash
   docker compose up -d --build
   ```

---

## 7. Checklist de Validación Post-Restauración

Antes de entregar el sistema recuperado al equipo de farmacia, el oficial técnico o administrador debe ejecutar y documentar las siguientes verificaciones:

- [ ] **Esquema de Base de Datos:** Las 29 tablas del modelo Prisma están presentes en el esquema `public`.
- [ ] **Usuarios y Seguridad:** El usuario administrador puede iniciar sesión y los roles/permisos RBAC están intactos.
- [ ] **Catálogo:** Conteo de productos, presentaciones y categorías concuerda con el inventario físico previo al fallo.
- [ ] **Lotes y FEFO:** Los lotes activos (`isArchived: false`) conservan existencias, fechas de vencimiento y trazabilidad.
- [ ] **Última Venta Registrada:** Consultar la tabla `sales` para identificar el último comprobante emitido antes del incidente:
  ```sql
  SELECT invoice_number, total, created_at FROM sales ORDER BY created_at DESC LIMIT 1;
  ```
- [ ] **Caja:** El saldo y los movimientos de caja coinciden con el arqueo reportado.
- [ ] **Auditoría:** La tabla `audit_events` permanece inmutable y se registra el evento de restauración.

---

## 8. Calendario de Simulacros (DR Drills)

- **Frecuencia:** Obligatorio de manera semestral (cada 6 meses).
- **Procedimiento del simulacro:**
  1. Tomar un respaldo del entorno de staging o producción.
  2. Restaurarlo en un entorno aislado sin conexión a la red de producción.
  3. Cronometrar el RTO real transcurrido.
  4. Ejecutar la suite completa de pruebas de integración (`pnpm --filter @farmacia/api test`).
  5. Levantar acta técnica firmada con observaciones y lecciones aprendidas.

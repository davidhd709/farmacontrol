# Runbook: migración de integridad de ajustes de inventario

**Hallazgos:** FARM-AUD-004, FARM-AUD-012 · **Migración:** `20261013120000_inventory_adjustment_integrity` · **Actualizado:** 13 de octubre de 2026

La migración:

1. agrega `inventory_movements.reason VARCHAR(250)`, el campo propio del motivo de un ajuste;
2. exige motivo en los ajustes manuales nuevos (`CHECK ... NOT VALID`);
3. cambia la clave de lote del kardex por una clave compuesta `(lot_id, product_id) → inventory_lots(id, product_id)`, para que ningún movimiento registre un producto distinto al dueño del lote.

No modifica ni borra movimientos. El kardex es inmutable: si en el historial hay movimientos con el producto equivocado, la restricción queda `NOT VALID` (rige solo para movimientos nuevos) y esas filas se reportan para revisión.

Los comandos usan los alias del runbook de respaldos:

```bash
cd /opt/farmacontrol
alias fc='docker compose --env-file infra/compose/.env -f infra/compose/docker-compose.production.yml'
alias fcsql='fc exec -T postgres sh -c '\''psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'\'''
```

## 1. Precauciones por los bloqueos

- **Qué bloquea:** `SHARE ROW EXCLUSIVE` en `inventory_lots` y `ACCESS EXCLUSIVE` en `inventory_movements`, durante toda la transacción. Eso detiene ventas, compras, notas, ajustes y la consulta del kardex.
- **Duración:** la crea el índice único sobre lotes y la validación de la clave compuesta, que recorre todo el kardex una vez. Se estima con la consulta 3b.
- **Espera:** `lock_timeout = 10s`. Si una transacción abierta retiene las tablas, la migración falla y se revierte, en lugar de dejar las ventas en cola. Igualmente se ejecuta con la aplicación detenida (paso 4).
- **Versión del código:** la API anterior todavía guarda el motivo en `reference_document_id` y no llena `reason`. Con el `CHECK` activo, sus ajustes manuales fallarían, aunque sin dejar efectos parciales. La API nueva debe arrancar justo después de la migración.
- **Ventana:** fuera del horario de atención, con `backup-scheduler` detenido para que el respaldo diario no coincida con el bloqueo.

## 2. Respaldo previo

```bash
fc --profile backup run --rm backup-job; echo "exit=$?"
```

La salida debe incluir `[BACKUP COMPLETADO EXITOSAMENTE]` y terminar en `exit=0`. No continuar sin un respaldo verificado según `backup-restore.md`.

## 3. Verificación previa, solo lectura

```bash
fcsql <<'SQL'
BEGIN READ ONLY;
-- a) Migración pendiente (sin filas = aún no aplicada)
SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
WHERE migration_name = '20261013120000_inventory_adjustment_integrity';
-- b) Tamaño de las tablas, para estimar la duración del bloqueo
SELECT (SELECT count(*) FROM inventory_movements) AS movimientos,
       (SELECT count(*) FROM inventory_lots) AS lotes,
       pg_size_pretty(pg_total_relation_size('inventory_movements')) AS tamano_kardex;
-- c) Movimientos históricos con un producto distinto al dueño del lote (FARM-AUD-004)
SELECT m.id, m.created_at, m.movement_type, m.product_id AS producto_registrado,
       l.product_id AS producto_del_lote, l.lot_number, m.quantity_base_units
FROM inventory_movements m JOIN inventory_lots l ON l.id = m.lot_id
WHERE m.product_id <> l.product_id ORDER BY m.created_at;
-- d) Ajustes manuales históricos (conservan el motivo en reference_document_id)
SELECT count(*) AS ajustes_manuales_historicos FROM inventory_movements
WHERE reference_document_type = 'AJUSTE_MANUAL';
ROLLBACK;
SQL
```

- **c** no bloquea la migración. Sus filas se registran en el acta: son kardex con el producto equivocado y su corrección exige una decisión independiente (movimientos compensatorios), fuera de este alcance.
- Con decenas de miles de movimientos (**b**), el bloqueo dura segundos. Con millones, conviene medirlo antes en una copia restaurada (`restore-drill.sh`).

## 4. Construir la versión nueva y detener la aplicación

```bash
PREVIOUS_COMMIT=<commit desplegado actualmente>
NEW_COMMIT=$(git rev-parse HEAD)    # debe ser el commit que contiene la migración
echo "anterior=$PREVIOUS_COMMIT nuevo=$NEW_COMMIT"
fc build migrate api worker web
fc stop api worker backup-scheduler
fcsql <<'SQL'
SELECT pid, state, xact_start, left(query, 60) AS query
FROM pg_stat_activity
WHERE datname = current_database() AND pid <> pg_backend_pid();
SQL
```

No debe quedar ninguna sesión de la aplicación.

## 5. Aplicar la migración

```bash
fc --profile migration run --rm migrate; echo "exit=$?"
fcsql <<'SQL'
SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
WHERE migration_name = '20261013120000_inventory_adjustment_integrity';
SQL
```

**Detenerse aquí.** Si no terminó con `exit=0` o `finished_at` está vacío, no arrancar nada e ir a la sección 7. Si todo está bien, arrancar en un comando aparte:

```bash
fc up -d api worker web backup-scheduler
```

## 6. Verificación posterior

```bash
fcsql <<'SQL'
BEGIN READ ONLY;
SELECT conname, convalidated FROM pg_constraint
WHERE conname IN ('inventory_movements_lot_id_product_id_fkey',
                  'inventory_movements_manual_adjustment_reason_check');
SELECT column_name, character_maximum_length FROM information_schema.columns
WHERE table_name = 'inventory_movements' AND column_name = 'reason';
SELECT count(*) AS movimientos FROM inventory_movements;   -- igual al paso 3b
ROLLBACK;
SQL
```

- `inventory_movements_lot_id_product_id_fkey` queda con `convalidated = true` si **3c** no devolvió filas, y con `false` si las hubo (el aviso `FARM-AUD-004: N movimiento(s) ...` aparece en la salida de la migración).
- El número de movimientos no cambia.
- Cuando se registre el siguiente ajuste real, comprobar en *Movimientos* que muestra `Motivo: ...`. No crear ajustes de prueba en producción.

## 7. Si la migración falla

Todo ocurre en una sola transacción y un fallo no deja cambios. Causas esperables: `lock_timeout` (`canceling statement due to lock timeout`) o una sesión que quedó abierta.

1. Volver a la versión anterior mientras se investiga:
   ```bash
   git checkout "$PREVIOUS_COMMIT" && git rev-parse HEAD   # debe coincidir con PREVIOUS_COMMIT
   fc build api worker web
   fc up -d api worker web backup-scheduler
   ```
2. Si `_prisma_migrations` muestra el intento con `finished_at` y `rolled_back_at` vacíos, marcarlo como revertido:
   ```bash
   fc --profile migration run --rm migrate \
     ./packages/database/node_modules/.bin/prisma migrate resolve \
     --rolled-back 20261013120000_inventory_adjustment_integrity --config packages/database/prisma.config.ts
   ```
3. Volver al commit nuevo y repetir desde el paso 3:
   ```bash
   git checkout "$NEW_COMMIT" && git rev-parse HEAD   # debe coincidir con NEW_COMMIT
   ```

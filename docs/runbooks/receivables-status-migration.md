# Runbook: migración de estados de cuentas por cobrar

**Hallazgo:** FARM-AUD-003 · **Migración:** `20261012120000_unify_receivable_status` · **Actualizado:** 12 de octubre de 2026

Hasta esta corrección, la anulación de una venta a crédito guardaba la cuenta por cobrar con el estado `CANCELADA`, que el contrato no reconoce (`PENDIENTE`, `PAGADA`, `ANULADA`). La migración:

1. se detiene sin cambiar nada si hay estados desconocidos o alguna cuenta `CANCELADA` cuya venta no está anulada;
2. cambia `CANCELADA` por `ANULADA` solo cuando la venta de origen está en `CANCELLED`. No toca importes, abonos, notas ni relaciones;
3. agrega `CHECK chk_receivables_status_allowed`, que solo admite `PENDIENTE`, `PAGADA` y `ANULADA`.

Todo ocurre en una única transacción, con `LOCK TABLE "receivables" IN ACCESS EXCLUSIVE MODE`.

Los comandos usan el alias del runbook de respaldos:

```bash
cd /opt/farmacontrol
alias fc='docker compose --env-file infra/compose/.env -f infra/compose/docker-compose.production.yml'
alias fcsql='fc exec -T postgres sh -c '\''psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'\'''
```

## 1. Precauciones por el bloqueo `ACCESS EXCLUSIVE`

- **Qué bloquea:** mientras dura la migración nadie puede leer ni escribir `receivables`. Eso detiene el listado de cartera, los abonos, los reversos, las ventas a crédito y su anulación.
- **Duración:** la migración recorre la tabla una vez para validar, actualiza las filas `CANCELADA` y vuelve a recorrerla para comprobar el `CHECK`. Con el volumen de una farmacia tarda segundos.
- **Espera del bloqueo:** el riesgo real es que una transacción larga tenga la tabla abierta. En ese caso el `LOCK` espera y las demás consultas se ponen en cola detrás de él. Por eso la migración se ejecuta **con la API y el worker detenidos** (paso 4), sin sesiones de aplicación abiertas.
- **Versión del código:** la API anterior todavía escribe `CANCELADA`. Con el `CHECK` activo, anular una venta a crédito con esa versión falla y la transacción completa se revierte: no hay inconsistencia, pero la operación no se realiza. La API nueva debe arrancar justo después de la migración, nunca la anterior.
- **Ventana:** programarla fuera del horario de atención. `backup-scheduler` también se detiene (paso 4), para que el respaldo diario de `BACKUP_TIME` no coincida con el bloqueo.

## 2. Respaldo previo

```bash
fc --profile backup run --rm backup-job; echo "exit=$?"
```

La salida debe incluir `[BACKUP COMPLETADO EXITOSAMENTE]` y terminar en `exit=0`. El contenedor se elimina al terminar (`--rm`), así que `fc logs` no lo muestra. No continuar sin un respaldo verificado según `backup-restore.md`.

## 3. Verificación previa, solo lectura

Ejecutar con la aplicación todavía en servicio. No modifica nada.

```bash
fcsql <<'SQL'
BEGIN READ ONLY;
-- a) Migración pendiente (sin filas = aún no aplicada)
SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
WHERE migration_name = '20261012120000_unify_receivable_status';
-- b) Inventario por estado: guardar esta salida para comparar en el paso 6
SELECT status, count(*), sum(total_amount) AS total, sum(amount_paid) AS pagado, sum(balance) AS saldo
FROM receivables GROUP BY status ORDER BY status;
-- c) BLOQUEANTE: estados fuera de PENDIENTE, PAGADA, ANULADA y CANCELADA
SELECT id, sale_id, status FROM receivables
WHERE status NOT IN ('PENDIENTE', 'PAGADA', 'ANULADA', 'CANCELADA');
-- d) BLOQUEANTE: cuentas CANCELADA de una venta no anulada
SELECT r.id, s.invoice_number, s.status AS sale_status, r.balance
FROM receivables r JOIN sales s ON s.id = r.sale_id
WHERE r.status = 'CANCELADA' AND s.status <> 'CANCELLED';
-- e) Revisión, no bloquea: cuentas anuladas con abonos vigentes (anteriores a AUD-006)
SELECT r.id, r.status, count(p.id) AS abonos_vigentes
FROM receivables r JOIN receivable_payments p ON p.receivable_id = r.id AND NOT p.is_reversed
WHERE r.status IN ('CANCELADA', 'ANULADA') GROUP BY r.id, r.status;
-- f) Revisión, no bloquea: saldo distinto de total menos abonado
SELECT id, status, total_amount, amount_paid, balance FROM receivables
WHERE balance <> total_amount - amount_paid;
ROLLBACK;
SQL
```

- Si **c** o **d** devuelven filas, la migración se detendrá. Hay que revisar cada caso con el responsable financiero antes de seguir. No corregir estados a mano sin esa revisión.
- Las filas de **e** y **f** se registran en el acta de la migración. Su corrección queda fuera de este alcance.

## 4. Construir la versión nueva y detener la aplicación

`migrate`, `api`, `worker` y `web` se construyen desde el código (`build:` en compose). Ni `run` ni `up -d` reconstruyen una imagen que ya existe. Sin este paso, `migrate` no encuentra la migración nueva y vuelve a arrancar la API anterior, que escribe `CANCELADA`.

Anotar ambos commits: se necesitan si hay que volver atrás (sección 7).

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

No debe quedar ninguna sesión de la aplicación. Si queda alguna, esperar a que termine o identificarla antes de continuar.

## 5. Aplicar la migración y arrancar la versión nueva

```bash
fc --profile migration run --rm migrate; echo "exit=$?"
fcsql <<'SQL'
SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
WHERE migration_name = '20261012120000_unify_receivable_status';
SQL
```

**Detenerse aquí.** Si el resultado no fue `exit=0` o `finished_at` está vacío, no arrancar nada e ir a la sección 7. Solo cuando ambos son correctos, arrancar la versión nueva en un comando aparte:

```bash
fc up -d api worker web backup-scheduler
```

## 6. Verificación posterior

```bash
fcsql <<'SQL'
BEGIN READ ONLY;
SELECT migration_name, finished_at FROM _prisma_migrations
WHERE migration_name = '20261012120000_unify_receivable_status';
SELECT count(*) AS cancelada_restantes FROM receivables WHERE status = 'CANCELADA';   -- 0
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname = 'chk_receivables_status_allowed';
SELECT status, count(*), sum(total_amount) AS total, sum(amount_paid) AS pagado, sum(balance) AS saldo
FROM receivables GROUP BY status ORDER BY status;
ROLLBACK;
SQL
```

Resultado esperado al comparar con el paso 3b:

- las filas de `CANCELADA` pasan a sumarse en `ANULADA`;
- el número total de cuentas y las sumas de `total`, `pagado` y `saldo` no cambian.

Después, abrir *Cuentas por cobrar*, filtrar por *Anulada* y comprobar que no aparece ningún "Estado no reconocido".

## 7. Si la migración falla

Todo ocurre en una sola transacción, así que un fallo no deja cambios en `receivables`. Prisma, sin embargo, deja la migración marcada como fallida en `_prisma_migrations` y no aplicará otras hasta resolverla.

1. Leer el mensaje: `FARM-AUD-003: N cuenta(s) ...` indica cuál de las comprobaciones bloqueantes falló.
2. Mientras se revisan los datos, volver a arrancar la versión anterior. Sin la restricción aplicada, esa versión funciona como antes:
   ```bash
   git checkout "$PREVIOUS_COMMIT" && git rev-parse HEAD   # debe coincidir con PREVIOUS_COMMIT
   fc build api worker web
   fc up -d api worker web backup-scheduler
   ```
3. Revisar y corregir los datos con el responsable financiero, dejando constancia.
4. Marcar el intento fallido como revertido. Esto solo aplica si `_prisma_migrations` muestra la migración con `finished_at` y `rolled_back_at` vacíos. Prisma rechaza `--rolled-back` sobre una migración ya aplicada.
   ```bash
   fc --profile migration run --rm migrate \
     ./packages/database/node_modules/.bin/prisma migrate resolve \
     --rolled-back 20261012120000_unify_receivable_status --config packages/database/prisma.config.ts
   ```
5. Volver al commit nuevo y repetir desde el paso 3. El paso 4 reconstruye las imágenes con la migración:
   ```bash
   git checkout "$NEW_COMMIT" && git rev-parse HEAD   # debe coincidir con NEW_COMMIT
   ```

`prisma migrate deploy` no vuelve a aplicar una migración que ya terminó. Si alguien ejecutara el SQL a mano por segunda vez, `ADD CONSTRAINT` fallaría porque la restricción ya existe y la transacción completa se revertiría sin tocar datos.

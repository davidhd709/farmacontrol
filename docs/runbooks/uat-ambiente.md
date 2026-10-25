# Runbook — Ambiente de aceptación (UAT)

Prepara un ambiente limpio para que el cliente pruebe FarmaControl durante varios días (T-40) antes de la simulación de operación real (T-41). Usa la misma topología que producción, con datos de prueba aislados.

Lo ejecuta el desarrollador o quien opere el servidor. Está pensado para una sola vez por ambiente.

```bash
alias fc='docker compose --env-file infra/compose/.env -f infra/compose/docker-compose.production.yml'
```

## 1. Antes de empezar

| Requisito | Dónde se resuelve |
|---|---|
| Servidor con Docker y Docker Compose, dominio o IP y puertos 80/443 | Infraestructura |
| `infra/compose/.env` con `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `SESSION_SECRET` (32+ caracteres) y `DOMAIN` | Copiar de un ejemplo seguro; no se versiona |
| `infra/compose/backup.env` (clave pública `age`, destino `rclone`) | [backup-restore.md](backup-restore.md), sección 3 |
| Excel del PUC enviado por la contadora | Contadora |
| Lista de usuarios de prueba por rol | Cliente |

La base de UAT es nueva: no se copian datos de desarrollo ni de pruebas automáticas.

## 2. Levantar el sistema

```bash
fc build
fc up -d postgres
fc --profile migration run --rm migrate      # aplica todas las migraciones
fc up -d api worker web caddy backup-scheduler
fc ps                                        # todos "healthy"
curl -fsS https://$DOMAIN/api/v1/health      # status "ok"
```

Las migraciones dejan creados el cliente **Consumidor Final** y la ubicación **Bodega principal**. Sin una ubicación no se puede recibir la primera compra, y la web no permite crearla.

## 3. Administrador inicial

Crea los roles y permisos base y un único administrador. Si ya existe algún usuario, se niega.

```bash
read -r ADMIN_USER
read -rs ADMIN_PASS
fc run --rm -e INITIAL_ADMIN_USERNAME="$ADMIN_USER" -e INITIAL_ADMIN_PASSWORD="$ADMIN_PASS" \
  api node apps/api/dist/modules/identity/infrastructure/cli/provision-initial-user.js
unset ADMIN_PASS
```

## 4. Configuración desde la web (como administrador)

Hágalo en este orden; cada paso depende del anterior.

1. **Usuarios** (Configuración › Gestión de Usuarios): un usuario por persona y rol (cajero, inventario, compras, cartera, supervisor). No compartir cuentas.
2. **Plan de cuentas** (Configuración contable › Importar Plan de Cuentas): cargar el Excel de la contadora y revisar la naturaleza de las cuentas correctoras y de las marcadas `(DB)`/`(CR)`.
3. **Propósitos contables** (Configuración contable › Propósitos Contables): asignar cuenta a cada propósito. Sin `CASH`, `BANK`, `CUSTOMERS`, `SUPPLIERS`, `INVENTORY`, ventas y costo de ventas, las operaciones se registran pero sin asiento (decisión 8 del cliente). `RETAINED_EARNINGS` y `ACCUMULATED_LOSSES` son necesarios para el cierre anual; `SALES_DISCOUNTS`, para separar descuentos. Las cuentas de varios propósitos siguen pendientes con la contadora (ver `docs/PREGUNTAS_CONTADORA.md`).
4. **Cuentas bancarias** (Contabilidad y Finanzas › Tesorería y Bancos): crear cada cuenta desde su subcuenta del PUC.
5. **Catálogo**: categorías, unidades de medida, productos con su presentación por defecto y su costo.
6. **Terceros**: proveedores y clientes de crédito desde el Directorio de Terceros.
7. **Inventario inicial**: con recepciones de compra reales (lote y vencimiento por línea). No usar ajustes para cargar existencias: un ajuste no lleva costo ni proveedor.

## 5. Respaldo y simulacro antes de entregar

1. Forzar un respaldo: Configuración › Copias de Seguridad › **Crear Respaldo Ahora**. Confirmar la copia cifrada en el destino externo.
2. Simulacro de restauración desde la copia externa con `infra/scripts/restore-drill.sh` ([backup-restore.md](backup-restore.md), sección 6).
3. Abrir la web en el navegador del equipo de la farmacia y revisar que la consola no muestre errores de CSP.

## 6. Verificación rápida antes de entregar al cliente

Con un usuario de cada rol:

- [ ] El cajero ve el POS y no ve Contabilidad, Usuarios ni Respaldos (por URL ve "Sin permiso").
- [ ] Venta de prueba en efectivo: el POS muestra la asignación FEFO, el comprobante sale y el lote baja.
- [ ] Anular esa venta devuelve las unidades al lote.
- [ ] Recepción de una compra crea el lote y su movimiento en el kardex.
- [ ] El panel principal muestra caja, bancos, cartera y ventas por separado.
- [ ] Si los propósitos contables están completos, el libro diario muestra el asiento de la venta.

Después, eliminar las ventas de prueba no es posible (el historial es inmutable): anúlelas y documente que se hicieron antes del inicio de la UAT.

## 7. Durante la UAT

- El guion mínimo está en `docs/backlog-reunion/frontend-qa-aceptacion.md` (T-41): varios días con compras, ventas en efectivo y transferencia, notas crédito, anulaciones, cartera, cuentas por pagar y cierre diario conciliando kardex, caja y bancos.
- Cada hallazgo se registra con severidad, evidencia (captura y hora), usuario y responsable. Se corrige como un slice, nunca editando datos en la base.
- Participantes, duración y criterio de aprobación: **pendiente con el cliente** (decisión 17).
- La venta a crédito no está disponible en el POS (decisión 9 pendiente); las cuentas por cobrar solo se pueden probar si se habilita.

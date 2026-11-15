# Rediseño FarmaControl — Cierre de la fase 5 (confirmaciones y revisión final)

Fecha: 2026-11-15. Base: `f3866d9` (formato con Prettier en CI).

Esta fase solo cambia la web. No hay cambios de servidor, migraciones ni variables de entorno nuevas.

## Qué cambió

### Confirmación común (`ConfirmDialog`)

Las operaciones que cambian datos se confirman con un solo componente, `apps/web/src/components/ConfirmDialog.tsx`. El componente:

- **Nombra el registro** en un recuadro (`subject`), por ejemplo «RC-000012 · $ 50.000 · Cliente Crédito E2E».
- **Enumera los efectos concretos** bajo «Al confirmar:» (`effects`), en el orden en que ocurren.
- **Pide el motivo** cuando el flujo lo exige (`reason`). El mínimo es el mismo que valida el servidor, y el texto llega recortado.
- **Nombra la acción en el botón**: «Anular recibo», «Revertir pago», «Inactivar tercero», «Cerrar período», etc.
- **Evita envíos duplicados.** Mientras la operación corre, los botones se deshabilitan y muestran «Procesando…». Una referencia interna descarta el segundo clic que llega antes de que React vuelva a pintar.
- **Deja el error dentro del diálogo.** El mensaje del servidor se muestra dentro del diálogo, que sigue abierto para reintentar o cancelar. Antes, en varias pantallas, el error quedaba detrás del diálogo o en un `alert()` nativo.
- **Funciona con teclado.**
  - Enter envía desde el formulario, salvo dentro del motivo de varias líneas.
  - Escape cancela.
  - Mientras la operación corre, ni Escape ni un clic fuera cierran el diálogo.
  - Al cerrar, el foco vuelve al control que abrió el diálogo.
- **Fija el foco inicial** según la acción:
  - en «Cancelar» si la acción es destructiva y no pide motivo;
  - en el motivo si lo pide;
  - en el botón de confirmar en los demás casos.

  Ese foco se aplica de nuevo al terminar la transición de entrada. La E2E mostró que en Chromium la trampa de foco del diálogo lo tomaba después de montar los botones y el foco no llegaba a «Cancelar».

`SweetModal` dejó de escuchar el teclado de toda la ventana. Sus colores salen ahora de la paleta del tema, con contraste AA.

### Cobertura por operación

| Pantalla | Operación | Antes | Ahora |
|---|---|---|---|
| Recibos de caja / Comprobantes de egreso | Anular | Panel en línea sin efectos | Confirmación con número, tercero y valor. Efectos según el origen: las facturas recuperan su saldo, el dinero sale de caja o banco, se registra el asiento de reversa. Motivo de al menos 3 caracteres, como en el servidor. |
| Libro diario | Anular nota manual | Diálogo sin el registro | Título con el número del asiento; descripción, fecha, débitos y créditos; motivo de al menos 5 caracteres; aviso de éxito |
| Notas crédito | Anular | El error quedaba detrás del diálogo | Confirmación común. Efectos según reintegro a inventario y forma de reembolso (caja, banco o cartera). |
| Gastos | Anular gasto / revertir pago | No nombraba el gasto ni el pago | Nombra el gasto (número, descripción, proveedor, valor) o el pago (fecha, valor, medio); efectos; aviso de éxito concreto |
| Cuentas por pagar | Revertir pago | Sin número ni valor; motivo de 1 carácter; sin aviso | Nombra el comprobante, el valor y la fecha; efectos sobre la factura y la caja o el banco; motivo de al menos 3; aviso en el detalle |
| Gastos sin proveedor | Asignar proveedor | Botón «Asignar» | «Revisar asignación» abre la confirmación «Asignar proveedor» con la causación y los efectos |
| Períodos fiscales | Cerrar / reabrir | El error quedaba detrás del diálogo | Período y fechas; efectos del cierre (incluido el asiento de cierre si se marca); motivo de reapertura de al menos 10 |
| Períodos fiscales | Bloqueo de documentos | Se aplicaba sin confirmar | Confirmación con la fecha de corte, el alcance y el motivo; aviso de éxito |
| Clientes, proveedores y otros | Inactivar / activar | Diálogo propio con `alert()` | Nombre y documento del tercero; efectos; botón con nombre accesible «Inactivar {tercero}» |
| Clientes, proveedores y otros | Datos tributarios | Botón «Guardar»; se podía cerrar mientras guardaba | «Guardar datos tributarios»; no se cierra mientras guarda; aviso de éxito |
| Plan de cuentas | Inactivar / reactivar cuenta | Diálogo propio | Código y nombre; efectos; aviso de éxito |
| Propósitos contables | Cambiar la cuenta | Botón «Guardar» genérico | «Guardar cuenta», con nombre accesible «Guardar la cuenta de {propósito}» |
| Productos → presentaciones | Inactivar, reactivar, «Fijar venta» | Reactivar y fijar sin confirmar ni bloqueo | Confirmación con presentación y factor; «Fijar presentación principal» avisa que la principal actual deja de serlo; aviso de éxito |
| Categorías de gasto | Inactivar | Switch sin confirmar; error detrás del formulario | Confirmación al guardar una inactivación; error dentro del formulario; botones «Crear categoría» / «Guardar categoría» |
| Bancos | Inactivar cuenta | Selector sin confirmar | Al guardar una inactivación, confirmación con banco, número y efectos; no se cierra mientras guarda |
| Unidades de medida | Crear / editar | Doble clic creaba dos veces | Guardia contra el doble envío; «Crear unidad» / «Guardar unidad»; no se cierra mientras guarda |
| Respaldos | Generar copia | Diálogo propio; el error se mostraba detrás | Confirmación común con los efectos; no se cierra mientras genera |
| Usuarios y barra superior | Roles | Códigos (`admin`, `tesoreria`) | Nombres: Administrador, Tesorería, etc. |
| Libro diario | Carga y vacío | Error sin acción; vacío cortado a 360 px dentro de la tabla | «Reintentar»; el mensaje de vacío queda fuera de la tabla |

**Criterio para las creaciones simples.** Crear una categoría, una unidad o un tercero no abre un segundo diálogo, porque el botón del formulario ya nombra la acción y la velocidad de operación es la primera prioridad del documento UX. La confirmación se reserva para lo que cambia saldos, inventario, contabilidad o acceso, y para lo irreversible. Los flujos con revisión final usan esa pantalla como confirmación: venta en el POS, devolución, recepción de compra, corrección de recibos y egresos. Esos flujos ya se ajustaron en las fases 2 a 4.

## Matriz de pantallas y documentos

Leyenda:

- **N:** la verificación es en navegador (E2E Playwright).
- **C:** la verificación es en código (prueba de componente con Vitest y jsdom).
- **—:** no aplica.

| Pantalla | Ruta | Operaciones que cambian datos | Confirmación / revisión | Estados (carga, vacío, error, sin permiso) | Verificado |
|---|---|---|---|---|---|
| Punto de venta | `/pos` | Confirmar venta | Revisión final con impacto; idempotente | Faltante y cantidad superior a la disponible | N (fase 2, `pos-fefo`) |
| Historial de ventas / detalle | `/sales`, `/sales/:id` | Anular venta, devolución | Revisión de la devolución | Vacío y filtros | N (fase 2), C |
| Notas crédito | `/credit-notes` | Emitir, anular | Común con efectos y motivo | Enlace `?nota=` inexistente avisa | C, N (fase 4, PDF) |
| Productos / presentaciones | `/products` | Crear, editar, inactivar, reactivar, fijar venta | Común | Error en el diálogo | C |
| Categorías | `/categories` | Crear, editar, inactivar | Común (inactivar) | — | C (existente) |
| Unidades de medida | `/units-of-measure` | Crear, editar, inactivar | Común (inactivar); sin doble envío | — | C |
| Lotes / movimientos | `/inventory/lots`, `/inventory/movements` | Crear lote, ajustar | Diálogo de ajuste con impacto | Tabla ancha con desplazamiento | N (1440/1366/360) |
| Compras | `/purchases`, `/purchases/receive` | Recibir, devolver | Revisión final de la recepción | — | N (fase 3) |
| Terceros | `/third-parties` | Crear, editar, inactivar, activar, datos tributarios | Común | Error de guardado en el diálogo | N, C |
| Caja | `/cash` | Abrir, cerrar, movimientos | Revisión del cierre (fase 4) | — | N (fase 4) |
| Bancos | `/treasury/bank-accounts` | Crear, editar, inactivar | Común (inactivar) | — | C |
| Recibos / egresos | `/treasury/receipts`, `/treasury/disbursements` | Registrar, corregir, anular | Corrección con revisión; anulación común | Vacío con filtros; exportación | N (fase 4 y 5), C |
| Cuentas por cobrar / pagar | `/receivables`, `/payables` | Revertir pago a proveedor | Común | — | C |
| Gastos | `/expenses` | Causar, anular, revertir pago, asignar proveedor | Común | — | C, N (fase 4, PDF) |
| Libro diario | `/accounting/journal` | Nota manual, anular nota | Común (anular) | Error con «Reintentar»; vacío; fecha bloqueada | N, C |
| Períodos fiscales | `/accounting/periods` | Cerrar, reabrir, bloqueo de documentos, cierre anual | Común | Error del servidor en el diálogo | N (bloqueo), C |
| Plan de cuentas / propósitos | `/accounting/accounts`, `/accounting/purposes` | Crear, inactivar, cambiar cuenta | Común (inactivar) | — | C |
| Reportes y consultas contables | `/reports`, `/accounting/*` (balances, libros, consulta) | Solo exportar | — | Carga | N (1440/1366/360) |
| Empresa / catálogo tributario | `/company`, `/tax-catalog` | Configurar | Formulario | — | N (1440/1366/360) |
| Usuarios | `/users` | Crear, roles, activar | Formulario | Sin permiso (cajero) | N (`permissions`, 1440/1366/360), C |
| Respaldos | `/backups` | Generar, verificar | Común | Sin permiso (cajero) | N (`permissions`), C |

Documentos impresos: la matriz de impresión y PDF por tipo sigue en `FASE_4_CIERRE.md`, sin cambios en esta fase.

## Recorridos desde la interfaz con datos de prueba

Todos corren en la suite E2E (`pnpm test:e2e`) sobre una base PostgreSQL temporal con datos creados por la corrida.

| Recorrido o caso | Prueba |
|---|---|
| Venta con teclado y FEFO | `redesign-phase2.spec.ts`, `pos-fefo.spec.ts` |
| Cantidad superior a la disponible | `pos-fefo.spec.ts` («la vista previa avisa el faltante y no deja cobrar más de lo vendible») |
| Compra con dos presentaciones y dos lotes, y su devolución | `redesign-phase3.spec.ts` |
| Devolución de venta | `redesign-phase2.spec.ts` |
| Corrección de recibo y egreso | `redesign-phase4.spec.ts` |
| Impresión y PDF | `redesign-phase4.spec.ts` |
| Consulta contable (asiento de un gasto) | `redesign-phase4.spec.ts` |
| Acceso denegado en la web y en la API | `permissions.spec.ts` |
| Período bloqueado: bloqueo con confirmación por teclado, nota rechazada en su diálogo, retiro del bloqueo | `redesign-phase5.spec.ts` |
| Error de guardado: inactivar un tercero con una respuesta 500 simulada en la red | `redesign-phase5.spec.ts` |
| Error de carga con «Reintentar» y lista vacía | `redesign-phase5.spec.ts` |
| Escritorio 1440, portátil 1366 y ventana de 360 en 8 pantallas | `redesign-phase5.spec.ts` |

En las 8 pantallas y los tres anchos, la prueba de ventanas comprueba que:

- la página no se desplaza a lo ancho;
- cada tabla cabe en la ventana;
- una tabla más ancha que la ventana se desplaza dentro de su contenedor.

Capturas en `docs/rediseno/fase-5/`.

## Archivos principales

- `apps/web/src/components/ConfirmDialog.tsx`
- `apps/web/src/components/SweetModal.tsx`
- `apps/web/src/context/AlertModalContext.tsx`
- `apps/web/src/features/treasury/pages/TreasuryDocumentsPage.tsx`
- `apps/web/src/features/treasury/components/BankAccountDialog.tsx`
- `apps/web/src/features/accounting/pages/JournalEntriesPage.tsx`
- `apps/web/src/features/accounting/pages/FiscalPeriodsPage.tsx`
- `apps/web/src/features/accounting/pages/AccountingPages.tsx`
- `apps/web/src/features/accounting/components/DocumentLockCard.tsx`
- `apps/web/src/features/sales/pages/CreditNotesPage.tsx`
- `apps/web/src/features/expenses/components/ExpenseReasonDialog.tsx`
- `apps/web/src/features/expenses/components/ExpenseCategoriesModal.tsx`
- `apps/web/src/features/expenses/components/ExpensesWithoutSupplierDialog.tsx`
- `apps/web/src/features/expenses/pages/ExpensesPage.tsx`
- `apps/web/src/features/payables/components/PayableReversalDialog.tsx`
- `apps/web/src/features/payables/components/PayableMovementsDialog.tsx`
- `apps/web/src/features/catalog/components/ProductPresentationsDialog.tsx`
- `apps/web/src/features/catalog/pages/UnitsOfMeasurePage.tsx`
- `apps/web/src/features/third-parties/pages/ThirdPartiesPage.tsx`
- `apps/web/src/features/taxes/components/SupplierFiscalDialog.tsx`
- `apps/web/src/features/backups/pages/BackupManagementPage.tsx`
- `apps/web/src/features/users/role-labels.ts`
- `apps/web/src/features/users/pages/UsersPage.tsx`
- `apps/web/src/components/layout/AppNavbar.tsx`
- Pruebas nuevas:
  - `apps/web/test/fiscal-periods.test.tsx`
  - `apps/web/test/expense-categories.test.tsx`
  - `apps/web/test/units-of-measure.test.tsx`
  - `tests/e2e/specs/redesign-phase5.spec.ts`

## Pruebas ejecutadas

### En código

| Comando | Resultado |
|---|---|
| `pnpm format:check` | Sin diferencias |
| `pnpm typecheck` y `pnpm typecheck:e2e` | Sin errores |
| `pnpm lint` | 0 errores (advertencias previas: web 33, API 98, worker 3, base de datos 3) |
| `cd apps/web && npx vitest run` | 59 archivos, 436 pruebas pasadas (426 al iniciar la fase) |
| `pnpm --filter @farmacia/web build` | Compila |

Pruebas de componente nuevas o ampliadas:

- `confirm-dialog`: registro y efectos, foco en «Cancelar», motivo obligatorio y recortado, doble clic, error y reintento.
- `fiscal-periods`: cierre con error del servidor en el diálogo, reapertura con motivo mínimo, retiro del bloqueo con error y reintento.
- `expense-categories`: confirmación de inactivación, error dentro del formulario.
- `units-of-measure`: el doble envío crea una sola vez. Esta prueba falló antes de la corrección: confirmó la regresión.
- `presentations`: fijar la principal de venta con confirmación, error y reintento.
- `treasury`: inactivar una cuenta bancaria con confirmación.
- `third-parties`, `journal-entries`, `credit-notes-page`, `document-annulments`, `expenses-forms`, `backups`, `accounting`: actualizadas a los nuevos textos y flujos.

No cambió el servidor; las pruebas de API no se volvieron a ejecutar en esta fase.

### En navegador (Playwright, Chromium, `APP_ENVIRONMENT=pruebas`)

`APP_ENVIRONMENT=pruebas pnpm test:e2e`: 24 pasadas y 5 omitidas, en 2,8 minutos. Las omitidas son las capturas responsive, que solo corren con `RESPONSIVE_SHOTS`.

La E2E de la fase 5 encontró un defecto que jsdom no reproducía: en Chromium el foco inicial no quedaba en «Cancelar». Se corrigió en `ConfirmDialog` fijando el foco al terminar la entrada del diálogo.

Las capturas también mostraron tres defectos, que se corrigieron:

- el mensaje de vacío del Libro Diario quedaba cortado a 360 px;
- el error de carga del Libro Diario no ofrecía una acción;
- los campos de fecha de recibos y egresos eran demasiado angostos a 1440.

## Decisiones

- **Las creaciones simples no abren un segundo diálogo.** Ver el criterio de «Cobertura por operación».
- **Motivos con el mínimo del servidor:**
  - anular un recibo o egreso: 3 caracteres;
  - anular un gasto, un asiento o una nota crédito: 5;
  - reabrir un período: 10.

  En la reversión de pagos a proveedor el servidor solo exige texto; la web pide 3 caracteres para que el motivo diga algo.
- **El error del servidor se muestra donde está la acción.** Los manejadores lanzan su error y el diálogo lo presenta; ya no se cierran en silencio ni muestran `alert()`.
- **Nombres de rol solo en la presentación.** La web traduce los roles del sistema; el código del rol no cambia en la API ni en la base.

## Pendientes

Los pendientes de esta fase se resolvieron en un cierre posterior. Ver «Cierre de pendientes de la fase 5».

## Cierre de pendientes de la fase 5

### Idempotencia del ajuste de inventario (cambio de servidor)

Se revisaron las cuatro operaciones que no enviaban `Idempotency-Key`. Solo el ajuste de inventario podía duplicar su efecto.

| Operación | Protección ante un envío repetido | Cambio |
|---|---|---|
| Anular venta | Bloquea la venta (`FOR UPDATE`) y valida su estado: la repetición responde 409 «ya anulada» sin efectos | Ninguno |
| Anular nota crédito | Bloquea la nota y la venta, y valida el estado `ANULADA` | Ninguno |
| Recibir compra | Clave única `(proveedor, factura)`: la repetición responde 409 «factura duplicada» | Ninguno |
| Ajustar inventario | Cada envío asentaba un ajuste nuevo | `Idempotency-Key` |

- **Causa.** Si la respuesta de un ajuste se perdía, por ejemplo por un corte de red, el reintento asentaba un segundo ajuste en el lote, el Kardex y la contabilidad.
- **Cambio en el servidor.** `POST /api/v1/inventory/movements/adjust` acepta la cabecera `Idempotency-Key`.
  - **Misma clave y mismo contenido:** responde el ajuste original sin escribir nada, aunque los dos envíos lleguen a la vez.
  - **Misma clave con otro contenido:** responde 409 sin efectos.
  - **Sin clave:** se comporta como antes. Así no cambia el contrato para otros clientes ni para las pruebas existentes.
  - **Transacción.** La consulta y el registro de la clave van en la misma transacción serializable del ajuste, antes de bloquear el lote.
- **Cambio en la web.** El diálogo de ajuste siempre envía la clave. La conserva mientras se reintenta el mismo ajuste y la renueva tras un éxito o si cambian los datos.
- **Pruebas.** La prueba de integración `inventory-adjustments.integration.spec.ts`, con PostgreSQL real, cubre:
  - el reintento con la misma clave;
  - dos envíos simultáneos;
  - una clave con otro contenido;
  - el comportamiento sin clave.

### Código sin uso retirado

- `AlertModalContext` y su proveedor en `main.tsx`.
- `ReceivableReversalDialog`, la función `revertReceivablePayment` de la web y los esquemas de reversión de cartera y de proveedores. El endpoint del servidor sigue existiendo y conserva sus pruebas de API.
- Se retiraron también las pruebas que solo cubrían ese código.

### Comprobante de egreso y recibo de caja

La confirmación de un recibo o egreso nuevo usa ahora la confirmación común:

- **Registro:** nombra el tercero (cliente o proveedor), el valor y el medio de pago.
- **Efectos:** por cada factura, el abono o pago y la baja de su saldo; el dinero que entra o sale de caja o de la cuenta bancaria elegida; y el asiento.
- **Botón:** «Registrar recibo de caja» o «Registrar comprobante de egreso».
- **Error:** un error del servidor queda en la confirmación.

### Avisos de éxito

| Formulario | Aviso |
|---|---|
| Registrar lote | «Lote registrado con su existencia inicial.» |
| Ajuste de inventario | «Ajuste asentado: el lote, el Kardex y la contabilidad quedaron actualizados.» |
| Saldos de apertura | «Saldos de apertura registrados con su asiento.» |
| Perfil tributario de la empresa | «Perfil tributario registrado, vigente desde el …» |
| Clasificación tributaria de un producto | «Clasificación … registrada y activa desde el …» |

En el diálogo de ajuste, el error del servidor queda ahora en la confirmación y se puede reintentar con la misma clave. Antes la confirmación se cerraba y el error quedaba arriba del formulario, fuera de la vista.

La E2E `redesign-phase5.spec.ts` hace el ajuste desde la interfaz:

1. Sin cuenta de sobrantes configurada, el servidor lo rechaza y el error se ve en la confirmación.
2. Se asigna la cuenta por API y se reintenta desde el mismo diálogo.
3. El aviso de éxito aparece y el saldo pasa de 10 a 12.

Capturas: `ajuste-inventario-error-1440.png` y `ajuste-inventario-exito-1440.png`.

El mensaje del servidor para un propósito sin cuenta nombraba solo el código técnico. Ahora dice: «Falta un mapeo activo e imputable para «Sobrantes de inventario» (INVENTORY_SURPLUS): asígnale una cuenta en Contabilidad → Propósitos contables.»

### Lo que sigue abierto

- **OpenAPI.** Ningún endpoint idempotente documenta todavía la cabecera `Idempotency-Key` con `@ApiHeader`; hacerlo es un cambio transversal de documentación.
- **Configuración de la empresa.** Las secciones de `CompanySettingsPage` no se revisaron una por una en busca del aviso de éxito.
- **Lint.** Siguen las advertencias previas, que no son errores.

## Siguiente paso

Con la fase 5 se cierra el plan de rediseño. El siguiente paso lógico es decidir si se aborda la idempotencia de servidor en `cancelSale`, `cancelCreditNote`, `receivePurchase` y `adjustInventory`, y retirar el código sin uso listado arriba.

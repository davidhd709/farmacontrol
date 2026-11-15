# Rediseño FarmaControl — Cierre de la fase 2 (ventas y devolución de clientes)

Fecha: 2026-11-14. Base: `def066b` (cierre de la fase 1). Sin migraciones ni variables de entorno nuevas.

## Qué cambió

### Punto de venta

- **«Cargando cliente…» persistente (hallazgo de la fase 0).** El cliente de la venta tiene ahora cuatro estados visibles:
  - cargando, con indicador;
  - cliente asignado;
  - sin Consumidor final activo;
  - error de carga, con «Reintentar».

  El error ya no se pierde en la consola.
- **Decisión D2, resuelta con la regla vigente.** El servidor solo factura sin cliente si existe un Consumidor final activo; si no, responde 409 (`sale.service`). Por eso, cuando falta:
  - el POS lo dice: «Sin cliente: no hay un Consumidor final activo. Elija un cliente para cobrar.»;
  - el cobro queda bloqueado (botón, F2 y barra móvil) y se muestra el motivo debajo del botón;
  - no se inventa ningún cliente.
- **Selector de cliente más compacto.** Las acciones van en una fila de botones pequeños. «Volver a Consumidor final» se oculta cuando ese ya es el cliente, o cuando no existe.
- **Teclado:**
  - el foco inicial está en el buscador;
  - Enter agrega el producto;
  - F2 abre el cobro con el foco en «Efectivo recibido» y el valor seleccionado. Antes `autoFocus` no funcionaba dentro del `Dialog`; lo encontró la E2E nueva;
  - Enter confirma, y Enter en el comprobante inicia otra venta con el foco de vuelta en el buscador;
  - al cancelar el cobro, el foco también vuelve al buscador.
- **Total siempre visible.**
  - En escritorio, el resumen es fijo bajo la barra superior (`top: 80`).
  - En pantallas sin columna lateral, una barra inferior muestra el total y «Cobrar».
- **Comprobante (tirilla).** Ya no imprime «FARMACONTROL · Calle Principal # 12-34 · Barranquilla», un dato inventado señalado en la fase 0. Usa el membrete real de la empresa y omite lo que no esté configurado.

### Servidor

- **Nuevo `GET /api/v1/company/letterhead`.**
  - **Causa:** el rol cajero no tiene `company:read`, así que la tirilla no podía leer `/company`. Además, ese endpoint expone las políticas contables.
  - **Qué devuelve:** solo razón social, nombre comercial, NIT, dígito de verificación, dirección, teléfono y correo, con la forma `{ company: … | null }`.
  - **Acceso:** requiere sesión y al menos uno de `company:read`, `sales:read`, `sales:create` o `purchases:read`.
- **D5: Consumidor final protegido desde Terceros.** Los métodos `setActive`, `update` y `upsert` de `CustomersLedger` ahora rechazan inactivar el cliente predeterminado, con la misma excepción que ya usaba `CustomerService`. El rechazo ocurre dentro de la transacción del tercero, así que no queda nada a medias: ni el cliente ni el tercero quedan inactivos.

### Devolución (nota crédito)

- **Fallo corregido: el resumen del paso 4 se quedaba en $0,00.**
  - **Causa:** `watch()` devuelve siempre el mismo objeto `quantities` (React Hook Form lo muta en sitio), y el resumen estaba memoizado por referencia.
  - **Arreglo:** ahora se calcula en cada render.
- **Revisión antes de confirmar.**
  - Lista las líneas a devolver («1 × Producto — $…»).
  - Muestra el efecto en cada área, en texto:

    | Área | Qué indica |
    | --- | --- |
    | Caja | Egreso de la caja abierta, o «sin movimiento» |
    | Cartera | Baja del saldo del cliente, o «sin cambios» |
    | Bancos | Solo con transferencia |
    | Inventario | Vuelve al lote original, o se da de baja |
    | Cambio | Abre el punto de venta para la venta de reemplazo |

  - Los textos siguen lo que hace `credit-notes.service`: el reembolso en efectivo es un egreso de caja, no un comprobante de egreso de tesorería.
- **Medio de pago original** con su nombre («Efectivo») en lugar del código interno.
- **Se mantiene sin cambios:**
  - acceso desde el detalle de la venta, con la factura precargada, y desde Notas crédito / Historial;
  - cantidades vendida, ya devuelta y disponible, con el lote;
  - motivo, reembolso, reintegro y cambio de producto;
  - clave de idempotencia por contenido y bloqueo de doble envío.

## Archivos principales

| Área | Archivos |
| --- | --- |
| API | `apps/api/src/modules/customers/application/customers-ledger.ts`, `apps/api/src/modules/company/application/company.service.ts`, `apps/api/src/modules/company/presentation/company.controller.ts`, `packages/contracts/src/company.ts` |
| Web | `apps/web/src/features/sales/pages/PosPage.tsx`, `apps/web/src/features/sales/components/PosCustomerSelector.tsx`, `apps/web/src/features/sales/components/PosPaymentDialog.tsx`, `apps/web/src/features/sales/components/SaleReceiptDialog.tsx`, `apps/web/src/features/sales/components/CreditNoteDialog.tsx`, `apps/web/src/features/company/hooks/useCompanyLetterhead.ts`, `apps/web/src/features/company/api/company.api.ts` |
| Pruebas | `apps/api/test/integration/third-parties.controller.integration.spec.ts`, `apps/api/test/integration/company.integration.spec.ts`, `apps/web/test/pos.test.tsx`, `apps/web/test/sale-detail.test.tsx`, `tests/e2e/specs/redesign-phase2.spec.ts` |

## Pruebas ejecutadas

### En código

| Comando | Resultado |
| --- | --- |
| `pnpm typecheck` | 0 errores (api, web, worker) |
| `pnpm lint` | 0 errores; advertencias iguales a la línea base (web 40, api 98) |
| `npx vitest run` (web) | 55 archivos, 399 pruebas: todas pasan |
| `pnpm build` (web) | correcto |
| `pnpm test` API con PostgreSQL efímero: clientes, terceros unificado, alcance de terceros, controlador de terceros, empresa, OpenAPI | 6 archivos, 37 pruebas: todas pasan |

Pruebas nuevas:

- **Servidor:**
  - Consumidor final no inactivable desde terceros, con reversión completa (400);
  - membrete visible para caja con `/company` en 403 y sin sesión en 401.
- **Web:**
  - sin Consumidor final;
  - error con reintento;
  - foco tras cobrar;
  - devolución parcial desde el detalle con su impacto.

### En navegador (Playwright, Chromium, `APP_ENVIRONMENT=pruebas`)

Suite E2E completa: 15 pasan y 5 omitidas, que son las mismas omitidas de la fase 1.

- La única falla fue el selector `getByText('TOTAL A PAGAR')` de `pos-fefo`. Encontraba también el texto de la barra móvil oculta. Se cambió ese texto a «Total · N líneas» y `pos-fefo` y la fase 2 volvieron a pasar (4/4).
- `redesign-phase2.spec.ts` cubre:
  - **Criterio de aceptación.** Con datos creados por la corrida (producto «Rediseño Teclado», lote de 30 unidades):
    - venta de 3 unidades solo con teclado;
    - ubicación de la venta en el historial y apertura del detalle;
    - devolución parcial de 1 unidad con el impacto visible;
    - el lote queda en 27 tras la venta y en 28 tras la devolución.
  - **Ventana de 360 px:** barra de total visible, cobro habilitado y sin desplazamiento horizontal.
- Capturas en `docs/rediseno/fase-2/`:
  - `pos-carrito-1440.png`
  - `pos-comprobante-1440.png`
  - `devolucion-revision-1440.png`
  - `pos-360.png`
- Las capturas de la fase 1 se regeneraron en la misma corrida.

En las capturas de página completa a 360 px, la barra fija aparece superpuesta al resumen. Es un efecto de la captura: en pantalla queda anclada al borde inferior.

No se verificó en el ambiente Vida Sana (sin acceso).

## Decisiones

- **D2:** se aplica la regla existente del servidor, sin regla nueva.
- **D5:** implementada en el servidor.
- **Membrete:** se expone con un endpoint propio y no con más permisos para caja. Así `company:read` sigue protegiendo las políticas contables.

## Pendientes

- `PrintableDocumentLayout` y `useCompanyInfo` todavía rellenan datos ficticios («NIT: 900.000.000-1», «contacto@farmacontrol.com»). Pasan a la fase 4 (documentos e impresión), donde deben usar el membrete.
- D1 (corrección atómica de documentos de tesorería) y D3 (anulación de notas débito) siguen abiertas para las fases 3 y 4.
- `PosPaymentDialog.tsx` ya estaba sin formato Prettier antes de esta fase. Se dejó así para no mezclar un cambio masivo de formato.
- La auditoría de seguridad independiente (`codex-auditor`) no se ejecutó en esta fase. El endpoint nuevo se revisó a mano: guarda de sesión y permisos, campos mínimos y pruebas de 401 y 403.

## Siguiente paso

Fase 3: compras, inventario y terceros.

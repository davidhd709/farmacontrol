# Rediseño FarmaControl — Cierre de la fase 3 (compras, inventario y terceros)

Fecha: 2026-11-14. Base: `001d777` (cierre de la fase 2).

Esta fase solo cambia la web. No hay cambios en el servidor, migraciones ni variables de entorno.

## Qué cambió

### Recepción de compras en tres pasos

La recepción ahora se hace en tres pasos: **datos de la factura**, **productos y lotes**, y **totales y revisión**.

- **Avance controlado.** Solo se pasa al paso siguiente cuando el actual es válido. Los errores aparecen en el campo o la fila afectada, y el foco va a ese campo.
- **Encabezado siempre visible.** Una franja fija muestra proveedor, comprobante, número de líneas y subtotal.
- **La revisión hace de confirmación.** Reemplaza el diálogo «Sí, Confirmar Recepción», como pide el plan para flujos con revisión final. Muestra:
  - por cada línea: presentación con su factor, cantidad, unidades base, costo, lote con vencimiento (o series) y subtotal;
  - el efecto en inventario, en el proveedor (cuenta por pagar con su vencimiento) y en contabilidad (asiento de la compra).
- **Subtotal, no total.** El IVA y las retenciones los calcula el servidor al registrar y el servidor no ofrece vista previa. Por eso la revisión muestra el «Subtotal de líneas» y avisa que el total definitivo queda en el detalle de la compra.
- **Error del servidor.** La pantalla se queda en la revisión, con los datos intactos, y ofrece «Revisar factura» y «Revisar productos».
- **Duplicados.** Los sigue frenando la restricción única proveedor + factura de la base de datos.

### Devolución al proveedor (nota débito), con el mismo patrón que la de clientes

- **Por línea muestra:** lo recibido, lo ya devuelto (de las notas débito de la compra), la existencia actual del lote y lo que se puede devolver hoy.
- **Lo devolvible sigue las reglas de `debit-notes.service`:** el saldo de la compra en unidades base, limitado por la existencia del lote. El formulario rechaza una cantidad mayor («Solo se pueden devolver N.»). El servidor lo vuelve a validar al confirmar.
- **Efecto previsto antes de confirmar:**
  - Inventario: unidades base que salen y de qué lote.
  - Proveedor: baja de la cuenta por pagar, con el IVA estimado en proporción.
  - Contabilidad: asiento de la nota débito.
- **Si la existencia cambió antes de guardar,** se muestra el error del servidor con la acción «Actualizar existencias». Esa acción vuelve a consultar los datos sin borrar lo escrito.
- **Acceso desde la compra original:** el detalle de la compra ofrece «Devolución al proveedor» (con permiso y solo en compras recibidas). El botón «Devolución» del historial se mantiene.

### Inventario

- **Stock y lotes** distingue dos vistas:
  - **Por producto:** existencia vendible, es decir, lotes activos con saldo y sin vencer, la misma suma que usa el POS.
  - **Por lote:** detalle con vencimiento y estado.

  Desde la vista por producto se pasa a sus lotes («Ver lotes») o a su Kardex. Cada lote tiene su enlace «Kardex».
- **El contexto viaja en la URL** (`vista`, `productId`, `lotId`, `ref`). Ir y volver entre stock y Kardex no pierde el producto.
- **Kardex:**
  - acepta el filtro por documento (`ref`), con un aviso «Mostrando los movimientos de la compra …» y la opción de ver todos;
  - el filtro de tipo ofrece todos los tipos, no solo cuatro;
  - el detalle de la compra enlaza «Ver movimientos».
- **Etiquetas en español sin cambiar los valores internos:**
  - tipos de movimiento: «Entrada por compra», «Salida por devolución a proveedor», etc.;
  - documentos: «Compra», «Nota débito», «Ajuste manual», etc.;
  - estado de compra: «Recibida».

### Catálogo y terceros

- **Productos:** «Nuevo Producto» es la acción principal y va primero. Plantilla, importación y exportación pasan a un menú «Importar y exportar». La importación sigue exigiendo `products:manage`.
- **Terceros:** la pestaña (clientes, proveedores…) y la búsqueda viven en la URL (`rol`, `q`). Se conservan al volver o recargar.
- **Categorías y unidades** ya tenían la creación como acción principal. Sus títulos no se cambiaron para no romper pruebas ni enlaces sin un beneficio claro.

## Archivos principales

- **Compras:** `apps/web/src/features/purchases/pages/ReceivePurchasePage.tsx`, `components/DebitNoteDialog.tsx`, `components/PurchaseDetailDialog.tsx`, `pages/PurchasesListPage.tsx`, `validation/debit-note.schema.ts`, `purchase-labels.ts`
- **Inventario:** `apps/web/src/features/inventory/pages/InventoryLotsPage.tsx`, `pages/InventoryMovementsPage.tsx`, `movement-labels.ts`, `api/inventory.api.ts`
- **Catálogo y terceros:** `apps/web/src/features/catalog/pages/ProductsPage.tsx`, `apps/web/src/features/third-parties/pages/ThirdPartiesPage.tsx`
- **Pruebas:** `apps/web/test/purchases.test.tsx`, `inventory-stock-views.test.tsx`, `product-import-export.test.tsx`, `third-parties.test.tsx`, `inventory-adjustment.test.tsx`, `tests/e2e/specs/purchase.spec.ts`, `tests/e2e/specs/redesign-phase3.spec.ts`

## Pruebas ejecutadas

### En código

| Comprobación | Resultado |
|---|---|
| `pnpm typecheck` | 0 errores |
| `pnpm lint` | 0 errores; advertencias iguales a la línea base (web 40, api 98) |
| Pruebas web (`vitest`) | 56 archivos, 405 pruebas, todas pasan |
| Build web | correcto |

En la primera corrida de las pruebas web falló una prueba del historial de compras. La expresión esperaba «$80.000» y el formato común escribe «$ 80.000»; se ajustó la expectativa.

Pruebas nuevas:

- recepción con proveedor y comprobante visibles en todos los pasos;
- revisión con lote y efecto;
- error del servidor que conserva los datos y permite volver a corregir;
- devolución al proveedor: lo ya devuelto, lo devolvible, el rechazo de una cantidad mayor y el efecto;
- «Actualizar existencias» tras un rechazo por existencias, sin perder lo escrito;
- vista por producto con «Ver lotes» y enlaces al Kardex;
- Kardex con producto y documento tomados de la URL y etiquetas en español;
- terceros que recuperan pestaña y búsqueda desde la URL.

### En navegador (Playwright, Chromium, `APP_ENVIRONMENT=pruebas`)

**Suite E2E completa:** 17 pasan y 5 omitidas (las mismas de antes).

**`redesign-phase3.spec.ts`, el criterio de aceptación.** La prueba usa datos que crea la propia corrida: un producto `LOT_EXPIRY` con la presentación «Caja x 10».

1. Se recibe una compra con dos líneas:
   - 2 cajas en un lote (20 unidades base);
   - 5 unidades en otro lote.
2. La revisión muestra «Entran 25 unidades base» y los lotes quedan en 20 y 5.
3. El historial muestra la compra como «Recibida».
4. «Ver movimientos» abre el Kardex filtrado por la compra, con dos «Entrada por compra» y sin códigos crudos.
5. Desde el detalle se prepara una devolución de 1 caja. El efecto dice «Salen 10 unidades base del lote …» y menciona la cuenta por pagar.
6. Al confirmar, el lote queda en 10.

**Capturas** en `docs/rediseno/fase-3/`: `recepcion-revision-1440.png`, `kardex-compra-1440.png`, `devolucion-proveedor-1440.png`.

La captura de la devolución mostró la columna de cantidad cortada. Se amplió el diálogo y la corrida siguiente lo confirma.

No se verificó en el ambiente Vida Sana (sin acceso).

## Decisiones

- **No se agregó un endpoint de vista previa de impuestos de compra.** La revisión muestra el subtotal y explica el cálculo posterior. Agregarlo sería un cambio de servidor fuera de lo pedido.
- **Lo devolvible se calcula en la web con las mismas reglas del servidor.** El servidor sigue siendo la autoridad: valida con bloqueo del lote dentro de la transacción.
- **El detalle de compra sigue siendo un diálogo.** Se amplió con acciones; no se creó una página nueva.

## Pendientes

- **Referencia de compras en el Kardex.** Los movimientos de compra se guardan con el id interno de la compra como referencia, y el Kardex muestra ese id en lugar del número de factura. Mostrar la factura requiere que el API la devuelva con el movimiento. Queda para la fase 4 (documentos).
- **Títulos sin alinear al menú.** Los títulos de Categorías, Unidades y Terceros no coinciden todavía con el menú; es un ajuste cosmético.
- **Decisiones abiertas de fases anteriores:** D1 (corrección atómica de documentos de tesorería), D3 (anulación de notas débito) y el membrete en `PrintableDocumentLayout`, todas para la fase 4.

## Siguiente paso

Fase 4: tesorería, contabilidad, documentos e impresión.

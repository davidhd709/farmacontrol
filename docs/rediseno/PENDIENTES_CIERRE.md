# Rediseño: cierre de pendientes de las fases 1 a 4

Fecha: 2026-11-15. Recoge lo que quedó abierto en `FASE_1_CIERRE.md` a `FASE_4_CIERRE.md` y cómo se resolvió.

## 1. Ya resueltos en fases anteriores

Estos pendientes se resolvieron en su fase y aquí solo se confirma su estado.

| Pendiente | Dónde se resolvió |
|---|---|
| «Cargando cliente…» permanente en el POS | Fase 2 |
| D5: consumidor final protegido desde Terceros | Fase 2 |
| Tirilla de venta con dirección y nombre fijos | Fase 2: usa el membrete real |
| D1: corrección atómica de recibos y egresos | Fase 4 |
| Motivo y enlace al origen de un documento automático | Fase 4 |
| Plantillas de compra y nota débito sin conectar | Fase 4 |
| Membrete con datos ficticios en `PrintableDocumentLayout` | Fase 4 |
| Número de factura de compra en el Kardex | Fase 4 |

## 2. Resueltos en este cierre

### Recibos y egresos: filtro por estado y exportación

- **Filtro por estado.** `GET /api/v1/treasury/documents` acepta `status=VIGENTE|ANULADO`; un valor distinto responde 400.
- **Exportación.** `GET /api/v1/treasury/documents/export` recibe los mismos filtros del listado (tipo, estado, fechas y búsqueda) y devuelve un libro de Excel con el mismo orden.
  - Valida el permiso por tipo igual que el listado: el contable ve ambos tipos, y tesorería solo el tipo que puede registrar.
  - Exporta hasta 5.000 documentos. Si la consulta tiene más, responde 400 y pide acotar los filtros.
  - El valor del documento se escribe como número para que Excel pueda sumarlo. El número sale del decimal de la base, redondeado a centavos, y no se usa en ningún cálculo del sistema.
- **Web.**
  - El estado se elige con el selector «Estado» y queda en la URL (`?estado=`), igual que las fechas y la búsqueda.
  - El botón «Exportar a Excel (n)» indica cuántos documentos va a exportar y se deshabilita cuando no hay ninguno.
  - Si el servidor rechaza la exportación, la pantalla muestra su motivo.

### «Ir a…» abre el documento exacto

- **Documento de origen.** Cada recibo o egreso automático trae ahora `sourceDocument`: el documento que lo emitió. Puede ser la nota crédito, la cuenta por cobrar o por pagar del abono revertido, o el gasto. La restricción del detalle enlaza directamente a ese documento, por ejemplo «Abrir el gasto G-0012».
- **Apertura desde la URL.** Cada pantalla de origen abre el documento que recibe en la URL, y el parámetro se quita al cerrar el detalle:

  | Pantalla | Parámetro | Qué abre |
  |---|---|---|
  | Notas crédito | `?nota=NC-…` | La nota pedida. Si no existe, la pantalla lo avisa. |
  | Cuentas por cobrar | `?cxc=<id>` | Los abonos de la cuenta |
  | Cuentas por pagar | `?cxp=<id>` | Los pagos de la cuenta, sin tener que elegir proveedor |
  | Gastos | `?gasto=<id>` | El detalle y el historial del gasto |

- **Corrección del tercero en las reversiones.** Antes, las reversiones de abonos de cartera y de pagos a proveedor salían sin tercero, porque se buscaban como si su referencia fuera la cuenta y no el abono o pago. Ahora identifican al cliente o al proveedor.
- **Enlaces del Libro Diario.** El documento de origen de un asiento enlazaba con `?buscar=`, un parámetro que ninguna pantalla leía. Ahora cada enlace lleva al documento:

  | Origen del asiento | Destino del enlace |
  |---|---|
  | Venta | Su detalle |
  | Nota crédito | La nota |
  | Gasto | El gasto |
  | Compra | El historial de compras, filtrado por su factura (`?q=`) |
  | Recibo o egreso | Tesorería, filtrada por su número |

### PDF de la nota crédito, el gasto y el asiento

La E2E `redesign-phase4.spec.ts` genera los tres PDF desde el navegador. Están en `docs/rediseno/fase-4/` como `nota-credito.pdf`, `gasto.pdf` y `asiento-contable.pdf`.

La nota crédito se abre siguiendo el enlace «Abrir la nota crédito» desde un egreso automático.

Al revisar los PDF aparecieron defectos, que se corrigieron:

| Documento | Defecto | Corrección |
|---|---|---|
| Asiento | La columna «Crédito» quedaba cortada fuera de la hoja | Anchos fijos de tabla |
| Asiento | El origen salía como código interno (`EXPENSE`) | Sale en palabras (`Causación · G-…`), con las mismas etiquetas del Libro Diario |
| Asiento | La fecha de contabilización salía en formato ISO | Fecha y hora legibles |
| Gasto | El proveedor se repetía entre paréntesis cuando coincidía con el beneficiario | Se muestra una sola vez |
| Gasto | El medio de pago salía como código (`CREDITO`) | Sale en palabras |
| Gasto | El vencimiento salía sin formato | Fecha con formato |

### Títulos alineados al menú

Los títulos de tres pantallas cambiaron para coincidir con el menú:

| Antes | Ahora |
|---|---|
| «Categorías de Productos» | «Categorías» |
| «Unidades de Medida y Presentaciones» | «Unidades de medida» |
| «Directorio de Terceros» | «Clientes, proveedores y otros» |

### Formato

Se formatearon con Prettier, en un commit aparte y sin cambios de comportamiento:

- los archivos que los cierres de fase dejaron pendientes: plantillas de impresión, `PrintableDocumentLayout.tsx`, `PurchaseDetailDialog.tsx`, `treasury-vouchers.service.ts` y `PosPaymentDialog.tsx`;
- los archivos tocados en este cierre.

### Decisión D3: anulación de notas débito

**Decisión del 2026-11-15: las notas débito a proveedor no se anulan.** Un error se compensa con un documento nuevo, por ejemplo una compra o un ajuste. No cambia el servidor ni la contabilidad. La pantalla sigue indicando que la nota no admite anulación.

## 3. Abiertos

- **Formato del resto del repositorio.** 211 archivos no cumplen Prettier y el CI no lo verifica. Reformatearlos todos es un cambio masivo que conviene hacer en un commit propio, junto con un paso `prettier --check` en el CI.
- **D4: `APP_ENVIRONMENT=pruebas` en el servidor de pruebas.** Es una tarea de operación y queda a cargo de quien administra el VPS.
- **Avisos de lint previos:** web 36, api 98, worker 3, database 3. Quedan fuera de alcance y no cambiaron.
- **`StatusChip`, `formatCop` y encabezado común en el resto de pantallas.** Se aplican pantalla por pantalla, a medida que cada una se rediseñe.
- **Exportaciones duplicadas.** Contabilidad y productos tienen cada uno su propia función de descarga de archivos. La nueva `downloadFile` del cliente HTTP podría reemplazarlas en una refactorización aparte.

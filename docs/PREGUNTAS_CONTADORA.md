# Preguntas para la contadora — FarmaControl

**Para:** Thony Soto
**De:** Henry David Tordecilla López
**Fecha:** octubre de 2026

Thony, estas son las decisiones contables y tributarias que necesito para terminar el sistema. En cada pregunta va lo que hace hoy el sistema, para que sepas desde dónde partimos. Mientras no respondas, el sistema sigue con la opción más conservadora y no inventa reglas.

Las preguntas están ordenadas por urgencia. Las del bloque A afectan cifras que ya están saliendo en los estados financieros.

---

## A. Urgentes: afectan las cifras que ya produce el sistema

### A1. Método de costo del inventario

**Hoy:** cada compra entra al inventario (1435) por su costo real de factura. Pero cuando se vende, el costo de venta (613538) se calcula con un **costo fijo por producto** que se escribe a mano en el catálogo y que las compras no actualizan. Con el tiempo, la cuenta de inventarios deja de coincidir con las existencias reales valorizadas.

1. ¿Qué método de valuación usamos: **promedio ponderado**, **costo identificado por lote** (cada lote con el costo de su factura) u otro?
2. Si es promedio ponderado, ¿se recalcula con cada compra o por período?
3. ¿Las bonificaciones o unidades sin costo que traen algunos proveedores entran a costo cero o se prorratean?
4. Para el inventario que ya existe, ¿con qué costo inicial lo cargamos: el último de compra, un promedio o uno que tú nos des?

> **Respondidas el 25 de octubre de 2026 (preguntas 1, 2 y 4), por decisión del propietario.** Quedan en [ADR-005](adr/ADR-005-politica-de-costeo-del-inventario.md):
>
> - Promedio ponderado móvil, que se recalcula con cada entrada.
> - Inventario existente al último costo de compra; si no tiene compras, al costo del catálogo.
> - Devoluciones de clientes al costo con que salieron.
>
> Thony, si no estás de acuerdo con alguna, avísanos antes de cargar la apertura. **Sigue pendiente la pregunta 3 (bonificaciones)**, y también la fecha de corte para cargar el inventario existente.

### A2. Ventas gravadas y excluidas: las cuentas parecen invertidas

**Hoy:** como todavía no aplicamos IVA en ventas, **todas** las ventas van a 413595 "Venta de otros productos", incluidos los medicamentos. La cuenta 413538 "Venta productos farmacéuticos y medicinales" quedó para las ventas gravadas.

En Colombia la mayoría de medicamentos son excluidos de IVA y los productos de tienda (aseo, cosméticos, dulces) suelen ser gravados al 19 %, así que creo que el mapeo está al revés.

5. ¿A qué cuenta deben ir las ventas de **medicamentos** (excluidos)?
6. ¿A qué cuenta deben ir las ventas de **otros productos** gravados?
7. ¿Separamos ventas por tarifa (19 %, 5 %, excluido, exento) en subcuentas distintas, o basta con gravado/no gravado?

### A3. Descuentos en ventas

**Hoy:** la venta se registra por su valor bruto y el descuento va a 417506 "Descuentos condicionados".

8. Los descuentos que da el cajero en el mostrador son **comerciales** (en la factura, sin condición). ¿Deben ir a 417506 "condicionados" o a otra subcuenta de 4175? En el documento del módulo contable aparecía 413595 como "descuentos comerciales". ¿Cuál es la correcta?
9. Cuando un cliente devuelve un producto que se vendió con descuento, hoy la devolución se registra **neta del descuento** en 417507 "Devoluciones en ventas", sin reversar la parte proporcional del descuento. ¿Está bien así, o debemos reversar el descuento proporcional?

### A4. Anticipo del impuesto SIMPLE

**Hoy:** el propósito "anticipo impuesto SIMPLE" está mapeado a 13551801, que en el PUC cargado se llama "Retención ICA / Anticipo impuestos".

10. ¿Es la cuenta correcta para los anticipos bimestrales del SIMPLE, o se debe usar 135518 u otra subcuenta?

---

## B. Necesarias antes del primer cierre

### B1. Cuentas que faltan por definir

Estos conceptos no tienen cuenta asignada, así que el sistema no puede registrarlos:

| Concepto | Cuenta sugerida | Pregunta |
|---|---|---|
| Utilidades acumuladas (cierre anual) | 370505 | 11. ¿Confirmas 370505? |
| Pérdidas acumuladas (cierre anual) | 371005 | 12. ¿Confirmas 371005? |
| IVA descontable común (prorrateo) | — | 13. ¿Qué cuenta usamos? |
| IVA no descontable (mayor costo o gasto) | — | 14. ¿Va al costo del inventario, a un gasto o a una cuenta aparte? |

15. El inventario está mapeado a **1435** a nivel de grupo. ¿Usamos una subcuenta auxiliar (por ejemplo 143501 o 14350101) o separamos medicamentos de otros productos?

### B2. IVA en compras y retenciones

**Hoy:** la compra se registra completa contra inventario y proveedores. **No se separa el IVA descontable** de la factura del proveedor y **no se calculan retenciones**.

16. ¿Las compras de productos gravados (no medicamentos) deben separar el IVA descontable en 240810 (o la subcuenta que indiques)?
17. Como contribuyente del SIMPLE, ¿la farmacia practica alguna retención a sus proveedores (en la fuente, reteIVA, reteICA)? El documento del módulo dice que la reteIVA debe quedar "disponible y parametrizable". ¿Se usa hoy en algún caso real?
18. ¿Algún proveedor practica retención a la farmacia que debamos registrar al pagarle?

### B3. Tarifas de IVA por producto

19. ¿Puedes enviarnos (o validar) la lista de productos gravados con su tarifa? Si es más fácil, basta una regla por tipo de producto (por ejemplo: "todo lo que no es medicamento, 19 %") y las excepciones.
20. El precio de vitrina incluye IVA. ¿Confirmas que la base se calcula hacia atrás (precio ÷ 1,19) y se redondea al peso?

### B4. Operaciones que todavía no generan asiento

Estas operaciones mueven inventario o dinero en el sistema, pero **no generan asiento contable**:

21. **Ajustes de inventario** (faltantes y sobrantes en conteos): ¿contra qué cuentas? ¿Faltantes a gasto (5195?) y sobrantes a ingreso (4250?)?
22. **Bajas por vencimiento** (medicamento vencido que se destruye): ¿qué cuenta de gasto o pérdida?
23. **Ingresos y egresos manuales de caja** (por ejemplo un préstamo del dueño o un retiro): ¿cómo se registran? ¿Debe pedirse siempre la contrapartida al usuario?
24. **Movimientos bancarios manuales**: consignaciones de efectivo de caja al banco, comisiones, 4×1000, intereses. ¿Qué cuentas?
25. **Devolución de mercancía al proveedor** y **descuentos por pronto pago obtenidos** (421005): ¿cómo los registramos? (Hoy no existe la devolución a proveedor; ver C5.)

---

## C. Decisiones de operación con impacto contable

### C1. Documentos legales y numeración

**Hoy:** la factura de venta se imprime sin datos legales. Los recibos de caja, comprobantes de egreso y notas contables usan los prefijos provisionales `RC-`, `CE-` y `NTC-`.

26. ¿La farmacia factura electrónicamente ante la DIAN o usa documento equivalente POS? ¿Con qué proveedor tecnológico?
27. ¿Qué datos debe llevar el comprobante (resolución, rango autorizado, prefijo, NIT, régimen, leyendas)?
28. ¿Los prefijos `RC-`, `CE-` y `NTC-` están bien, o usas otros (por ejemplo los de Wofice) para mantener la continuidad?
29. Para la numeración: el sistema garantiza consecutivos **sin saltos**. ¿Hay algún caso en que un número anulado deba quedar visible como anulado en lugar de no consumirse?

### C2. Caja

30. ¿Se maneja **una sola caja** o varias (por ejemplo, una por turno o por cajero)?
31. ¿Se hace **apertura con base** (fondo de cambio) y **arqueo al cierre**? ¿Qué diferencia se tolera y a qué cuenta va un faltante o sobrante de caja?

### C3. Notas crédito, devoluciones y saldos a favor

32. Si un cliente devuelve productos de una venta **a crédito que todavía no ha pagado**, ¿se le puede devolver efectivo? Hoy el sistema lo permite.
33. Si la devolución supera lo que el cliente debe, ¿queda **saldo a favor** del cliente (anticipo, 2805) o se le devuelve el dinero? Hoy el sistema lo rechaza.
34. ¿Quién puede emitir notas crédito a clientes y notas débito a proveedores? Hoy: administrador y supervisor.

### C4. Crédito a clientes

35. ¿Hay **cupo** máximo de crédito por cliente y **plazo**? Hoy el sistema fija 30 días a toda venta a crédito y la permite incluso a "Consumidor Final"; por eso el POS todavía no la ofrece. ¿Qué plazo usamos, se exige un cliente identificado y se bloquea la venta si el cliente está en mora?
36. En la cartera por edades acordamos 0-30, 31-60, 61-90 y más de 90 días. El sistema muestra además una franja **"Corriente"** (facturas que aún no vencen). ¿La dejamos o la quitamos?

### C5. Devolución a proveedores

37. Cuando se devuelve mercancía próxima a vencer (el aviso de 110-120 días), ¿el proveedor emite nota crédito, cambia el producto o descuenta de la siguiente factura? ¿Cómo debe quedar en el sistema?

### C6. Quién lleva la contabilidad en el sistema

38. Hoy solo el **administrador** puede ver y registrar contabilidad (libro diario, notas, cierres, plan de cuentas). ¿Tú vas a entrar al sistema con tu propio usuario? Si es así, ¿qué debe poder hacer un rol de **Contabilidad**: solo consultar, o también registrar notas contables, bloquear documentos y hacer el cierre anual?

### C7. Operación sin contabilidad configurada

39. Si falta alguna cuenta por configurar, hoy **la venta se registra y el asiento se omite** (queda un aviso en el registro técnico). ¿Prefieres que la venta se **bloquee** hasta configurar la cuenta, o que siga así?

---

## D. Validaciones en el ambiente de pruebas

Te voy a pedir que revises estas pantallas con datos de prueba y me confirmes si están bien:

40. **Naturaleza de las cuentas:** las correctoras del activo (depreciación, provisiones) y las que el PUC trae marcadas `(DB)` o `(CR)`. ¿Alguna quedó con la naturaleza equivocada?
41. **Cierre anual:** la vista previa del asiento al 31 de diciembre que traslada el resultado a 3705 o 3710. ¿Cuadra con lo que harías en Wofice?
42. **Bloqueo de documentos:** ¿el corte por fecha funciona como lo usas (mensual)?
43. **Recibos de caja y comprobantes de egreso:** ¿el formato y la información son suficientes?
44. **Estado de resultados y balance:** con un mes de prueba, ¿las cifras te cuadran?

---

## E. Para el arranque

45. ¿Desde qué fecha arranca la contabilidad en el sistema (por ejemplo, 1 de enero de 2027)?
46. ¿Nos envías los **saldos iniciales** a esa fecha (balance de prueba por tercero) para cargarlos como nota contable de apertura?
47. ¿Quiénes participan en la prueba de aceptación (UAT), cuántos días dura y qué criterio usamos para darla por aprobada?

---

Gracias. Con las respuestas del bloque A y B puedo dejar la contabilidad automática lista para el arranque. Las del bloque C se pueden ir resolviendo durante la prueba de aceptación.

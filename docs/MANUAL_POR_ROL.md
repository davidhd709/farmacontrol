# Manual de uso por rol — FarmaControl

Este manual explica, para cada persona de la farmacia, qué puede hacer en el sistema y cómo hacer sus tareas diarias. Los nombres en **negrita** son los que aparecen en pantalla.

Lo que no le corresponde a un rol no aparece en su menú. Si alguien entra por una dirección directa, ve **Sin permiso**. El sistema también lo bloquea por dentro, aunque la pantalla se abriera.

## Para todos

### Entrar y salir

1. Escriba su **Usuario** y **Contraseña** y pulse **Ingresar**.
2. Después de varios intentos fallidos, el ingreso se bloquea unos minutos.
3. Para salir, pulse **Cerrar Sesión** (arriba a la derecha). No comparta su usuario: cada venta, ajuste y pago queda a su nombre.
4. Si la sesión vence mientras trabaja, el sistema lo devuelve a la pantalla de ingreso. Al entrar de nuevo, vuelve a la página donde estaba.

### Panel principal

Muestra, según su rol, el efectivo en caja, el saldo en bancos, la cartera pendiente, las ventas de hoy y las alertas de vencimiento, cada uno por separado. Si un dato no se pudo consultar, aparece **No disponible** con la opción de reintentar; nunca se muestra $0 en su lugar. Cada tarjeta lleva a su listado.

### Fechas

Todas las fechas son las de Colombia. Los filtros rápidos (**Hoy**, **Este mes**, **Mes anterior**, **Año a la fecha**) están en todos los reportes.

---

## Cajero

**Puede:** vender en el POS, consultar el historial de ventas, buscar y crear clientes, consultar existencias, y registrar movimientos de caja.
**No puede:** anular ventas, hacer notas crédito, recibir compras, ver contabilidad ni reportes.

### Hacer una venta

1. Abra **Punto de Venta (POS)** o pulse **Nueva Venta**, arriba.
2. En **Buscar producto por nombre, código o escáner...** escriba al menos dos letras o pase el lector. Con el lector, el producto se agrega solo al recibir el Enter.
3. Si eligió con las flechas, Enter agrega el producto marcado.
4. Cada producto entra con su presentación por defecto. Puede cambiarla (unidad, blíster, caja) y la cantidad. Si pide más de lo que hay, el sistema lo explica y no deja la cantidad.
5. Un producto marcado **No vendible: regularizar en catálogo** no se puede vender hasta que lo corrijan en el catálogo.
6. **Cliente:** por defecto la venta es a **Consumidor Final**. Para facturar a una persona, búsquela en **Buscar cliente existente** o pulse **Crear cliente nuevo**.
7. Pulse **Cobrar y Liquidar** (o F2).
8. En la ventana de cobro revise la **Asignación FEFO automática**: qué lote se usará y cuándo vence. El sistema siempre usa primero el lote que vence antes. Si falta mercancía, lo avisa y no deja confirmar.
9. Elija **Efectivo**, escriba el **Efectivo Recibido** y verifique el cambio. Si es **Transferencia**, elija la **Cuenta que recibe**.
10. Confirme. Aparece el **Comprobante de venta** para imprimir.

Si se cae la conexión al confirmar, vuelva a confirmar: el sistema reconoce el intento y no registra la venta dos veces.

### Reimprimir un comprobante

**Historial de Ventas** › busque por número o fecha › **Comprobante**.

---

## Supervisor

Hace todo lo del cajero y, además:

- **Anular una venta:** en **Historial de Ventas**, use el botón de anular de la venta, escriba el **Motivo de la anulación** y confirme. Las unidades vuelven a sus lotes y el dinero sale de caja o del banco. No se puede anular una venta que ya tiene nota crédito ni una venta a crédito con abonos.
- **Nota crédito (devolución parcial):** en **Historial de Ventas**, use el botón de devolución, indique la cantidad de cada producto, el **Motivo de la devolución** y la **Forma de reembolso**. Si las unidades regresan en buen estado, marque **Reintegrar unidades al inventario (lote original)**.
- **Precios y descuentos:** el POS todavía no permite aplicar descuentos ni cambiar el precio de una línea. Falta definir el tope, quién autoriza y el motivo.
- Catálogo, inventario, compras, terceros, cartera, cuentas por pagar, gastos, reportes y auditoría.

---

## Inventario

**Puede:** recibir compras, consultar y ajustar existencias, ver el kardex, y atender alertas de vencimiento.

### Recibir una compra

1. **Recepción de Compras** › elija el **Proveedor** y escriba el **Número de Factura / Comprobante** y la fecha.
2. Por cada producto: **Producto**, **Presentación / Empaque Recibido**, **Número de Lote**, **Fecha de Vencimiento**, **Cantidad** y **Costo**. Use **Agregar Otra Línea** para más productos.
3. El sistema no acepta una fecha de vencimiento de hoy o anterior, ni una cantidad que no dé unidades enteras.
4. Pulse **Confirmar Recepción de Compra** y luego **Sí, Confirmar Recepción**. Los lotes quedan disponibles para vender.

Una misma factura de un proveedor no se puede registrar dos veces. Si el lote ya existe con otra fecha de vencimiento, el sistema lo rechaza para que lo revise.

### Ajustar existencias

**Lotes y Stock** › **Ajuste Manual** › **Producto**, **Lote Específico**, **Tipo de Ajuste**, **Cantidad a Ajustar (en unidades base)** y **Motivo Justificado (Obligatorio)**. El ajuste queda en el kardex con su nombre y no se puede borrar. Para corregir un error, haga el ajuste contrario.

### Vencimientos

**Alertas de Vencimiento** muestra los lotes por severidad: vencido, crítico (hasta 30 días), alerta (31 a 60) y próximo (61 a 90). Cada fila lleva a los movimientos de su lote. El reporte **Devoluciones a proveedor** indica qué lotes avisar al proveedor (entre 110 y 120 días antes de vencer).

---

## Compras

**Puede:** recibir compras, gestionar proveedores y pagar cuentas por pagar.

### Pagar a un proveedor

**Cuentas por Pagar** › **Pagar** en la cuenta pendiente › escriba el monto (no puede superar el saldo), el medio de pago y, si es transferencia, la cuenta › **Pagar Proveedor** › **Confirmar y Pagar**. El pago genera su comprobante de egreso.

---

## Cartera

**Puede:** consultar clientes y cuentas por cobrar, y registrar abonos.

### Registrar un abono

**Cuentas por Cobrar** › **Abonar** en la cuenta del cliente › **Monto del abono** (no puede superar el saldo), **Método de pago** y, si es transferencia, la **Cuenta que recibe** › **Registrar Abono** › **Confirmar y Abonar**. El abono genera su recibo de caja.

La cartera por edades muestra 0-30, 31-60, 61-90 y más de 90 días.

---

## Administrador

Tiene todos los permisos. Además de lo anterior:

- **Usuarios** (Configuración › Gestión de Usuarios): crear usuarios, asignar roles y desactivarlos. Un usuario desactivado no puede entrar, pero su historia se conserva.
- **Copias de Seguridad:** el sistema hace una copia diaria cifrada fuera del servidor. **Crear Respaldo Ahora** genera una adicional (por ejemplo, antes de una actualización).
- **Auditoría y Trazabilidad:** quién hizo qué y cuándo.
- **Contabilidad:** plan de cuentas, propósitos contables, libro diario, notas contables, balance de comprobación, estado de resultados, balance general, auxiliares, bloqueo de documentos y cierre anual. Hoy solo el administrador tiene estos permisos: falta definir si habrá un rol de Contabilidad.

### Caja y bancos

- **Control de Caja:** saldo de efectivo y movimientos con débito, crédito y saldo. **+ Registrar Movimiento** sirve para ingresos o egresos manuales con motivo.
- **Tesorería y Bancos:** cuentas bancarias, creadas desde su subcuenta del PUC, y sus movimientos.
- **Recibos de Caja** y **Comprobantes de Egreso:** cada entrada y salida de dinero tiene su documento numerado.

### Causación de gastos

**Causación de Gastos:** registrar un gasto pagado de inmediato (efectivo o transferencia) o a crédito, y pagarlo después. Si se repite el envío, no queda duplicado.

---

## Lo que todavía no hace el sistema

Mientras el cliente no tome estas decisiones, no están disponibles:

- Venta a crédito desde el POS, cupos y plazos de crédito.
- Descuentos y cambio de precio en el POS.
- IVA en ventas: hoy toda venta se registra sin IVA.
- Turnos de caja con apertura, arqueo y cierre.
- Promociones, devoluciones a proveedor, saldos a favor de clientes y recordatorios de pago.
- Datos legales y factura electrónica en el comprobante.

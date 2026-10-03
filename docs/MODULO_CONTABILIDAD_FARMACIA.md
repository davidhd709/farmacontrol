                                                                                                                                                                                                          # Módulo de Contabilidad para Farmacia

## 1. Propósito del módulo

Este documento define la estructura funcional y técnica del módulo de contabilidad para el sistema de gestión de una farmacia en Colombia.

El objetivo es que la contabilidad no funcione como un módulo aislado donde el usuario tenga que volver a registrar manualmente lo que ya ocurrió en ventas, compras, inventario, cartera o caja. La idea es que las operaciones del sistema generen automáticamente sus efectos financieros y contables.

El módulo se desarrollará inicialmente en cinco bloques:

1. Tesorería.
2. Cartera.
3. Contabilidad automática.
4. Gastos.
5. Estados financieros.

El alcance inicial busca construir una base contable confiable, trazable e incluye una configuración tributaria parametrizable. La conciliación bancaria automática, activos fijos, declaraciones, facturación electrónica DIAN y otros procesos avanzados permanecen para fases posteriores.

---

## 2. Principios generales

### 2.1 Integración con el resto del sistema

El módulo contable debe integrarse con:

- Ventas / POS.
- Compras.
- Inventario.
- Kardex.
- Lotes.
- FEFO.
- Clientes.
- Proveedores.
- Cuentas por cobrar.
- Cuentas por pagar.
- Descuentos.
- Promociones.
- Medios de pago.
- Usuarios y roles.

El usuario no debe duplicar información.

Ejemplo: si se registra una venta en efectivo, el sistema debe registrar la venta, descontar inventario, calcular el costo real de lo vendido, aumentar Caja, reconocer el ingreso, reconocer el costo de venta y crear el asiento contable correspondiente.

### 2.2 Contabilidad por causación

El sistema debe distinguir entre:

- reconocer una obligación;
- pagar una obligación;
- reconocer un ingreso;
- recibir efectivamente el dinero.

Ejemplo: una factura de energía por $350.000 puede registrarse hoy como gasto aunque todavía no se haya pagado. En ese momento aumenta el gasto y aumenta la cuenta por pagar. Cuando posteriormente se pague, disminuye Caja o Banco y disminuye la cuenta por pagar. No se debe registrar el gasto nuevamente.

### 2.3 Trazabilidad

Toda operación financiera debe poder rastrearse hasta su documento de origen.

Ejemplo:

Asiento contable → Venta → Detalle de venta → Producto → Presentación → Lote → Movimiento de Kardex.

Y también en sentido contrario:

Venta → Movimiento contable generado.

### 2.4 No eliminar ni sobrescribir historia

Las operaciones confirmadas no deben modificarse libremente. Los errores deben manejarse mediante:

- anulación;
- reversión;
- devolución;
- nota de ajuste;
- movimiento compensatorio.

La información original debe permanecer disponible para auditoría.

### 2.5 Atomicidad

Las operaciones críticas deben ejecutarse dentro de transacciones. Si una venta genera ingreso, descuenta inventario, consume lotes, genera costo de venta, registra pago y genera asiento contable, y alguna de esas operaciones falla, no debe quedar el sistema parcialmente actualizado.

---

## 3. Arquitectura funcional general

```text
VENTAS ────────────────┐
COMPRAS ───────────────┤
PAGOS CLIENTES ────────┤
PAGOS PROVEEDORES ─────┤
GASTOS ────────────────┤
AJUSTES INVENTARIO ────┤
DEVOLUCIONES ──────────┤
                       ▼
                MOTOR CONTABLE
                       │
                       ▼
              ASIENTOS / MOVIMIENTOS
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
        CAJA         BANCOS       CARTERA
          │            │            │
          └────────────┼────────────┘
                       ▼
              ESTADOS FINANCIEROS
```

---

# BLOQUE 1 — TESORERÍA

## 4. Objetivo

Gestionar correctamente el dinero disponible del negocio, separando efectivo físico y dinero en cuentas bancarias o medios equivalentes.

Regla principal: **Caja no debe mezclarse con Bancos.**

## 5. Caja

Caja representa únicamente dinero físico.

Entradas:
- ventas en efectivo;
- cobros de cartera en efectivo;
- ingresos manuales autorizados;
- reintegros;
- otros ingresos físicos.

Salidas:
- pagos en efectivo;
- gastos pagados en efectivo;
- retiros autorizados;
- devoluciones de dinero;
- otros egresos.

### Estructura visual

| Fecha | Documento | Concepto | Entrada | Salida | Saldo |
|---|---|---|---:|---:|---:|

Para usuarios contables puede existir una vista con Débito / Crédito / Saldo.

### Reglas

- Una venta en efectivo aumenta Caja.
- Una transferencia no aumenta Caja.
- Una venta a crédito no aumenta Caja.
- Un gasto en efectivo reduce Caja.
- Un pago de cartera recibido en efectivo aumenta Caja.
- Un pago a proveedor realizado en efectivo reduce Caja.
- Los movimientos no deben borrarse una vez confirmados.
- Una anulación debe generar reversión o movimiento compensatorio.
- Todo movimiento debe tener usuario, fecha y origen.

## 6. Bancos

Debe existir un módulo separado para transferencias y movimientos bancarios.

### Catálogo de cuentas

Ejemplo:

```text
Bancolombia
Cuenta de ahorros
Número: ****1234

Davivienda
Cuenta corriente
Número: ****5678

Nequi
Número asociado
****9012
```

Datos mínimos:

- id;
- nombre del banco o medio;
- tipo de cuenta;
- número o identificador;
- nombre descriptivo;
- saldo inicial;
- activa/inactiva;
- fecha de creación;
- usuario que creó.

### Movimientos bancarios

Cada movimiento debe registrar:

- fecha;
- cuenta;
- documento;
- concepto;
- entrada;
- salida;
- saldo resultante;
- usuario;
- operación de origen;
- referencia externa opcional.

Ejemplo:

Venta de $80.000 por transferencia a Bancolombia:

```text
Caja: no cambia
Bancolombia: +$80.000
```

## 7. Medios de pago

Inicialmente:

- efectivo;
- transferencia;
- crédito.

Posteriormente:

- tarjeta;
- QR;
- billeteras;
- otros.

Regla conceptual:

```text
EFECTIVO -> CAJA
TRANSFERENCIA -> BANCO
CREDITO -> CUENTA_POR_COBRAR
```

## 8. Arqueo y cierre de caja

Debe existir:

- apertura;
- saldo inicial;
- movimientos del turno;
- cierre;
- efectivo esperado;
- efectivo contado;
- diferencia;
- observación;
- usuario responsable.

La diferencia debe quedar auditada.

## 9. Filtros de Tesorería

Caja y Bancos deben permitir filtrar por:

- fecha desde;
- fecha hasta;
- tipo de movimiento;
- usuario;
- medio de pago;
- cuenta bancaria;
- documento;
- origen.

---

# BLOQUE 2 — CARTERA

## 10. Objetivo

Gestionar:

- cuentas por cobrar;
- cuentas por pagar;
- abonos;
- saldos;
- vencimientos;
- estados.

## 11. Cuentas por cobrar

Se genera cuando una venta no se paga completamente.

Ejemplo:

```text
Venta:              $100.000
Pago inicial:        $30.000
Saldo pendiente:     $70.000
```

Datos mínimos:

- cliente;
- documento;
- venta de origen;
- fecha;
- fecha de vencimiento;
- valor original;
- valor pagado;
- saldo;
- estado;
- observaciones.

Estados:

- PENDIENTE;
- PARCIAL;
- PAGADA;
- VENCIDA;
- ANULADA.

### Abonos

Cada abono debe registrar:

- fecha;
- monto;
- medio de pago;
- Caja o Banco afectado;
- usuario;
- observación;
- comprobante.

Un abono no genera una nueva venta.

### Cartera por edades

- 0–30 días;
- 31–60 días;
- 61–90 días;
- más de 90 días.

## 12. Cuentas por pagar

Puede originarse por:

- compra a crédito;
- gasto pendiente;
- servicio pendiente;
- obligación registrada manualmente.

Ejemplo:

```text
Proveedor: Copidrogas
Factura: CP-45879
Total: $1.500.000
Crédito: 30 días
```

Al confirmar:

```text
Inventario: +$1.500.000
Cuenta por pagar: +$1.500.000
```

Estados:

- PENDIENTE;
- PARCIAL;
- PAGADA;
- VENCIDA;
- ANULADA.

Reglas:

- una obligación puede recibir varios abonos;
- cada abono debe indicar de dónde salió el dinero;
- el pago no modifica el costo original;
- registrar una compra y pagarla son eventos distintos;
- las anulaciones deben dejar trazabilidad.

---

# BLOQUE 3 — CONTABILIDAD AUTOMÁTICA

## 13. Objetivo

Crear un motor central que traduzca operaciones del sistema en asientos contables. La lógica no debe duplicarse en cada módulo.

## 14. Motor contable

Debe existir un servicio central equivalente a:

```text
AccountingEngine
```

Eventos:

```text
SALE_CONFIRMED
PURCHASE_RECEIVED
CUSTOMER_PAYMENT
SUPPLIER_PAYMENT
EXPENSE_CREATED
EXPENSE_PAID
SALE_REFUNDED
PURCHASE_RETURNED
INVENTORY_ADJUSTMENT
CASH_MOVEMENT
BANK_MOVEMENT
```

## 15. Plan de cuentas

Debe ser configurable, jerárquico y reducido.

Ejemplo conceptual:

```text
1 ACTIVOS
  11 Disponible
      Caja
      Bancos

  13 Cuentas por cobrar
      Clientes

  14 Inventarios
      Mercancías

  15 Propiedad planta y equipo

2 PASIVOS
  22 Proveedores
  23 Cuentas por pagar

3 PATRIMONIO
  Capital
  Resultado del ejercicio

4 INGRESOS
  Ventas
  Descuentos y devoluciones

5 GASTOS
  Arriendo
  Servicios
  Transporte
  Papelería
  Mantenimiento
  Publicidad
  Otros

6 COSTOS
  Costo de mercancía vendida
```

La codificación definitiva debe revisarse con la contadora.

## 16. Entidades conceptuales

### Account

```text
id
code
name
type
parentId
level
allowsMovement
isActive
createdAt
updatedAt
```

El plan de cuentas debe poder crearse manualmente o importarse desde Excel. La importación debe validar código único, jerarquía, tipo de cuenta y si admite movimientos; si existen errores, debe informar las filas rechazadas sin aplicar una carga parcial.

Tipos:

- ASSET;
- LIABILITY;
- EQUITY;
- INCOME;
- EXPENSE;
- COST.

### JournalEntry

```text
id
number
date
description
sourceType
sourceId
status
createdBy
createdAt
postedAt
reversedAt
reversedBy
reversalReason
```

### JournalEntryLine

```text
id
journalEntryId
accountId
thirdPartyId
description
debit
credit
```

Regla:

```text
SUM(debit) = SUM(credit)
```

No se debe permitir contabilizar un asiento descuadrado.

## 17. Asientos automáticos principales

### Venta en efectivo

```text
Débito  Caja                   $10.000
Crédito Ventas                 $10.000

Débito  Costo de ventas         $6.000
Crédito Inventarios             $6.000
```

### Venta por transferencia

```text
Débito  Bancos                 $10.000
Crédito Ventas                 $10.000

Débito  Costo de ventas         $6.000
Crédito Inventarios             $6.000
```

### Venta a crédito

```text
Débito  Clientes               $10.000
Crédito Ventas                 $10.000

Débito  Costo de ventas         $6.000
Crédito Inventarios             $6.000
```

### Cobro de cartera en efectivo

```text
Débito  Caja                   $10.000
Crédito Clientes               $10.000
```

### Cobro de cartera por transferencia

```text
Débito  Bancos                 $10.000
Crédito Clientes               $10.000
```

### Compra a crédito

```text
Débito  Inventarios          $1.500.000
Crédito Proveedores          $1.500.000
```

### Compra pagada inmediatamente desde banco

```text
Débito  Inventarios          $1.500.000
Crédito Bancos               $1.500.000
```

### Pago a proveedor

```text
Débito  Proveedores            $500.000
Crédito Bancos                 $500.000
```

## 18. Inventario y costo de venta

El costo de venta debe provenir del inventario real y de los lotes realmente consumidos por FEFO.

Ejemplo:

```text
Lote A: 100 TAB a $500
Lote B: 100 TAB a $550
```

Si FEFO consume 10 unidades del lote A:

```text
Costo de venta = 10 × $500 = $5.000
```

Debe conservarse relación entre:

- venta;
- producto;
- lote;
- cantidad;
- costo aplicado.

## 19. Descuentos

No deben reemplazar silenciosamente el precio.

Guardar:

```text
grossAmount
discountAmount
netAmount
```

Ejemplo:

```text
Precio normal       $30.000
Descuento            $2.000
Venta neta          $28.000
```

Esto permite reportar ventas brutas, descuentos y ventas netas.

### 19.1 Impuestos y totales comerciales

Las operaciones deben almacenar por separado `grossAmount`, `discountAmount`, `taxableBase`, `taxAmount` y `totalAmount`. La interfaz puede capturar o mostrar precios con impuesto incluido, pero el motor debe calcular y conservar internamente los componentes discriminados.

El perfil tributario de cada producto debe ser configurable (`GRAVADO`, `EXENTO`, `EXCLUIDO` o `NO_APLICA`) junto con la tarifa vigente cuando corresponda. No se debe suponer un tratamiento único para todos los medicamentos ni una tarifa global fija. La asignación se realiza por SKU o regla tributaria documentada.

Para una venta gravada, el impuesto generado se acredita en una cuenta separada de los ingresos. Para una compra, el impuesto recuperable se registra de manera independiente; si no es recuperable, se incorpora al costo de inventario o gasto según la operación. Estos comportamientos se aplican únicamente conforme a reglas tributarias activas y parametrizadas.

El sistema debe poder configurar retención en la fuente, reteIVA y reteICA. Para la configuración inicial RST, la retención en renta y la reteICA quedan deshabilitadas por defecto; la reteIVA permanece disponible y parametrizable, sin eliminar el motor. Los cambios de una regla no modifican documentos ya confirmados.

### 19.2 Configuración fiscal inicial confirmada

| Tema | Configuración inicial |
|---|---|
| Régimen y responsabilidades | SIMPLE (C-47) y responsable de IVA (R-48) |
| Precios | IVA incluido en vitrina; base e IVA discriminados internamente |
| IVA por SKU | Tratamiento documentado por producto o regla, no por categoría general |
| IVA directamente atribuible | Descontable cuando cumpla requisitos y esté asociado a operaciones con derecho a descuento |
| IVA de operaciones excluidas | Mayor costo o gasto cuando no sea recuperable |
| IVA común | Cuenta transitoria y prorrateo cuando no pueda imputarse directamente |
| Retención en renta y reteICA | Deshabilitadas por defecto |
| ReteIVA | Disponible y parametrizable; no eliminada |
| Anticipos SIMPLE | Habilitados |

Las cuentas nuevas aprobadas son: `240805` (IVA generado), `240810` (IVA descontable), `417505` (devoluciones en ventas), `413595` (descuentos comerciales), `135518` (anticipo impuesto SIMPLE) y `421005` (descuentos financieros obtenidos). Las cuentas de gasto definidas incluyen nómina y prestaciones, arrendamientos, servicios públicos, mantenimientos y aseo/cafetería.

Las cuentas operativas restantes se resuelven mediante propósitos contables, no por código fijo en el software. El mapeo final de Caja, Bancos, Clientes, Proveedores, Inventarios, Ventas, Costo de Ventas, Capital, Resultado del ejercicio, IVA común e IVA no descontable sigue pendiente de aprobación contable.

El Slice 11.1 (IMPLEMENTADO) permite administrar el plan de cuentas, importar Excel y registrar propósitos en estado `PENDING_MAPPING` antes de recibir esos códigos. Un propósito pendiente no habilita asientos: cada automatización contable posterior debe comprobar los mapeos obligatorios de su operación y detenerse si falta alguno. Este avance no implica aprobación de los códigos operativos ni implementación del motor de partida doble.

---

# BLOQUE 4 — GASTOS

## 20. Objetivo

Registrar gastos operativos y administrativos, estén pagados o pendientes.

## 21. Categorías

Ejemplos:

- energía;
- agua;
- internet;
- arriendo;
- papelería;
- transporte;
- mantenimiento;
- honorarios;
- aseo;
- publicidad;
- otros.

Deben ser administrables.

## 22. Registro de gasto

Campos:

- fecha;
- categoría;
- descripción;
- proveedor o tercero;
- documento;
- valor;
- forma de pago;
- pagado / pendiente;
- fecha de vencimiento;
- observaciones;
- archivo soporte opcional.

## 23. Gasto pendiente

Ejemplo:

```text
Factura energía
Valor: $350.000
Estado: Pendiente
```

Asiento:

```text
Débito  Servicios              $350.000
Crédito Cuentas por pagar      $350.000
```

## 24. Pago posterior

Desde Banco:

```text
Débito  Cuentas por pagar      $350.000
Crédito Bancos                 $350.000
```

No se registra otra vez el gasto.

## 25. Gasto pagado inmediatamente

Ejemplo:

```text
Débito  Papelería               $50.000
Crédito Caja                    $50.000
```

---

# BLOQUE 5 — ESTADOS FINANCIEROS

## 26. Objetivo

Generar información financiera automáticamente a partir de los movimientos registrados.

Inicialmente:

1. Estado de Situación Financiera.
2. Estado de Resultados.
3. Balance de comprobación.
4. Auxiliares.
5. Reportes administrativos complementarios.

## 27. Estado de Situación Financiera

Debe consultarse a una fecha.

### Activos

- Caja;
- Bancos;
- Cuentas por cobrar;
- Inventarios.

Posteriormente:
- Propiedad, Planta y Equipo;
- otros activos.

### Pasivos

- Proveedores;
- Cuentas por pagar;
- otras obligaciones.

### Patrimonio

- capital;
- resultado acumulado;
- resultado del ejercicio.

Debe cumplirse:

```text
ACTIVO = PASIVO + PATRIMONIO
```

## 28. Estado de Resultados

Debe consultarse por periodo.

Debe considerar:

- ventas brutas;
- descuentos;
- devoluciones;
- ventas netas;
- costo de ventas;
- utilidad bruta;
- gastos;
- resultado del periodo.

Ejemplo:

```text
INGRESOS

Ventas brutas                  $30.000.000
(-) Descuentos                    $500.000
                              ------------
Ventas netas                   $29.500.000

COSTO

Costo de mercancía vendida     $18.000.000
                              ------------
UTILIDAD BRUTA                  $11.500.000

GASTOS

Arriendo                        $1.500.000
Servicios                         $600.000
Transporte                        $300.000
Otros                             $200.000
                              ------------
Total gastos                     $2.600.000

RESULTADO

Utilidad del periodo             $8.900.000
```

## 29. Balance de comprobación

Debe mostrar:

| Cuenta | Saldo inicial | Débitos | Créditos | Saldo final |
|---|---:|---:|---:|---:|

## 30. Auxiliares

- Caja.
- Banco.
- Cuenta contable.
- Cliente.
- Proveedor.
- Gastos.
- Inventario.
- Cuentas por cobrar.
- Cuentas por pagar.

## 31. Reportes complementarios

### Cartera por edades
- 0–30 días;
- 31–60;
- 61–90;
- más de 90.

### Cuentas por pagar
- vencidas;
- próximas a vencer;
- pagadas;
- pendientes.

### Ventas por periodo
- ventas brutas;
- descuentos;
- ventas netas;
- costo;
- utilidad;
- número de ventas.

### Productos más vendidos
- producto;
- unidades vendidas;
- valor vendido;
- costo;
- margen;
- rotación.

### Gastos por categoría

### Descuentos otorgados
- fecha;
- venta;
- producto;
- vendedor;
- valor bruto;
- descuento;
- motivo;
- valor neto.

---

## 32. Auditoría

Toda operación sensible debe registrar:

```text
createdBy
createdAt
updatedBy
updatedAt
sourceType
sourceId
status
reversedBy
reversedAt
reversalReason
```

Debe auditarse especialmente:

- descuentos;
- anulaciones;
- pagos;
- reversos;
- ajustes;
- movimientos de Caja;
- movimientos de Banco;
- cambios de cuentas;
- cambios de saldos iniciales;
- modificaciones contables autorizadas.

---

## 33. Roles y permisos

### Administrador

Puede:

- configurar cuentas;
- configurar plan contable;
- gestionar bancos;
- consultar reportes;
- registrar ajustes autorizados;
- reversar operaciones con justificación.

### Contabilidad

Puede:

- consultar asientos;
- registrar gastos;
- gestionar cartera;
- gestionar cuentas por pagar;
- consultar estados financieros;
- generar auxiliares;
- registrar pagos autorizados.

### Cajero

Puede:

- ventas;
- cobros;
- Caja;
- arqueo.

No puede:

- editar el plan contable;
- alterar asientos;
- modificar saldos;
- crear cuentas bancarias;
- modificar operaciones históricas.

### Compras

Puede:

- registrar compras;
- consultar proveedores;
- generar obligaciones derivadas de compras.

No modifica asientos directamente.

---

## 34. Modelo conceptual de datos

### CashRegister

```text
id
name
status
openingBalance
currentBalance
openedBy
openedAt
closedBy
closedAt
```

### CashMovement

```text
id
cashRegisterId
type
amount
description
sourceType
sourceId
createdBy
createdAt
```

### BankAccount

```text
id
bankName
accountType
accountNumber
displayName
openingBalance
currentBalance
isActive
createdAt
updatedAt
```

### BankMovement

```text
id
bankAccountId
type
amount
description
reference
sourceType
sourceId
createdBy
createdAt
```

### Receivable

```text
id
customerId
saleId
originalAmount
paidAmount
balance
dueDate
status
createdAt
updatedAt
```

### ReceivablePayment

```text
id
receivableId
amount
paymentMethodId
cashRegisterId
bankAccountId
createdBy
createdAt
```

### Payable

```text
id
supplierId
purchaseId
expenseId
originalAmount
paidAmount
balance
dueDate
status
createdAt
updatedAt
```

### PayablePayment

```text
id
payableId
amount
paymentMethodId
cashRegisterId
bankAccountId
createdBy
createdAt
```

### ExpenseCategory

```text
id
name
description
accountId
isActive
createdAt
updatedAt
```

### Expense

```text
id
categoryId
thirdPartyId
documentNumber
date
description
grossAmount
discountAmount
netAmount
status
dueDate
createdBy
createdAt
updatedAt
```

### AccountingPeriod

```text
id
year
month
startDate
endDate
status
closedAt
closedBy
```

Estados:

- OPEN;
- CLOSED.

---

## 35. Periodos contables

El sistema debe quedar preparado para periodos abiertos y cerrados.

Una vez cerrado un periodo:

- no se deben registrar movimientos retroactivos sin autorización;
- los ajustes deben quedar documentados;
- cualquier reapertura debe auditarse.

---

## 36. Reglas de integridad

- Nunca permitir asientos con débitos distintos a créditos.
- No borrar movimientos históricos confirmados.
- No modificar movimientos bancarios confirmados sin reversión.
- Un pago de cartera no puede superar el saldo, salvo manejo explícito de anticipo.
- Un pago a proveedor no debe superar el saldo sin tratamiento específico.
- El costo de venta debe provenir de los movimientos reales de inventario.
- Los descuentos deben mantenerse separados del precio bruto.

---

## 37. APIs esperadas

Los nombres definitivos deben ajustarse a las convenciones existentes.

### Tesorería

```text
GET /cash
GET /cash/movements
POST /cash/movements
POST /cash/open
POST /cash/close

GET /bank-accounts
POST /bank-accounts
PATCH /bank-accounts/:id
GET /bank-accounts/:id/movements
```

### Cartera

```text
GET /receivables
GET /receivables/:id
POST /receivables/:id/payments

GET /payables
GET /payables/:id
POST /payables/:id/payments
```

### Contabilidad

```text
GET /accounts
POST /accounts
PATCH /accounts/:id

GET /journal-entries
GET /journal-entries/:id
POST /journal-entries/:id/reverse
```

### Gastos

```text
GET /expenses
POST /expenses
GET /expenses/:id
POST /expenses/:id/pay
```

### Estados financieros

```text
GET /reports/balance-sheet
GET /reports/income-statement
GET /reports/trial-balance
GET /reports/general-ledger
```

---

## 38. UX esperada

El usuario operativo no debe tener que entender partida doble ni asientos.

Ejemplo, el cajero ve:

```text
Venta
Total: $25.000
Medio: Efectivo
Recibido: $30.000
Cambio: $5.000
```

El sistema internamente genera:

```text
Caja
Ventas
Costo de ventas
Inventario
```

La vista contable queda para usuarios autorizados.

---

## 39. Flujo completo de una venta

Producto:

```text
Acetaminofén 500 mg
```

Venta:

```text
2 Blísteres
1 Blíster = 10 TAB
Total venta = $15.000
Pago = efectivo
```

FEFO determina:

```text
20 TAB
Costo real = $9.000
```

El sistema:

1. registra la venta;
2. registra 2 blísteres como presentación comercial;
3. descuenta 20 TAB;
4. consume lotes por FEFO;
5. calcula costo de venta = $9.000;
6. aumenta Caja = $15.000;
7. genera:

```text
Débito  Caja                $15.000
Crédito Ventas              $15.000

Débito  Costo ventas         $9.000
Crédito Inventarios          $9.000
```

8. actualiza reportes;
9. conserva trazabilidad.

---

## 40. Flujo completo de una compra a crédito

```text
Proveedor: Copidrogas
Factura: 45879
Total: $2.000.000
Plazo: 30 días
```

Al confirmar:

1. ingresa inventario;
2. crea lotes;
3. actualiza Kardex;
4. genera cuenta por pagar;
5. genera:

```text
Débito  Inventarios          $2.000.000
Crédito Proveedores          $2.000.000
```

Pago posterior:

```text
$1.000.000 desde Bancolombia
```

Asiento:

```text
Débito  Proveedores          $1.000.000
Crédito Bancolombia          $1.000.000
```

Saldo pendiente:

```text
$1.000.000
```

---

## 41. Flujo de gasto pendiente

```text
Energía
Factura: EN-001
Valor: $350.000
Pendiente
```

Al registrar:

```text
Débito  Servicios             $350.000
Crédito Cuentas por pagar     $350.000
```

Al pagar:

```text
Débito  Cuentas por pagar     $350.000
Crédito Bancos                $350.000
```

---

## 42. Reportes y filtros

Todos los reportes temporales deben tener:

```text
Desde
Hasta
```

También pueden tener accesos rápidos:

- Hoy.
- Esta semana.
- Este mes.
- Mes anterior.
- Este año.

---

## 43. Alcance MVP

### Bloque 1 — Tesorería
- Caja;
- Bancos;
- cuentas bancarias;
- medios de pago;
- movimientos;
- filtros;
- arqueo básico.

### Bloque 2 — Cartera
- cuentas por cobrar;
- cuentas por pagar;
- abonos;
- vencimientos;
- estados;
- cartera por edades.

### Bloque 3 — Contabilidad automática
- plan de cuentas reducido;
- asientos automáticos;
- reglas para ventas;
- compras;
- pagos;
- gastos;
- costo de venta;
- reversión controlada;
- trazabilidad.

### Bloque 4 — Gastos
- categorías;
- gastos pagados;
- gastos pendientes;
- causación;
- pagos;
- soportes;
- filtros.

### Bloque 5 — Estados financieros
- Estado de Situación Financiera;
- Estado de Resultados;
- Balance de comprobación;
- auxiliares;
- filtros.

---

## 44. Fuera del alcance inicial

No se recomienda incluir en la primera versión:

- nómina;
- depreciaciones completas;
- activos fijos completos;
- conciliación bancaria automática;
- importación automática de extractos;
- declaraciones tributarias;
- retenciones avanzadas;
- cierre fiscal completo;
- libros oficiales complejos;
- integración DIAN completa;
- documento equivalente electrónico;
- facturación electrónica;
- nómina electrónica;
- impuestos avanzados;
- múltiples monedas;
- consolidación de varias empresas.

---

## 45. Consideraciones para Colombia

El sistema debe diseñarse pensando en el entorno contable colombiano, pero las reglas fiscales y tributarias específicas de la farmacia deben validarse con su contador.

Antes de implementar definitivamente:

- IVA;
- retenciones;
- facturación electrónica;
- documento equivalente electrónico POS;
- reportes fiscales;
- información exógena;
- cierre tributario;

se debe confirmar:

- responsabilidades tributarias reales del negocio;
- obligaciones DIAN;
- tratamiento contable definido por la contadora.

La matriz tributaria inicial fue confirmada para RST y responsable de IVA. Sigue pendiente únicamente el mapeo completo de cuentas operativas y cualquier cambio futuro de responsabilidades, tarifas, bases o vigencias.

No se deben quemar reglas fiscales en código sin validación.

---

## 46. Criterios generales de aceptación

### Caso 1 — Venta en efectivo
- registra venta;
- aumenta Caja;
- disminuye inventario;
- reconoce costo de venta;
- genera asiento;
- aparece en Estado de Resultados.

### Caso 2 — Venta por transferencia
- aumenta Banco;
- no aumenta Caja;
- genera asiento correcto.

### Caso 3 — Venta a crédito
- genera cuenta por cobrar;
- no aumenta Caja/Banco;
- permite abonos posteriores.

### Caso 4 — Compra a crédito
- aumenta inventario;
- genera cuenta por pagar;
- permite pagos parciales.

### Caso 5 — Gasto pendiente
- registra gasto;
- genera cuenta por pagar;
- no disminuye Banco hasta el pago.

### Caso 6 — Pago de gasto
- disminuye Banco o Caja;
- disminuye cuenta por pagar;
- no duplica el gasto.

### Caso 7 — Estado de Situación Financiera
Debe cumplirse:

```text
Activo = Pasivo + Patrimonio
```

### Caso 8 — Estado de Resultados

```text
Ventas
- descuentos
= ventas netas

Ventas netas
- costo de ventas
= utilidad bruta

Utilidad bruta
- gastos
= resultado
```

### Caso 9 — Trazabilidad
Desde cualquier asiento debe conocerse la operación de origen.

### Caso 10 — Reversión
Una operación confirmada no se borra; se revierte de forma controlada.

---

## 47. Orden recomendado de implementación

### Fase 1
Tesorería:
- Caja;
- Banco;
- cuentas bancarias;
- medios de pago;
- movimientos.

**Estado de ejecución: EN PROGRESO.** Existen Caja y cuentas/movimientos bancarios manuales, pero el cierre de la fase exige enrutar ventas y pagos por transferencia a la cuenta seleccionada sin alterar Caja, comprobar idempotencia y definir reversión. La apertura, arqueo y cierre de turnos siguen bloqueados hasta confirmar si habrá una caja general o cajas por cajero y su política de diferencias. Los movimientos históricos no efectivos que pudieran constar en Caja requieren conciliación explícita; no se reescriben automáticamente. El detalle actualizado de estados está en `PLAN_DESARROLLO.md`.

### Fase 2
Cartera:
- cuentas por cobrar;
- cuentas por pagar;
- pagos y abonos.

### Fase 3
Contabilidad:
- plan de cuentas;
- asientos;
- motor contable;
- reglas automáticas.

### Fase 4
Gastos:
- categorías;
- causación;
- pago.

### Fase 5
Estados financieros:
- Estado de Situación Financiera;
- Estado de Resultados;
- Balance de comprobación;
- auxiliares.

### Fase 6
Pruebas integrales:
- ventas;
- compras;
- cartera;
- gastos;
- inventario;
- caja;
- bancos;
- estados financieros.

---

## 48. Pruebas mínimas obligatorias

### Tesorería
- venta en efectivo;
- transferencia;
- gasto efectivo;
- gasto bancario;
- saldo acumulado;
- reversión.

### Cartera
- venta a crédito;
- abono parcial;
- pago total;
- obligación vencida;
- compra a crédito;
- pago parcial a proveedor.

### Contabilidad
- asiento balanceado;
- rechazo de asiento descuadrado;
- venta efectivo;
- venta banco;
- venta crédito;
- compra contado;
- compra crédito;
- pago cliente;
- pago proveedor;
- gasto pendiente;
- gasto pagado.

### Inventario
- costo de venta por lote;
- FEFO;
- reversión de venta;
- devolución.

### Reportes
- Estado de Situación Financiera;
- Estado de Resultados;
- Balance de comprobación;
- auxiliar de cuenta;
- filtro por fecha.

---

## 49. Resultado esperado

Al finalizar los cinco bloques, la farmacia deberá poder:

1. registrar compras;
2. aumentar inventario;
3. generar obligaciones cuando corresponda;
4. realizar ventas;
5. disminuir inventario;
6. calcular costo real de venta;
7. enviar el dinero a Caja o Banco según el medio;
8. generar cartera en ventas a crédito;
9. registrar pagos posteriores;
10. reconocer gastos;
11. generar asientos;
12. construir estados financieros;
13. mantener trazabilidad completa.

El objetivo final es que la operación diaria alimente la contabilidad sin volver a digitar los mismos hechos económicos.

---

## 50. Siguiente etapa recomendada

Después de aprobar este documento, el siguiente trabajo debe ser convertirlo en historias de usuario y tareas técnicas.

Orden sugerido:

1. diseñar Tesorería;
2. definir modelo Prisma;
3. construir Caja;
4. construir Bancos;
5. crear medios de pago;
6. integrar POS;
7. implementar Cuentas por Cobrar;
8. implementar Cuentas por Pagar;
9. diseñar plan de cuentas;
10. construir motor contable;
11. integrar compras;
12. integrar gastos;
13. generar estados financieros;
14. realizar pruebas integrales.

Esto permite desarrollar el módulo de forma controlada sin intentar construir toda la contabilidad en una sola entrega.

# Backlog ejecutable — Reunión con el cliente

## Dominio, backend y datos · T-04, T-05, T-08, T-09, T-13 a T-16 y T-19 a T-31

## 1. Propósito y alcance

Este backlog transforma los acuerdos de la última reunión en trabajo ejecutable para dominio, backend, API y base de datos. Se elaboró contrastando el texto de la reunión con el estado estático del repositorio.

Este documento no certifica funcionamiento en ejecución. Cuando se indica que existe código o persistencia, significa **comprobado por inspección estática**, no `IMPLEMENTADO` ni validado en ambiente.

Quedan fuera de este documento frontend, UX y las tareas T-01 a T-03, T-06, T-07, T-10 a T-12, T-17, T-18 y T-32 en adelante.

### Clasificación de origen

- `CONFIRMADO`: regla que el texto de reunión declara expresamente acordada.
- `REPORTADO`: comportamiento o defecto observado durante la reunión o comprobado en el código.
- `RECOMENDACIÓN`: decisión técnica propuesta para proteger integridad, trazabilidad o mantenibilidad; requiere validación si cambia negocio.
- `BLOQUEADO`: falta una política del cliente o de la contadora que modifica datos, cálculos o alcance.

### Estados de este backlog

- `LISTO`: existe información suficiente para iniciar el slice.
- `PARCIAL`: hay soporte estático existente, pero faltan reglas o partes necesarias.
- `NO INICIADO`: no se encontró soporte equivalente.
- `BLOQUEADO`: no debe implementarse la solución definitiva todavía.

### Definition of Done general

Cada tarea que pase a desarrollo debe cumplir, además de sus criterios particulares:

- migración nueva y segura cuando cambie el esquema; no modificar migraciones aplicadas;
- contratos y OpenAPI actualizados;
- permisos validados en backend;
- cálculos monetarios sin coma flotante;
- operación crítica atómica e idempotente cuando pueda repetirse;
- auditoría de actor, acción, entidad, fecha y motivo cuando corresponda;
- pruebas unitarias, integración con PostgreSQL real y API proporcionales al riesgo;
- formatter, lint, typecheck y pruebas ejecutados con resultado real;
- revisión del diff y documentación de cualquier decisión pendiente.

---

## 2. Identidad de terceros

### T-04 — Corrección administrativa del documento de cliente

**Estado comprobado:** `PARCIAL`. El número de documento es único en base de datos, pero no se puede corregir mediante la actualización actual. El tipo de documento sí puede modificarlo cualquier usuario con `customers:manage`, permiso que también poseen roles no administrativos.

**Clasificación:** `CONFIRMADO` para la exclusividad del administrador; `REPORTADO` para la brecha de permisos y contrato; `RECOMENDACIÓN` para auditoría antes/después.

**Historia:** Como administrador, quiero corregir el tipo y número de documento de un cliente que fue digitado incorrectamente, para conservar su identidad y todas sus relaciones históricas sin crear un cliente duplicado.

**Trabajo concreto:**

- separar la corrección de identidad de la edición general del cliente;
- definir un permiso backend específico, por ejemplo `customers:identity:correct`, asignado únicamente al administrador;
- aceptar tipo y número de documento en una operación explícita, con motivo obligatorio;
- comprobar cliente existente y unicidad del documento normalizado antes de persistir;
- actualizar el mismo registro, sin recrear ventas, cartera ni relaciones;
- registrar en auditoría valor anterior, valor nuevo, motivo y actor, evitando exponer más datos de los necesarios;
- impedir que la actualización general modifique tipo o número de documento.

**Dependencias:** RBAC existente, repositorio de clientes, auditoría y política de normalización de documentos.

**Criterios de aceptación comprobables:**

- un administrador puede corregir tipo y número con motivo no vacío;
- un cajero, cartera, supervisor o usuario sin el permiso específico recibe `403`;
- un documento ya asociado a otro cliente produce `409` y no modifica datos;
- ventas y cuentas por cobrar continúan apuntando al mismo `customerId`;
- queda un evento de auditoría con antes, después, actor y motivo;
- reintentar la misma corrección no crea clientes ni relaciones duplicadas.

**Pruebas requeridas:** unitarias de normalización y autorización; integración PostgreSQL de unicidad y conservación de FK; integración API por rol; auditoría; regresión de edición general.

**Definition of Ready:**

- confirmar formato y normalización por tipo de documento;
- confirmar si Supervisor puede solicitar la corrección o solo Administrador ejecutarla;
- confirmar longitud mínima del motivo y política de visualización del historial.

### T-05 — Corrección administrativa del NIT de proveedor

**Estado comprobado:** `PARCIAL`. Existe unicidad de `taxId` y las compras conservan la FK al proveedor, pero cualquier usuario con `suppliers:manage`, incluidos Compras y Supervisor, puede cambiar el NIT.

**Clasificación:** `CONFIRMADO` para la exclusividad del administrador; `REPORTADO` para el permiso demasiado amplio; `RECOMENDACIÓN` para una operación y permiso separados.

**Historia:** Como administrador, quiero corregir un NIT digitado incorrectamente sin reemplazar al proveedor, para conservar compras, cuentas por pagar e historial.

**Trabajo concreto:**

- retirar `taxId` de la edición general o rechazarlo si falta el permiso específico;
- crear una operación explícita de corrección con motivo obligatorio;
- validar proveedor existente y unicidad del NIT normalizado;
- preservar el `supplierId` y todas sus relaciones;
- auditar NIT anterior, nuevo, actor y motivo.

**Dependencias:** T-04 como patrón de autorización/auditoría, RBAC, proveedores, compras y cuentas por pagar.

**Criterios de aceptación comprobables:**

- solo el administrador autorizado puede cambiar el NIT;
- Compras y Supervisor pueden editar datos ordinarios permitidos, pero no el NIT;
- un NIT duplicado produce `409` sin cambios parciales;
- compras y cuentas por pagar históricas conservan el mismo proveedor;
- la corrección queda auditada con valores anterior/nuevo y motivo.

**Pruebas requeridas:** unitarias de normalización; API por roles; integración de índice único y relaciones; auditoría; regresión del CRUD ordinario.

**Definition of Ready:** confirmar normalización del NIT, incluido dígito de verificación, guiones y espacios; confirmar si se debe conservar una consulta visible del historial de correcciones.

---

## 3. Unidades, presentaciones y existencias

### T-08 — Cerrar el modelo de unidad base y presentaciones

**Estado comprobado:** `PARCIAL AVANZADO`. Existen unidad base, unidades de medida, presentaciones jerárquicas, habilitación para compra/venta, factor acumulado, cantidad comercial y factor histórico. La conversión usa enteros y redondeo; no está resuelta la convivencia con productos de peso o volumen mencionados en la reunión.

**Clasificación:** `CONFIRMADO` para inventario en unidad base y factores por producto; `REPORTADO` para soporte parcial; `BLOQUEADO` en la política de cantidades base decimales; `RECOMENDACIÓN` para reforzar invariantes.

**Historia:** Como responsable de catálogo e inventario, quiero configurar presentaciones propias de cada producto y convertir toda entrada o salida a su unidad base, para mantener un saldo único y trazable.

**Trabajo concreto listo:**

- verificar y corregir la propagación de factores cuando cambia una presentación contenida;
- impedir ciclos, referencias entre productos y factores no positivos en servicio y base de datos;
- garantizar una sola presentación predeterminada de compra y una de venta por producto;
- conservar en compras, ventas y Kardex presentación, cantidad comercial, factor histórico y cantidad base;
- validar que una presentación solo se use en la operación para la que está habilitada;
- rechazar conversiones que produzcan una cantidad base inválida, en lugar de redondearlas silenciosamente.

**Dependencias:** decisión de decimalidad, catálogo de unidades, productos, compras, ventas e inventario.

**Criterios de aceptación comprobables:**

- una caja que contiene 100 blísteres de 10 produce exactamente 1.000 unidades base;
- una compra de dos cajas registra 2.000 unidades base y conserva los dos factores históricos;
- una venta de dos blísteres descuenta exactamente 20 unidades base;
- cambiar un factor futuro no modifica movimientos, compras o ventas históricas;
- no se puede usar en compra una presentación solo habilitada para venta, ni viceversa;
- un cambio de factor padre actualiza coherentemente sus descendientes o falla de forma atómica.

**Pruebas requeridas:** unitarias de jerarquía y conversión; integración Prisma/PostgreSQL de restricciones y snapshots; compras y ventas por múltiples presentaciones; regresión histórica después de cambiar factores; prueba de rollback ante jerarquía inválida.

**Definition of Ready:**

- **pregunta bloqueante:** ¿la unidad base siempre es discreta/entera o peso y volumen requieren cantidades base decimales?
- si admite decimales, definir precisión y escala por tipo de unidad antes de migrar `Int`;
- confirmar si se permiten presentaciones con equivalencias fraccionarias.

### T-09 — Hacer lote y vencimiento condicionales por producto

**Estado comprobado:** `NO INICIADO` respecto de la regla acordada. DTO, dominio, frontend y esquema exigen lote y vencimiento para toda recepción. Inventario y Kardex también requieren `lotId` no nulo.

**Clasificación:** `CONFIRMADO` y `REPORTADO`; `RECOMENDACIÓN` para modelar explícitamente existencias no loteadas y evitar valores ficticios.

**Historia:** Como receptor de mercancía, quiero que lote y vencimiento sean obligatorios solo para productos configurados con control, para recibir artículos no farmacéuticos sin inventar datos.

**Trabajo concreto:**

- definir el modelo de saldo por producto/ubicación para artículos no loteados;
- crear migración nueva que soporte movimientos y líneas de compra sin lote cuando el producto no lo requiera;
- hacer `lotNumber` y `expirationDate` condicionales en contrato, validación y dominio;
- validar en backend la configuración real del producto, sin confiar en el payload;
- conservar obligatoriedad estricta para productos loteados;
- adaptar consultas de existencias, Kardex, ajustes, ventas, reportes y alertas;
- no crear lotes `SIN_LOTE` con vencimientos artificiales salvo decisión arquitectónica explícita.

**Dependencias:** T-08 y decisión de estructura de existencias no loteadas; módulos de compras, inventario, ventas, alertas y reportes.

**Criterios de aceptación comprobables:**

- un producto `requiresLotControl=false` se recibe sin lote ni vencimiento y aumenta su saldo base;
- el mismo producto puede venderse y ajustarse con trazabilidad sin FEFO;
- un producto `requiresLotControl=true` rechaza recepción sin ambos campos;
- ningún movimiento queda sin referencia a un saldo válido de producto/ubicación;
- los productos no loteados no generan alertas de vencimiento;
- una transacción fallida no deja compra, saldo o movimiento parcial.

**Pruebas requeridas:** migración con datos existentes; unitarias de validación condicional; integración PostgreSQL para ambos tipos de producto; API de recepción; venta concurrente sin lote; regresión FEFO para loteados; Kardex y alertas.

**Definition of Ready:**

- confirmar si el saldo no loteado debe existir por ubicación o como saldo general;
- confirmar si un producto puede cambiar de loteado a no loteado cuando ya tiene existencias o historial;
- definir estrategia de migración para productos y movimientos existentes.

---

## 4. Compras

### T-13 — Consolidar recepción de compra mediante presentaciones

**Estado comprobado:** `PARCIAL AVANZADO`. La recepción transaccional registra compra, cuenta por pagar, líneas, presentación, unidades base, lote y Kardex. Lote/vencimiento sigue siendo obligatorio; la condición de pago se infiere posteriormente desde el estado de la cuenta y no queda preservada como hecho histórico.

**Clasificación:** `CONFIRMADO` para el flujo y datos mínimos; `REPORTADO` para brechas; `RECOMENDACIÓN` para idempotencia, condición histórica y unicidad de factura por proveedor.

**Historia:** Como usuario de compras, quiero recibir una factura con múltiples productos y presentaciones, para registrar inventario, trazabilidad y obligación de pago en una sola operación atómica.

**Trabajo concreto:**

- integrar la recepción con T-08 y T-09;
- persistir condición de pago original, fecha de emisión/compra, vencimiento y usuario receptor sin inferirlos del estado posterior;
- aplicar ubicación por línea o eliminar ese dato del contrato si la recepción es de ubicación única;
- validar producto y presentación activos y habilitados para compra;
- añadir clave de idempotencia y política de duplicado de factura;
- crear compra, líneas, saldo, Kardex y obligación/pago de contado dentro de una transacción;
- evitar considerar una compra de contado como pagada sin registrar la salida en el medio financiero correcto.

**Dependencias:** T-08, T-09, T-15, T-16 y T-24; proveedores; ubicaciones; cuentas por pagar.

**Criterios de aceptación comprobables:**

- dos blísteres de factor 10 ingresan 20 unidades base y conservan cantidad/factor comerciales;
- cada línea respeta la configuración de lote del producto;
- una misma clave idempotente no duplica compra, inventario, Kardex ni obligación;
- una factura duplicada según la política acordada se rechaza de forma determinista;
- contado y crédito conservan su condición original aun después de pagar la obligación;
- cualquier fallo revierte todas las escrituras del flujo.

**Pruebas requeridas:** dominio; API; integración PostgreSQL real; rollback por fallo intermedio; idempotencia concurrente; factura duplicada; múltiples productos/ubicaciones; compra contado y crédito; regresión de Kardex.

**Definition of Ready:** confirmar unicidad de factura por proveedor y si se aceptan notas/documentos repetidos; confirmar recepción única o por varias ubicaciones; T-24 debe definir cómo sale el dinero en contado.

### T-14 — Completar consulta e historial de compras

**Estado comprobado:** `PARCIAL AVANZADO`. Se consultan factura, proveedor, fechas, receptor, líneas, lotes, cantidades, costos y total. La condición de pago es inferida y la cantidad comercial se serializa con cuatro decimales fijos.

**Clasificación:** `CONFIRMADO` para el contenido del historial; `REPORTADO` para condición inferida y formato; `RECOMENDACIÓN` para separar valor numérico de formato visual.

**Historia:** Como responsable de compras, quiero consultar una recepción con sus valores comerciales y equivalentes base originales, para auditar qué ingresó, cuánto costó y quién lo recibió.

**Trabajo concreto:**

- devolver condición de pago histórica persistida;
- exponer cantidad comercial como decimal exacto y dejar el formato sin ceros innecesarios a presentación;
- incluir factor histórico, unidades base, usuario receptor y datos de lote solo cuando correspondan;
- mantener filtros por proveedor, factura, estado y rango de fechas;
- garantizar que cambios posteriores de producto o presentación no alteren el significado histórico.

**Dependencias:** T-08, T-09 y T-13.

**Criterios de aceptación comprobables:**

- una cantidad `2.0000` se conserva exactamente y puede presentarse como `2`;
- una cantidad fraccionaria permitida no pierde precisión;
- la condición original no cambia cuando la cuenta por pagar pasa a pagada;
- el detalle muestra cantidad comercial, factor histórico y unidades base;
- filtros Desde/Hasta incluyen correctamente el día final según la zona horaria definida.

**Pruebas requeridas:** serialización decimal; integración de consulta histórica; filtros de fecha y zona horaria; snapshots de presentación; regresión tras editar factores.

**Definition of Ready:** depende de la respuesta de decimalidad de T-08 y de la zona horaria operativa oficial.

### T-15 — Definir y registrar descuentos en compras

**Estado comprobado:** `BLOQUEADO`. El esquema actual solo conserva subtotal de línea y total de compra; no distingue bruto, descuento y neto.

**Clasificación:** `BLOQUEADO` por decisión contable; el caso de $50.000 − $2.000 = $48.000 está `REPORTADO`, no define por sí solo el modelo.

**Historia pendiente:** Como responsable de compras/contabilidad, quiero conservar el descuento facturado y su efecto en costo y obligación, para que inventario, cuentas por pagar y reportes concilien con la factura.

**Trabajo permitido antes de la definición:** documentar alternativas y preparar ejemplos de facturas reales anonimizadas. No crear columnas ni cálculos definitivos.

**Dependencias:** decisión de la contadora, T-13, T-16, método de costeo requerido por T-29.

**Criterios de aceptación preliminares, sujetos a validación:**

- el total de la compra concilia con el documento del proveedor;
- se conserva el valor bruto, descuento y neto si esa es la política elegida;
- el costo de inventario y la cuenta por pagar usan la base definida por contabilidad;
- descuentos por línea y globales se distribuyen mediante una regla explícita y reproducible.

**Pruebas requeridas cuando esté lista:** unitarias de distribución y redondeo; integración de compra/Kardex/costo/payable; facturas con descuento global y por línea; conciliación exacta.

**Definition of Ready:**

- confirmar si el descuento se registra por línea, global o ambos;
- confirmar si disminuye costo de inventario, gasto o una cuenta separada;
- definir orden de cálculo respecto de impuestos y costos adicionales;
- definir redondeo y tratamiento de diferencias de centavos.

### T-16 — Definir impuestos de compras y ventas

**Estado comprobado:** `BLOQUEADO`. Ventas posee campos técnicos de impuesto con valor cero, pero no hay política fiscal; compras no posee estructura equivalente.

**Clasificación:** `BLOQUEADO` por información tributaria; `REPORTADO` para campos parciales existentes.

**Historia pendiente:** Como responsable contable, quiero que compras, ventas y comprobantes apliquen los impuestos reales del negocio, para producir valores y reportes fiscalmente coherentes.

**Trabajo permitido antes de la definición:** inventariar campos existentes y recopilar facturas de ejemplo anonimizadas. No activar cálculos ni tasas por defecto.

**Dependencias:** responsabilidad tributaria, catálogo de productos, T-13, T-15, T-19, T-28 y T-29.

**Criterios de aceptación preliminares, sujetos a validación:**

- cada cálculo identifica base gravable, tasa, impuesto y total;
- compra, venta, comprobante y reporte reproducen el mismo cálculo;
- cambios futuros de tasa no alteran documentos históricos;
- el cálculo monetario no usa coma flotante.

**Pruebas requeridas cuando esté lista:** tablas de decisión por tipo de producto; unitarias con redondeo; integración compra/venta/reportes; regresión histórica; casos exentos/excluidos si la contadora los confirma.

**Definition of Ready:**

- responsabilidad tributaria del negocio;
- impuestos aplicables, tasas y productos afectados;
- precios incluidos o no incluidos;
- retenciones u otros conceptos;
- tratamiento de descuentos frente a la base gravable;
- datos obligatorios del comprobante.

---

## 5. Descuentos de venta

### T-19 — Aplicar descuento manual controlado

**Estado comprobado:** `PARCIAL INSEGURO`. El contrato acepta descuento y precio sobrescrito, pero no existe límite, permiso de autorización ni política parametrizada. Un usuario con `sales:create` puede reducir el precio hasta cero.

**Clasificación:** `CONFIRMADO` para la necesidad de control; `REPORTADO` para la brecha; `BLOQUEADO` para el máximo definitivo; `RECOMENDACIÓN` para eliminar o restringir el precio sobrescrito.

**Historia:** Como vendedor autorizado, quiero aplicar un descuento dentro del límite definido por administración, para atender una negociación sin poder fijar precios arbitrarios.

**Trabajo concreto listo:**

- centralizar el cálculo en dominio/backend y no aceptar totales calculados por cliente;
- validar descuento no negativo y menor o igual al importe bruto;
- separar descuento de sobrescritura de precio y restringir esta última;
- conservar precio de lista histórico, descuento y precio/total neto;
- preparar configuración versionada de política sin fijar el porcentaje de ejemplo;
- exigir autorización adicional cuando la política finalmente lo defina.

**Dependencias:** política de máximo, T-20, T-31, RBAC y T-16 si cambia la base gravable.

**Criterios de aceptación comprobables:**

- el backend recalcula bruto, descuento e importe neto;
- un descuento superior al límite vigente se rechaza sin afectar venta, inventario ni caja;
- un usuario sin permiso no puede forzar precio o descuento mediante API;
- la venta conserva precio de lista y descuento históricos;
- el descuento aparece en el resultado de confirmación y queda disponible para comprobantes/reportes.

**Pruebas requeridas:** unitarias de límites y decimales; API por permisos; manipulación de payload; integración venta/inventario/caja; idempotencia; límites exactos y redondeo.

**Definition of Ready:**

- máximo o fórmula de descuento;
- alcance por línea, venta, producto, categoría o rol;
- valor, porcentaje o ambos;
- quién autoriza excepciones;
- relación con impuestos.

### T-20 — Registrar motivo y autorización del descuento

**Estado comprobado:** `NO INICIADO`. Solo existe una nota general de venta; no hay motivo asociado al descuento.

**Clasificación:** `CONFIRMADO`; `BLOQUEADO` parcialmente en formato/catálogo de motivos; `RECOMENDACIÓN` para registrar autorización.

**Historia:** Como administrador o auditor, quiero conocer el motivo y responsable de cada descuento, para explicar por qué una venta se realizó por debajo del precio de lista.

**Trabajo concreto:**

- agregar motivo asociado a la línea o a la venta según la política de T-19;
- exigirlo cuando el descuento sea mayor que cero;
- conservar actor que lo aplicó y, si aplica, actor que lo autorizó;
- almacenar snapshot del texto de motivo aunque se use un catálogo editable;
- incluir el motivo en auditoría y consultas internas, respetando la decisión sobre mostrarlo en comprobante.

**Dependencias:** T-19, auditoría y RBAC.

**Criterios de aceptación comprobables:**

- descuento positivo sin motivo es rechazado;
- venta sin descuento no exige motivo;
- el motivo y autorizador quedan asociados de manera inequívoca al descuento;
- editar o inactivar un motivo del catálogo no cambia ventas históricas;
- la anulación conserva el historial original del descuento.

**Pruebas requeridas:** dominio; DTO/API; auditoría; persistencia histórica; permisos de autorización; regresión de ventas sin descuento.

**Definition of Ready:** confirmar catálogo vs. texto libre, obligatoriedad de comentario adicional, visibilidad en comprobante y nivel línea/venta.

---

## 6. Caja, bancos y enrutamiento de pagos

### T-21 — Convertir Caja en auxiliar exclusivo de efectivo

**Estado comprobado:** `PARCIAL CON RIESGO`. Existe un libro de movimientos con saldo posterior, pero admite medios no efectivos y calcula el saldo leyendo el último movimiento sin bloqueo suficiente.

**Clasificación:** `CONFIRMADO` para que Caja represente efectivo físico; `REPORTADO` para mezcla y riesgo concurrente; `BLOQUEADO` en cantidad de cajas/turnos; `RECOMENDACIÓN` para cuenta de saldo bloqueable.

**Historia:** Como responsable de caja, quiero un auxiliar de efectivo con entradas, salidas y saldo reproducible, para conocer el dinero físico disponible.

**Trabajo concreto listo:**

- impedir movimientos no efectivos en Caja;
- definir signos/tipos y exponer Débito, Crédito y Saldo de forma inequívoca;
- reemplazar el cálculo basado en “última fila” por una estrategia concurrente segura;
- exigir concepto, referencia, actor y motivo para movimientos manuales;
- proteger anulaciones y correcciones mediante movimientos compensatorios, no edición/borrado;
- incorporar idempotencia a movimientos originados por operaciones críticas.

**Dependencias:** T-22 a T-24 y decisión de caja única vs. múltiples cajas/turnos.

**Criterios de aceptación comprobables:**

- venta o cobro en efectivo aumenta Caja exactamente una vez;
- transferencia o tarjeta no crea ni modifica saldo de Caja;
- egreso superior al efectivo disponible se rechaza de forma atómica;
- movimientos simultáneos producen un saldo serializado correcto;
- anulación crea compensación y conserva el historial;
- el auxiliar por periodo reconcilia saldo inicial + débitos − créditos = saldo final.

**Pruebas requeridas:** concurrencia PostgreSQL real; idempotencia; ingresos/egresos; rechazo por saldo; anulaciones; consulta por periodo; pruebas de que transferencias no afectan Caja.

**Definition of Ready:** confirmar caja general o por sede/terminal/usuario/turno; apertura, base inicial, arqueo y cierre; política ante caja negativa.

### T-22 — Crear auxiliar de bancos

**Estado comprobado:** `NO INICIADO`. No existen modelos, repositorios o endpoints bancarios.

**Clasificación:** `CONFIRMADO`; `RECOMENDACIÓN` para libro inmutable y saldos por cuenta.

**Historia:** Como responsable financiero, quiero registrar transferencias y movimientos bancarios separados de Caja, para conocer el saldo de cada cuenta sin confundirlo con efectivo.

**Trabajo concreto:**

- crear agregado de movimientos bancarios por cuenta;
- registrar fecha efectiva, concepto, débito/crédito, saldo, referencia, actor y documento origen;
- implementar saldo concurrente seguro por cuenta;
- prohibir edición/borrado de movimientos confirmados y usar reversos;
- integrar idempotencia y auditoría;
- exponer consulta filtrada por cuenta y periodo.

**Dependencias:** T-23, T-24 y política de saldos iniciales/conciliación.

**Criterios de aceptación comprobables:**

- una transferencia recibida aumenta solo la cuenta bancaria seleccionada;
- una salida bancaria disminuye solo esa cuenta;
- operaciones concurrentes mantienen saldo correcto;
- cada movimiento conserva documento y operación origen;
- reversos dejan trazabilidad y restituyen el saldo esperado.

**Pruebas requeridas:** migración; restricciones/FK; concurrencia por misma y distinta cuenta; API; idempotencia; reversos; filtros de fecha.

**Definition of Ready:** confirmar si el saldo será contable, disponible o ambos; fecha de movimiento vs. fecha bancaria; manejo de comisiones, tarjetas, transferencias entre cuentas y conciliación.

### T-23 — Crear catálogo de cuentas bancarias

**Estado comprobado:** `NO INICIADO`.

**Clasificación:** `CONFIRMADO`; `BLOQUEADO` parcialmente en datos y permisos; `RECOMENDACIÓN` para no almacenar credenciales bancarias.

**Historia:** Como administrador, quiero registrar las cuentas bancarias operativas, para seleccionar el destino u origen de cada movimiento.

**Trabajo concreto:**

- modelar entidad bancaria con nombre visible, entidad, tipo, identificador enmascarado, estado y moneda si aplica;
- impedir eliminación física si tiene movimientos;
- definir permiso administrativo de creación/edición/inactivación;
- soportar varias cuentas activas y una cuenta predeterminada solo si el negocio lo solicita;
- no almacenar claves, tokens ni credenciales bancarias.

**Dependencias:** RBAC y T-22.

**Criterios de aceptación comprobables:**

- pueden existir varias cuentas activas con identificador único según política;
- una cuenta con movimientos solo puede inactivarse;
- un movimiento nuevo no puede usar una cuenta inactiva;
- usuarios no administrativos no modifican el catálogo;
- la API no expone información sensible.

**Pruebas requeridas:** esquema e índices; CRUD autorizado; unicidad; inactivación con historial; rechazo de cuenta inactiva; serialización segura.

**Definition of Ready:** confirmar datos visibles, moneda, unicidad, cuenta predeterminada y roles que administran/consultan.

### T-24 — Enrutar movimientos por medio de pago

**Estado comprobado:** `NO INICIADO / RIESGO CRÍTICO`. Solo la venta en efectivo crea Caja; transferencias y tarjetas no crean movimiento financiero; venta a crédito no está en el contrato. Abonos y pagos por transferencia se registran erróneamente en Caja.

**Clasificación:** `CONFIRMADO`; `REPORTADO` para la implementación inconsistente; `BLOQUEADO` en crédito, tarjetas y pagos mixtos.

**Historia:** Como responsable financiero, quiero que cada cobro o pago afecte exactamente el auxiliar correspondiente, para que efectivo, bancos y cartera sean consistentes.

**Trabajo concreto listo:**

- crear un enrutador de pagos en capa de aplicación, dentro de la misma transacción del caso de uso;
- efectivo → Caja; transferencia → Banco seleccionado; crédito → Cuenta por cobrar;
- aplicar la misma regla a ventas, abonos, compras de contado y pagos de obligaciones;
- corregir los servicios de cartera y cuentas por pagar para no escribir transferencias en Caja;
- agregar idempotencia a cobros y pagos;
- implementar reversos simétricos en anulaciones.

**Dependencias:** T-21 a T-23, T-26, T-27 y políticas de crédito/tarjetas.

**Criterios de aceptación comprobables:**

- una venta de $50.000 por transferencia deja Caja sin cambio y suma $50.000 al banco elegido;
- una venta a crédito no cambia Caja/Banco y crea una cuenta por cobrar por el saldo;
- un abono por transferencia reduce cartera y aumenta Banco en la misma transacción;
- un pago a proveedor por transferencia reduce cuenta por pagar y Banco, no Caja;
- reintentos no duplican venta, pago ni movimientos;
- una anulación revierte todos los efectos originales sin borrar historial.

**Pruebas requeridas:** matriz de medios × operación; integración PostgreSQL transaccional; fallos intermedios; concurrencia; idempotencia; anulaciones; permisos.

**Definition of Ready:**

- autorizar y definir venta a crédito, vencimiento, cupo y pagos parciales;
- confirmar pagos mixtos;
- definir tarjeta débito/crédito: cuenta destino, fecha de reconocimiento y comisiones;
- confirmar cuenta bancaria obligatoria para transferencia;
- definir reverso cuando el dinero ya fue conciliado.

### T-25 — Normalizar filtros Desde/Hasta

**Estado comprobado:** `PARCIAL`. Existen filtros en varios módulos, con nombres y tratamiento del límite final no uniformes. Bancos no existe.

**Clasificación:** `CONFIRMADO`; `REPORTADO` para inconsistencias; `RECOMENDACIÓN` para contrato transversal.

**Historia:** Como usuario financiero, quiero consultar operaciones entre dos fechas inclusivas, para analizar cualquier periodo de manera consistente.

**Trabajo concreto:**

- definir semántica común de `fromDate`/`toDate`, zona horaria y límites inclusivos;
- validar formato y que Desde no sea posterior a Hasta;
- aplicar el contrato a compras, ventas, Caja, Bancos, Kardex, cartera, cuentas por pagar y reportes;
- filtrar por la fecha de negocio apropiada, no siempre por `createdAt`;
- agregar índices solo después de confirmar las consultas.

**Dependencias:** T-22 y definición de fechas contables/operativas.

**Criterios de aceptación comprobables:**

- el periodo incluye todas las operaciones del día Hasta en la zona horaria oficial;
- rango inválido devuelve `400`;
- todos los módulos documentan qué fecha filtran;
- resultados paginados y totales usan exactamente el mismo filtro;
- filtros equivalentes producen periodos coherentes entre auxiliares y reportes.

**Pruebas requeridas:** límites de medianoche, zona horaria, cambio de mes/año, rango de un día, paginación y totales, validación API.

**Definition of Ready:** confirmar zona horaria oficial y, por módulo, fecha de emisión, recepción, vencimiento, movimiento o contabilización que debe gobernar el filtro.

---

## 7. Cartera y obligaciones

### T-26 — Completar Cuentas por Cobrar

**Estado comprobado:** `PARCIAL`. Existen modelo, consultas, pagos parciales, saldo, estado y bloqueo pesimista. No se encontró creación automática desde venta porque no existe venta a crédito; los abonos no tienen idempotencia y se enrutan siempre a Caja.

**Clasificación:** `CONFIRMADO` para conservar el módulo; `REPORTADO` para brechas; `BLOQUEADO` en política de crédito.

**Historia:** Como responsable de cartera, quiero que una venta a crédito cree una cuenta por cobrar y que cada abono reduzca su saldo, para conocer cartera vigente e histórica.

**Trabajo concreto listo:**

- integrar creación de la cuenta por cobrar en la transacción de venta;
- conservar valor inicial, pagos, saldo, vencimiento, estado y origen;
- agregar idempotencia a abonos;
- enrutar el pago por T-24;
- definir reverso de venta y de abono sin borrar movimientos;
- garantizar que un pago no exceda el saldo salvo política expresa.

**Dependencias:** T-24, política de crédito, clientes y ventas.

**Criterios de aceptación comprobables:**

- confirmar una venta a crédito crea una sola cuenta por cobrar ligada a la venta;
- un abono reduce saldo y cambia estado en la misma transacción;
- efectivo, transferencia y otros medios afectan el auxiliar correcto;
- dos abonos concurrentes no superan el saldo;
- reintentar un abono no duplica pago ni movimiento financiero;
- anular una venta con cartera aplica el reverso definido y conserva trazabilidad.

**Pruebas requeridas:** integración venta-crédito; concurrencia PostgreSQL; idempotencia; pago total/parcial/excesivo; routing por medio; anulación; filtros y mora.

**Definition of Ready:** autorización, cupo, vencimiento, pagos mixtos, intereses, descuentos por pago, tratamiento de sobrepagos y anulación con abonos existentes.

### T-27 — Completar Cuentas por Pagar y otras obligaciones

**Estado comprobado:** `PARCIAL`. Cada compra crea una cuenta por pagar y existen pagos parciales con bloqueo. Solo cubre compras a proveedor; una compra de contado se marca pagada sin registrar egreso y transferencias descuentan Caja.

**Clasificación:** `CONFIRMADO` para obligaciones causadas y pagos separados; `REPORTADO` para brechas; `BLOQUEADO` parcialmente para obligaciones no comerciales.

**Historia:** Como responsable financiero, quiero registrar una obligación al causarse y sus pagos por separado, para conocer lo pendiente independientemente de cuándo salga el dinero.

**Trabajo concreto listo:**

- corregir creación de obligación de compra y conservar condición original;
- registrar pago de contado en el auxiliar financiero correspondiente;
- agregar idempotencia y routing T-24 a pagos;
- implementar reversos y bloqueo concurrente;
- mantener historial de obligación, pagos y saldo.

**Dependencias:** T-13, T-21 a T-24 y T-30.

**Criterios de aceptación comprobables:**

- compra a crédito crea obligación pendiente por el neto acordado;
- compra de contado registra obligación y pago o el modelo equivalente acordado, sin perder trazabilidad;
- pago reduce saldo y auxiliar correcto de forma atómica;
- dos pagos concurrentes no exceden el saldo;
- la condición original no cambia al pagar;
- reintentos no duplican pagos.

**Pruebas requeridas:** compra contado/crédito; pagos parciales/totales/excesivos; efectivo/transferencia; concurrencia; idempotencia; reversos; historial.

**Definition of Ready:** confirmar si servicios y otras obligaciones comparten este agregado o usan uno distinto; tratamiento de anticipos, notas crédito, retenciones y pagos sin factura.

---

## 8. Estados financieros y gastos

### T-28 — Estado de Situación Financiera a una fecha

**Estado comprobado:** `BLOQUEADO / NO INICIADO`. No existe modelo o reporte contable. Caja y bancos aún no son confiables, el costo de inventario no es histórico y patrimonio no está definido.

**Clasificación:** `CONFIRMADO` para el reporte general; `BLOQUEADO` para modelo contable y saldos iniciales; `RECOMENDACIÓN` para construirlo después de auxiliares confiables.

**Historia pendiente:** Como contadora, quiero consultar activos, pasivos y patrimonio a una fecha, para conocer la situación financiera reconstruida del negocio.

**Trabajo permitido antes de la definición:** elaborar un mapa de fuentes y brechas para Caja, Bancos, Inventario, Cartera, Cuentas por Pagar, Capital y Resultado. No crear plan contable definitivo.

**Dependencias:** T-21 a T-27, T-29, método de costo, saldos iniciales y validación contable.

**Criterios de aceptación preliminares, sujetos a validación:**

- el reporte se reconstruye a la fecha solicitada y no usa solo saldos actuales;
- activos = pasivos + patrimonio bajo el modelo aprobado;
- cada cifra tiene trazabilidad hasta auxiliares/documentos;
- operaciones anuladas o revertidas se reflejan correctamente;
- la consulta no modifica datos.

**Pruebas requeridas cuando esté lista:** escenarios contables cerrados; corte de fecha; saldos iniciales; anulaciones; conciliación entre auxiliares y estado; precisión decimal.

**Definition of Ready:** estructura mínima de cuentas, saldos iniciales, tratamiento de inventario, capital y resultados acumulados, fecha de corte, alcance de Propiedad Planta y Equipo y aprobación formal de la contadora.

### T-29 — Estado de Resultados por periodo

**Estado comprobado:** `BLOQUEADO / NO INICIADO`. No existe P&G ni costo de venta histórico confiable; ventas no guardan el costo aplicado y no hay módulo de gastos.

**Clasificación:** `CONFIRMADO` para ingreso − descuentos/devoluciones − costo − gastos; `BLOQUEADO` para método de costo y clasificación contable.

**Historia pendiente:** Como contadora, quiero consultar ingresos, descuentos, devoluciones, costo y gastos de un periodo, para obtener utilidad o pérdida reproducible.

**Trabajo permitido antes de la definición:** preparar un spike de costo histórico y mapa de eventos fuente. No publicar utilidad como cifra contable todavía.

**Dependencias:** T-15, T-16, T-19, T-20, T-24, T-30, T-31 y método de costo.

**Criterios de aceptación preliminares, sujetos a validación:**

- incluye todas las ventas válidas del periodo sin depender del medio de pago;
- excluye o presenta separadamente anulaciones y devoluciones según política;
- separa venta bruta, descuentos, venta neta, costo y gastos;
- el costo aplicado queda congelado y puede auditarse hasta la salida de inventario;
- el resultado coincide con un escenario aprobado por la contadora.

**Pruebas requeridas cuando esté lista:** ventas contado/transferencia/crédito; descuentos; anulaciones; devoluciones; costo por lotes/capas; gasto causado no pagado; cortes de periodo y precisión decimal.

**Definition of Ready:** método de costo — específico por lote, promedio ponderado, PEPS u otro—; momento de reconocimiento; tratamiento de devoluciones, impuestos, descuentos, mermas y diferencias de inventario; clasificación de gastos.

### T-30 — Registrar gasto causado separado de su pago

**Estado comprobado:** `NO INICIADO`. `Payable` exige una compra y proveedor; no existe entidad de gasto u obligación general.

**Clasificación:** `CONFIRMADO` para separar causación y pago; `BLOQUEADO` para datos y clasificación; `RECOMENDACIÓN` para integrar obligación y auxiliar financiero sin duplicar conceptos.

**Historia pendiente:** Como responsable contable, quiero registrar un gasto cuando se causa y pagarlo posteriormente, para que el resultado y las obligaciones no dependan de la fecha de salida del dinero.

**Trabajo concreto después del DoR:**

- modelar gasto/documento y obligación asociada sin forzar una compra de inventario;
- registrar fecha de causación, tercero, concepto/categoría, valor, vencimiento, soporte y estado;
- separar el caso de uso de registrar gasto del caso de uso de pagar;
- enrutar el pago por T-24 dentro de una transacción;
- conservar pagos parciales, saldo, reversos, actor y auditoría;
- agregar idempotencia.

**Dependencias:** T-16, T-22 a T-24, T-27 y T-29.

**Criterios de aceptación comprobables:**

- registrar un gasto pendiente aumenta gasto del periodo y obligación, sin reducir Caja/Banco;
- pagar reduce obligación y el auxiliar seleccionado, sin duplicar el gasto;
- pagos parciales conservan saldo correcto;
- reversos no borran historial;
- reintentos no duplican gasto, obligación ni pago.

**Pruebas requeridas:** causación; pago parcial/total; efectivo/transferencia; idempotencia; concurrencia; reversos; corte de periodo; permisos y adjuntos si se confirman.

**Definition of Ready:** tercero obligatorio u opcional, categorías, documentos soporte, impuestos/retenciones, vencimiento, aprobaciones, adjuntos, gastos recurrentes y alcance de otras obligaciones.

### T-31 — Integrar descuentos de venta con Estado de Resultados

**Estado comprobado:** `PARCIAL DE DATOS`. Venta y líneas guardan descuento, pero el reporte de ventas no lo presenta y no existe Estado de Resultados. No hay motivo ni política de autorización.

**Clasificación:** `CONFIRMADO` para mostrar bruto, descuento y neto; `REPORTADO` para soporte parcial; `BLOQUEADO` hasta T-19, T-20 y T-29.

**Historia:** Como contadora, quiero ver descuentos como disminución separada del ingreso, para que el precio histórico no sea sobrescrito y la venta neta sea auditable.

**Trabajo concreto listo:**

- preservar precio de lista, importe bruto, descuento y neto en cada línea y venta;
- eliminar la dependencia de `unitPriceOverride` como mecanismo silencioso de descuento;
- exponer agregados de bruto, descuentos y neto por periodo;
- excluir anulaciones y aplicar devoluciones según política;
- enlazar cada descuento con motivo y autorización de T-20;
- integrar el resultado en T-29 una vez aprobado el modelo.

**Dependencias:** T-19, T-20, T-29 y T-16.

**Criterios de aceptación comprobables:**

- una venta bruta de $50.000 con descuento de $2.000 conserva ambos valores y neto de $48.000;
- editar precios futuros no altera la venta histórica;
- el total de descuentos del periodo coincide con la suma de ventas válidas;
- ventas anuladas no aportan ingreso ni descuento neto;
- cada descuento puede rastrearse a línea/venta, motivo y actor.

**Pruebas requeridas:** cálculos decimales; agregación por periodo; anulaciones; múltiples líneas; cambios posteriores de precio; integración con motivo/autorización y P&G.

**Definition of Ready:** cerrar T-19, T-20, T-29 y definir tratamiento contable de devoluciones e impuestos.

---

## 9. Riesgos transversales que deben convertirse en tareas técnicas

### R-01 — Eliminar coma flotante para dinero

**Clasificación:** `REPORTADO` y obligatorio por reglas del proyecto.

Aunque PostgreSQL usa `Decimal`, ventas, compras, caja, cartera y reportes convierten importes a `number` y calculan con `Math.round()`/`toFixed()`. Antes de ampliar contabilidad se debe adoptar una representación decimal exacta o unidades monetarias menores en dominio y contratos, con una única política de redondeo.

**Pruebas mínimas:** sumas repetidas, descuentos porcentuales, distribución de centavos, pagos parciales y conciliación exacta.

### R-02 — Costo histórico de inventario y venta

**Clasificación:** `BLOQUEADO` por método de costeo.

`Product.baseCost` es mutable, `SaleLine` no conserva costo aplicado y `SaleLotAllocation` no conserva una capa o costo. Un mismo lote puede recibir varias compras a costos distintos. T-28 y T-29 no deben comenzar hasta definir y persistir el costo reproducible de cada salida.

### R-03 — Idempotencia de operaciones financieras

**Clasificación:** `RECOMENDACIÓN` de integridad necesaria.

Extender el patrón de idempotencia a recepción de compra, abonos, pagos, gastos y movimientos bancarios. La clave debe adquirirse de forma concurrente segura y vincularse a actor, endpoint y hash de solicitud.

### R-04 — Consecutivos y saldos concurrentes

**Clasificación:** `REPORTADO` y `RECOMENDACIÓN`.

El comprobante usa `count() + 1` y Caja deriva saldo desde la última fila. Ambos patrones fallan bajo concurrencia. Crear contadores o secuencias y agregados de saldo bloqueables, manteniendo los libros de movimientos inmutables.

### R-05 — Errores actuales de reportes que afectan contabilidad

**Clasificación:** `REPORTADO`.

- el reporte de ventas compara contra `ANULADA`, mientras el estado real es `CANCELLED`, e incluye anulaciones;
- el reporte de Caja no reconoce `INGRESO_VENTA` ni `INGRESO_MANUAL` como ingresos;
- no usar esos reportes como fuente contable hasta corregirlos y cubrirlos con pruebas de regresión.

---

## 10. Orden de ejecución recomendado

1. T-04 y T-05: permisos finos y correcciones auditadas.
2. Resolver DoR de T-08 y ejecutar T-08.
3. Diseñar y ejecutar T-09.
4. Consolidar T-13 y T-14 sobre el nuevo modelo.
5. Resolver T-21 a T-24 y después T-25.
6. Completar T-26 y T-27 con routing e idempotencia.
7. Resolver con cliente/contadora T-15, T-16, T-19 y T-20.
8. Implementar descuentos controlados y T-31.
9. Resolver método de costo y política de gastos.
10. Implementar T-30 y solo entonces T-28/T-29.

T-15, T-16, T-28, T-29 y T-30 no deben pasar a `LISTO` sin sus Definitions of Ready. T-19, T-20, T-21, T-24, T-26 y T-27 tienen trabajo técnico preparatorio, pero su cierre funcional depende de decisiones expresamente señaladas.

## 11. Preguntas consolidadas para el cliente y la contadora

1. ¿La unidad base siempre es entera o peso/volumen requieren decimales? ¿Con qué precisión?
2. ¿El inventario de artículos sin lote se controla por ubicación?
3. ¿Puede cambiarse un producto de loteado a no loteado con historial o existencias?
4. ¿Qué normalización aplica a documentos de cliente y NIT?
5. ¿La factura de compra es única por proveedor? ¿Qué documentos pueden repetirse?
6. ¿Cómo se trata el descuento de compra y en qué orden se calcula frente a impuestos?
7. ¿Cuál es la responsabilidad tributaria y qué impuestos aplican a cada producto/operación?
8. ¿Cuál es el máximo de descuento de venta, quién autoriza excepciones y qué motivo se exige?
9. ¿Existe una caja general o cajas por usuario, terminal, turno o sede?
10. ¿Qué cuentas bancarias se usarán y cómo se tratan tarjetas, comisiones y conciliación?
11. ¿Se permiten pagos mixtos?
12. ¿Cómo se autoriza una venta a crédito, cuál es su vencimiento y se manejan cupos/intereses?
13. ¿Cómo se reversa una venta o pago cuando ya hubo abonos o conciliación bancaria?
14. ¿Cuál es el método de costeo de inventario y costo de venta?
15. ¿Qué datos, categorías, aprobaciones y soportes requiere un gasto causado?
16. ¿Qué saldos iniciales y estructura mínima de cuentas aprueba la contadora para los estados financieros?

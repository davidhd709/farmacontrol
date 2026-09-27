# Levantamiento de requerimientos — Sistema para farmacia

**Versión:** 0.1  
**Fuente:** información inicial suministrada por el cliente.  
**Estado:** levantamiento preliminar sujeto a validación.

No se incluyen tecnologías, infraestructura, modelo físico de datos ni arquitectura técnica.

## 1. Contexto del proyecto

### Confirmado

El cliente requiere un sistema para apoyar la operación de una farmacia, incluyendo:

- Administración de productos y categorías.
- Control de inventario.
- Manejo de productos por unidad, caja y blíster.
- Control por lotes y fechas de vencimiento.
- Alertas de vencimiento.
- Salida de medicamentos mediante FEFO.
- Compras y proveedores.
- Ventas y clientes.
- Cuentas por cobrar y por pagar.
- Caja.
- Usuarios y permisos.
- Movimientos de inventario.
- Reportes básicos.
- Copias de seguridad.
- Facturación electrónica DIAN en una fase posterior.

### Pendiente

No se conoce todavía:

- Cómo funciona actualmente la farmacia.
- Si existen una o varias sedes, bodegas o cajas.
- Volumen aproximado de productos, ventas y usuarios.
- Perfiles concretos de los usuarios.
- Procesos de compras, ventas, cartera y caja.
- Requerimientos regulatorios adicionales para medicamentos.
- Sistemas o datos existentes que deban migrarse.

## 2. Objetivo del sistema

### Propuesta para validación

Centralizar el control operativo y administrativo de la farmacia, permitiendo conocer las existencias por producto, presentación y lote; controlar vencimientos; realizar compras y ventas; administrar proveedores, clientes, cartera y caja; y conservar trazabilidad de los movimientos realizados por los usuarios.

## 3. Alcance funcional confirmado

El alcance inicial comprende los siguientes módulos:

1. Productos y categorías.
2. Presentaciones y equivalencias.
3. Inventario.
4. Lotes y vencimientos.
5. Alertas de vencimiento.
6. Compras.
7. Proveedores.
8. Ventas.
9. Clientes.
10. Cuentas por cobrar.
11. Cuentas por pagar.
12. Caja.
13. Usuarios y permisos.
14. Movimientos de inventario.
15. Reportes.
16. Copias de seguridad.
17. Integración futura con facturación electrónica DIAN.

## 4. Actores

Los roles definitivos no fueron especificados. Se propone validar los siguientes actores:

| Actor provisional | Responsabilidad esperada | Estado |
|---|---|---|
| Administrador | Configuración, usuarios, permisos y supervisión general | Pendiente |
| Vendedor o cajero | Registro de ventas, recaudos y operaciones de caja | Pendiente |
| Encargado de inventario | Productos, lotes, vencimientos y movimientos | Pendiente |
| Encargado de compras | Compras y proveedores | Pendiente |
| Encargado de cartera | Cuentas por cobrar y pagos de clientes | Pendiente |
| Encargado de pagos | Cuentas por pagar y pagos a proveedores | Pendiente |
| Supervisor o propietario | Consulta de reportes y control del negocio | Pendiente |
| DIAN | Servicio externo para facturación electrónica | Confirmado como futuro |

Los clientes y proveedores están confirmados como información administrada por el sistema, pero no se ha indicado que tengan acceso directo.

## 5. Requerimientos funcionales

### RF-001 — Administración de categorías

**Descripción:** El sistema debe permitir registrar, consultar y actualizar la información de las categorías utilizadas para organizar los productos.

**Actor:** Usuario autorizado.  
**Origen:** Cliente.

### RF-002 — Administración de productos

**Descripción:** El sistema debe permitir registrar, consultar y actualizar productos, asociándolos con una categoría.

**Actor:** Usuario autorizado.  
**Origen:** Cliente.

Los atributos específicos del producto están pendientes de definición.

### RF-003 — Manejo por presentación

**Descripción:** El sistema debe permitir realizar operaciones con productos manejados por unidad, caja y blíster.

**Actor:** Usuarios de inventario, compras y ventas.  
**Origen:** Cliente.

La definición de equivalencias y las presentaciones aplicables a cada producto están pendientes.

### RF-004 — Equivalencias entre presentaciones

**Descripción:** El sistema debe disponer de la información necesaria para convertir correctamente entre caja, blíster y unidad cuando un producto permita estas presentaciones.

**Actor:** Usuario autorizado.  
**Origen:** Derivado del requisito de manejo por unidad, caja y blíster; debe validarse con el cliente.

### RF-005 — Control de inventario

**Descripción:** El sistema debe permitir consultar y controlar las existencias de los productos.

**Actor:** Usuario autorizado.  
**Origen:** Cliente.

Está pendiente definir si las existencias se controlarán por sede, bodega, ubicación y presentación.

### RF-006 — Control por lotes

**Descripción:** El sistema debe identificar las existencias de medicamentos por lote.

**Actor:** Usuario autorizado.  
**Origen:** Cliente.

### RF-007 — Registro de fechas de vencimiento

**Descripción:** El sistema debe asociar a cada lote la fecha de vencimiento correspondiente.

**Actor:** Usuario autorizado.  
**Origen:** Cliente.

### RF-008 — Alertas de vencimiento

**Descripción:** El sistema debe identificar y alertar sobre lotes próximos a vencer.

**Actor:** Usuarios autorizados.  
**Origen:** Cliente.

El tiempo de anticipación, los destinatarios y el medio de presentación de las alertas están pendientes.

### RF-009 — Aplicación de FEFO

**Descripción:** Durante la salida de medicamentos, el sistema debe priorizar el lote disponible cuya fecha de vencimiento sea la más próxima.

**Actor:** Usuario que registra la salida o venta.  
**Prioridad:** Alta, debido a que fue definida como regla obligatoria.  
**Origen:** Cliente.

### RF-010 — Registro de proveedores

**Descripción:** El sistema debe permitir administrar la información de los proveedores.

**Actor:** Usuario autorizado.  
**Origen:** Cliente.

### RF-011 — Registro de compras

**Descripción:** El sistema debe permitir registrar las compras realizadas a proveedores.

**Actor:** Encargado de compras.  
**Origen:** Cliente.

Está pendiente determinar el proceso de recepción, aprobación, anulación y afectación del inventario.

### RF-012 — Ingreso de lotes desde compras

**Descripción:** El sistema debe permitir relacionar los productos recibidos con sus lotes y fechas de vencimiento.

**Actor:** Encargado de compras o inventario.  
**Origen:** Derivado de compras y control por lotes; requiere validación.

### RF-013 — Registro de clientes

**Descripción:** El sistema debe permitir administrar la información de los clientes.

**Actor:** Usuario autorizado.  
**Origen:** Cliente.

Está pendiente determinar cuándo será obligatorio identificar al cliente.

### RF-014 — Registro de ventas

**Descripción:** El sistema debe permitir registrar ventas de productos en las presentaciones permitidas.

**Actor:** Vendedor o cajero.  
**Origen:** Cliente.

### RF-015 — Afectación de inventario por venta

**Descripción:** Una venta confirmada debe generar la salida correspondiente del inventario, respetando las equivalencias de presentación y la regla FEFO para medicamentos.

**Actor:** Vendedor o cajero.  
**Origen:** Derivado de ventas, inventario y FEFO; requiere validación del momento exacto de afectación.

### RF-016 — Cuentas por cobrar

**Descripción:** El sistema debe permitir registrar y consultar cuentas por cobrar.

**Actor:** Usuario autorizado.  
**Origen:** Cliente.

Quedan pendientes el origen de las cuentas, los vencimientos, los abonos y las condiciones de crédito.

### RF-017 — Registro de recaudos

**Descripción:** El sistema debe permitir aplicar pagos o abonos a las cuentas por cobrar.

**Actor:** Usuario autorizado.  
**Origen:** Derivado del manejo de cuentas por cobrar; requiere confirmación.

### RF-018 — Cuentas por pagar

**Descripción:** El sistema debe permitir registrar y consultar cuentas por pagar.

**Actor:** Usuario autorizado.  
**Origen:** Cliente.

Quedan pendientes el origen de las obligaciones, vencimientos, pagos parciales y condiciones acordadas con proveedores.

### RF-019 — Registro de pagos a proveedores

**Descripción:** El sistema debe permitir aplicar pagos o abonos a las cuentas por pagar.

**Actor:** Usuario autorizado.  
**Origen:** Derivado del manejo de cuentas por pagar; requiere confirmación.

### RF-020 — Control de caja

**Descripción:** El sistema debe permitir controlar las operaciones de caja relacionadas con la actividad de la farmacia.

**Actor:** Cajero y usuarios autorizados.  
**Origen:** Cliente.

La apertura, cierre, base, arqueo, retiros, ingresos y manejo de turnos todavía no están definidos.

### RF-021 — Administración de usuarios

**Descripción:** El sistema debe permitir registrar, actualizar, activar y desactivar usuarios internos.

**Actor:** Administrador.  
**Origen:** Cliente; detalle operativo propuesto para validación.

### RF-022 — Administración de permisos

**Descripción:** El sistema debe restringir las funciones y la información de acuerdo con los permisos asignados a cada usuario o rol.

**Actor:** Administrador.  
**Origen:** Cliente.

La matriz de permisos está pendiente.

### RF-023 — Registro de movimientos de inventario

**Descripción:** El sistema debe conservar un historial de entradas, salidas y demás movimientos que afecten el inventario.

**Actor:** Usuarios autorizados.  
**Origen:** Cliente.

Los tipos exactos de movimiento están pendientes.

### RF-024 — Consulta de trazabilidad de inventario

**Descripción:** El sistema debe permitir consultar los movimientos relacionados con un producto y, cuando corresponda, con un lote.

**Actor:** Usuario autorizado.  
**Origen:** Derivado del control de movimientos y lotes; requiere validación.

### RF-025 — Reportes básicos

**Descripción:** El sistema debe generar reportes básicos relacionados con la operación de la farmacia.

**Actor:** Usuarios autorizados.  
**Origen:** Cliente.

El contenido, los filtros, la periodicidad y los formatos de salida deben definirse.

### RF-026 — Copias de seguridad

**Descripción:** El sistema debe permitir realizar copias de seguridad de la información necesaria para recuperar la operación.

**Actor:** Administrador o responsable autorizado.  
**Origen:** Cliente.

La frecuencia, conservación, ubicación y procedimiento de restauración están pendientes.

### RF-027 — Facturación electrónica DIAN

**Descripción:** En una fase posterior, el sistema deberá integrarse con el proceso de facturación electrónica exigido por la DIAN.

**Actor:** Usuario facturador y servicio externo DIAN.  
**Prioridad:** Fase posterior.  
**Origen:** Cliente.

El alcance tributario y documental de esta integración todavía no está definido.

## 6. Reglas de negocio

### Confirmadas

#### RN-001 — Aplicación de FEFO

Para la salida de medicamentos debe seleccionarse primero el lote disponible con la fecha de vencimiento más próxima.

#### RN-002 — Identificación del lote

Las existencias sujetas a control por lote deben conservar su número de lote y fecha de vencimiento.

#### RN-003 — Presentaciones de producto

El sistema debe contemplar el manejo por unidad, caja y blíster.

### Reglas propuestas para validación

#### RN-004 — Equivalencia por producto

Cada producto debería definir sus propias equivalencias, debido a que la cantidad de blísteres por caja y unidades por blíster puede variar.

#### RN-005 — Fraccionamiento

Una salida en caja, blíster o unidad debería descontarse usando una unidad base común, conservando la presentación comercial de la operación.

#### RN-006 — Lotes vencidos

Se recomienda impedir la venta de medicamentos vencidos y separarlos del inventario disponible. Esta regla no ha sido confirmada.

#### RN-007 — Excepción a FEFO

Debe definirse si un usuario puede ignorar la selección FEFO y, de permitirse, qué permiso y justificación se requieren.

#### RN-008 — Inventario negativo

Debe definirse si el sistema prohibirá operaciones que produzcan existencias negativas.

#### RN-009 — Trazabilidad

Se recomienda que todo movimiento conserve como mínimo fecha, usuario, producto, cantidad, lote cuando aplique, tipo de movimiento y documento de origen.

## 7. Requerimientos no funcionales

### RNF-001 — Control de acceso

El sistema debe permitir el acceso a las funciones únicamente cuando el usuario cuente con el permiso correspondiente.

**Estado:** Confirmado conceptualmente; matriz pendiente.

### RNF-002 — Recuperación mediante copias de seguridad

Debe existir un mecanismo verificable para respaldar y restaurar la información.

**Estado:** Confirmado conceptualmente; frecuencia, retención y tiempos de recuperación pendientes.

### RNF-003 — Trazabilidad de operaciones

Se recomienda conservar la identificación del usuario y la fecha de las operaciones sensibles, especialmente movimientos de inventario, ventas, compras, cartera, pagos y caja.

**Estado:** Recomendación pendiente de aprobación.

### Pendientes de cuantificación

No existen datos suficientes para establecer requisitos verificables de:

- Rendimiento.
- Disponibilidad.
- Cantidad de usuarios concurrentes.
- Capacidad de almacenamiento.
- Tiempo máximo de recuperación.
- Conservación histórica.
- Accesibilidad.
- Compatibilidad con dispositivos.
- Privacidad y tratamiento de datos personales.

## 8. Datos principales

Sin definir todavía tablas físicas, los conceptos principales son:

- Categoría.
- Producto.
- Presentación.
- Equivalencia entre presentaciones.
- Existencia de inventario.
- Lote.
- Fecha de vencimiento.
- Alerta de vencimiento.
- Proveedor.
- Compra y detalle de compra.
- Cliente.
- Venta y detalle de venta.
- Cuenta por cobrar.
- Abono o recaudo.
- Cuenta por pagar.
- Pago a proveedor.
- Operación de caja.
- Movimiento de inventario.
- Usuario.
- Rol.
- Permiso.
- Copia de seguridad.
- Documento electrónico DIAN, en fase posterior.

Relaciones generales:

- Un producto pertenece a una categoría.
- Un producto puede manejar una o varias presentaciones.
- Un producto puede tener varios lotes.
- Cada lote tiene una fecha de vencimiento.
- Las compras se relacionan con proveedores y productos.
- Las ventas se relacionan con productos y, cuando corresponda, clientes.
- Las salidas de medicamentos se relacionan con los lotes seleccionados mediante FEFO.
- Las operaciones pueden generar movimientos de inventario, caja y cartera.

## 9. Flujos principales

### Compra e ingreso de inventario

Usuario registra proveedor  
→ registra la compra y sus productos  
→ informa presentación, cantidad, lote y vencimiento cuando aplique  
→ confirma la recepción  
→ el sistema registra el movimiento de entrada  
→ se actualizan las existencias.

El momento de confirmación y la generación de cuentas por pagar deben validarse.

### Venta de medicamentos con FEFO

Usuario inicia la venta  
→ selecciona el producto y la presentación  
→ el sistema consulta existencias y lotes  
→ prioriza el lote con vencimiento más próximo  
→ usuario confirma la venta  
→ el sistema registra la salida y actualiza el inventario.

El tratamiento de lotes vencidos, cantidades insuficientes y excepciones a FEFO está pendiente.

### Alerta de vencimiento

El sistema consulta las fechas de vencimiento  
→ identifica lotes dentro del periodo de alerta  
→ presenta la alerta a los usuarios definidos.

El periodo, frecuencia y medio de notificación están pendientes.

### Cuenta por cobrar

Se origina una cuenta por cobrar  
→ se registra su saldo y vencimiento  
→ se registran pagos o abonos  
→ se actualiza el saldo.

El evento que origina la cuenta y sus estados deben confirmarse.

### Cuenta por pagar

Se origina una obligación con un proveedor  
→ se registra su saldo y vencimiento  
→ se registran pagos o abonos  
→ se actualiza el saldo.

La relación automática con las compras debe confirmarse.

### Operación de caja

Usuario inicia la operación de caja  
→ registra ventas, recaudos u otros movimientos autorizados  
→ consulta el saldo  
→ realiza el cierre o conciliación.

Este flujo es provisional porque el cliente aún no ha definido el funcionamiento de caja.

## 10. Roles y permisos

La matriz definitiva está pendiente. Debe determinarse quién puede:

- Consultar, crear y modificar productos.
- Modificar equivalencias.
- Registrar o corregir lotes.
- Registrar compras.
- Confirmar o anular compras.
- Registrar ventas.
- Aplicar excepciones a FEFO.
- Anular ventas.
- Registrar ajustes de inventario.
- Consultar costos y utilidades.
- Administrar cuentas por cobrar.
- Administrar cuentas por pagar.
- Registrar ingresos y egresos de caja.
- Abrir y cerrar caja.
- Consultar reportes.
- Administrar usuarios y permisos.
- Ejecutar y restaurar copias de seguridad.

No se confirma todavía la eliminación física de registros; se recomienda manejar anulaciones o inactivaciones para operaciones que requieran trazabilidad.

## 11. Estados pendientes de definición

Los procesos de negocio requieren estados, pero el cliente no los ha especificado. Deben acordarse al menos para:

- Productos.
- Lotes.
- Compras.
- Ventas.
- Cuentas por cobrar.
- Cuentas por pagar.
- Operaciones o turnos de caja.
- Usuarios.
- Alertas de vencimiento.

Estados como “borrador”, “confirmado”, “pagado”, “anulado” o “vencido” no se consideran confirmados en este levantamiento.

## 12. Integraciones

### Confirmada para fase posterior

- Facturación electrónica DIAN.

### Pendientes de confirmar

- Proveedor tecnológico de facturación electrónica.
- Equipos lectores de códigos de barras.
- Impresoras de recibos o facturas.
- Cajones monederos.
- Medios o pasarelas de pago.
- Correo, SMS u otros canales de alertas.
- Sistemas contables.
- Importación de datos desde un sistema actual.

## 13. Documentos y archivos

No se ha confirmado el manejo de archivos. Debe definirse si el sistema generará o almacenará:

- Comprobantes de venta.
- Órdenes o comprobantes de compra.
- Recibos de caja.
- Comprobantes de egreso.
- Notas crédito o devoluciones.
- Facturas electrónicas y sus representaciones gráficas.
- Exportaciones en PDF o Excel.
- Imágenes de productos.
- Soportes adjuntos de pagos y compras.

## 14. Reportes

“Reportes básicos” está confirmado, pero su alcance no está definido.

### Propuesta de reportes para validación

- Existencias actuales.
- Existencias por lote y vencimiento.
- Productos próximos a vencer.
- Historial de movimientos de inventario.
- Compras por periodo y proveedor.
- Ventas por periodo.
- Cuentas por cobrar y saldos.
- Cuentas por pagar y saldos.
- Movimientos o resumen de caja.

Para cada reporte deben acordarse:

- Objetivo.
- Columnas.
- Filtros.
- Usuarios autorizados.
- Formato de visualización o exportación.
- Necesidad de mostrar costos, precios o utilidad.

## 15. Criterios de aceptación iniciales

### CA-001 — Selección FEFO

**Dado que:** un medicamento tiene dos lotes disponibles con fechas de vencimiento diferentes.  
**Cuando:** se registra una salida del medicamento.  
**Entonces:** el sistema debe seleccionar primero el lote con la fecha de vencimiento más próxima.

### CA-002 — Prioridad continua de FEFO

**Dado que:** el lote con vencimiento más próximo aún tiene existencia disponible.  
**Cuando:** se registra una nueva salida del mismo medicamento.  
**Entonces:** el sistema no debe priorizar un lote con vencimiento posterior, salvo que exista una excepción autorizada que el cliente haya aprobado.

### CA-003 — Registro de lote

**Dado que:** se recibe un medicamento sujeto a control por lote.  
**Cuando:** se registra su ingreso.  
**Entonces:** el sistema debe conservar el lote y su fecha de vencimiento asociados a la existencia ingresada.

### CA-004 — Conversión de presentación

**Dado que:** un producto tiene definida una equivalencia entre caja, blíster y unidad.  
**Cuando:** se registra una entrada o salida en cualquiera de esas presentaciones.  
**Entonces:** el inventario debe reflejar la cantidad equivalente correcta.

### CA-005 — Permisos

**Dado que:** un usuario no cuenta con permiso para ejecutar una función.  
**Cuando:** intenta acceder a ella.  
**Entonces:** el sistema debe impedir la operación.

### CA-006 — Restauración de respaldo

**Dado que:** existe una copia de seguridad válida.  
**Cuando:** un usuario autorizado ejecuta el procedimiento de restauración.  
**Entonces:** la información respaldada debe poder recuperarse de forma verificable.

## 16. Propuesta de MVP

### Recomendación sujeta a aprobación

Debido a que el cliente no priorizó los módulos, se propone que la primera versión operativa incluya:

- Productos y categorías.
- Unidad, caja, blíster y equivalencias.
- Inventario.
- Lotes y vencimientos.
- Alertas de vencimiento.
- FEFO.
- Proveedores y compras.
- Clientes y ventas.
- Cuentas por cobrar y por pagar.
- Caja.
- Usuarios y permisos.
- Movimientos de inventario.
- Conjunto acordado de reportes básicos.
- Copias de seguridad y restauración.

Esta propuesta debe ajustarse después de conocer el proceso real y el presupuesto del cliente.

## 17. Fases posteriores

### Confirmado

- Facturación electrónica DIAN.

### Sin clasificar todavía

Cualquier otra funcionalidad deberá evaluarse después de responder las preguntas pendientes. No se asumen módulos contables, comercio electrónico, domicilios, nómina ni aplicaciones móviles.

## 18. Fuera del alcance de este levantamiento

- Selección de tecnologías.
- Diseño de arquitectura.
- Selección de base de datos.
- Infraestructura o alojamiento.
- Diseño físico de tablas.
- Diseño de APIs.
- Diseño detallado de interfaz.
- Estimación definitiva de costos y tiempos.

Esto no significa que esos trabajos estén excluidos del proyecto; pertenecen a etapas posteriores.

## 19. Dependencias funcionales

- **FEFO** depende de productos, inventario, lotes y vencimientos.
- **Alertas de vencimiento** dependen de lotes, fechas y existencias.
- **Ventas** dependen de productos, presentaciones, inventario y usuarios.
- **Compras** dependen de productos, proveedores y presentaciones.
- **Cuentas por cobrar** dependen de la definición del proceso de crédito y recaudo.
- **Cuentas por pagar** dependen de compras, proveedores y pagos.
- **Caja** depende de la definición de ventas, recaudos, pagos e ingresos o egresos.
- **Reportes** dependen de los datos y reglas acordados para cada módulo.
- **Facturación electrónica** depende de ventas, clientes, información tributaria y reglas DIAN.
- **Copias de seguridad** abarcan la información de todos los módulos.

## 20. Preguntas pendientes prioritarias

### Operación general

1. ¿La farmacia tiene una sola sede y bodega o necesita manejar varias ubicaciones?
2. ¿Cuántos usuarios y cajas operarán simultáneamente?
3. ¿Existe información en otro sistema que deba migrarse?

### Productos e inventario

4. ¿Qué datos debe tener cada producto: código interno, código de barras, registro sanitario, laboratorio, principio activo, concentración, precio, impuesto u otros?
5. ¿Todos los productos se controlan por lote y vencimiento o solamente los medicamentos?
6. ¿Las equivalencias de caja, blíster y unidad son diferentes para cada producto?
7. ¿Se permite vender unidades sueltas de todos los blísteres?
8. ¿Se permitirá inventario negativo?
9. ¿Se manejarán transferencias entre bodegas o sedes?
10. ¿Qué tipos de ajustes de inventario deben existir y quién puede realizarlos?

### FEFO y vencimientos

11. ¿FEFO debe ser obligatorio o el usuario puede seleccionar otro lote?
12. Si se permite una excepción, ¿qué usuarios pueden realizarla y debe registrarse una justificación?
13. Si el lote más próximo no cubre toda la cantidad, ¿la salida debe completarse automáticamente con el siguiente lote?
14. ¿Debe bloquearse la venta de productos vencidos?
15. ¿Con cuántos días o meses de anticipación debe generarse la alerta?
16. ¿A quién debe notificarse y dónde debe mostrarse?
17. ¿Cómo se gestionan productos vencidos: cuarentena, devolución al proveedor, baja o destrucción?

### Compras, ventas y devoluciones

18. ¿Cuándo una compra debe aumentar el inventario?
19. ¿Se necesitan órdenes de compra separadas de la recepción?
20. ¿Qué impuestos, descuentos, costos adicionales y formas de pago se manejan?
21. ¿Se permitirán anulaciones y devoluciones de compras y ventas?
22. ¿Qué comprobante se entregará antes de implementar facturación electrónica?
23. ¿Es obligatorio identificar al cliente en cada venta?
24. ¿Se manejan medicamentos de venta controlada o que requieran fórmula médica?

### Cartera y caja

25. ¿Cómo se autoriza una venta a crédito y cómo se define su vencimiento?
26. ¿Se permiten abonos parciales, intereses, cupos de crédito o descuentos por pago?
27. ¿Las cuentas por pagar se generan automáticamente desde las compras?
28. ¿Se manejarán varias cajas, cajeros o turnos?
29. ¿La caja requiere apertura, base inicial, cierre, arqueo, retiros e ingresos manuales?
30. ¿Cuáles medios de pago deben registrarse?

### Seguridad, reportes y respaldo

31. ¿Cuáles son los roles reales y qué permisos tendrá cada uno?
32. ¿Qué operaciones requieren autorización de un supervisor?
33. ¿Cuáles reportes son indispensables para iniciar operación?
34. ¿Los reportes deben exportarse o imprimirse?
35. ¿Cada cuánto deben realizarse las copias de seguridad?
36. ¿Cuánto tiempo deben conservarse y quién puede restaurarlas?

### DIAN

37. ¿En qué fase o fecha se espera implementar facturación electrónica?
38. ¿La farmacia ya cuenta con resolución de facturación, responsabilidades tributarias y proveedor tecnológico?
39. ¿La fase futura debe contemplar notas crédito, notas débito y documento equivalente electrónico?

Este levantamiento deja confirmada la necesidad funcional general, pero las preguntas anteriores deben resolverse antes de cerrar el alcance del MVP, elaborar estimaciones o iniciar el diseño técnico.

# Diseño UX/UI — Sistema para farmacia

**Versión:** 0.1  
**Fecha:** 18 de septiembre de 2026  
**Fuentes:** `levantamiento-requerimientos-farmacia.md` y `arquitectura-software-farmacia.md`  
**Estado:** propuesta de experiencia e interfaz para validación

## 1. Objetivo de experiencia

Diseñar una aplicación web operativa que permita ejecutar ventas con rapidez, mantener control visible sobre lotes y vencimientos, y realizar tareas administrativas sin perder trazabilidad.

La interfaz debe transmitir:

- Control sobre inventario, dinero y vencimientos.
- Rapidez en las tareas frecuentes.
- Claridad antes de confirmar acciones críticas.
- Confianza mediante retroalimentación inmediata.
- Consistencia entre compras, ventas, cartera y caja.

## 2. Principios de diseño

1. **La venta es la acción más rápida:** debe estar disponible desde cualquier módulo autorizado.
2. **FEFO funciona sin trabajo adicional:** el sistema asigna lotes automáticamente y explica el resultado.
3. **Las excepciones son visibles:** anulaciones, ajustes y posibles excepciones FEFO requieren contexto y permisos.
4. **No depender sólo del color:** vencimientos y estados usan texto, icono y color.
5. **Una pantalla, un propósito principal:** evitar formularios o dashboards que intenten resolver todo a la vez.
6. **Densidad controlada:** las tablas administrativas muestran lo esencial y llevan el resto al detalle.
7. **Confirmar sólo lo importante:** venta, pago, cierre de caja, ajuste y anulación muestran un resumen previo.
8. **Recuperarse de errores:** cada error indica qué ocurrió y qué puede hacer el usuario.
9. **Permisos comprensibles:** no mostrar acciones que el usuario no puede ejecutar.
10. **Responsive por prioridad:** no intentar comprimir una tabla de escritorio dentro de un teléfono.

## 3. Supuestos de diseño

Estos supuestos deben validarse con usuarios reales:

- El dispositivo principal de caja será un computador de escritorio o una tablet horizontal.
- Los usuarios pueden tener experiencia tecnológica básica o intermedia.
- Durante una venta existen interrupciones y presión por atender rápido.
- Un lector de código de barras puede comportarse como entrada de teclado.
- El sistema se usa en español de Colombia.
- La aplicación requiere conexión para confirmar operaciones.
- En móvil predominan consultas, alertas y operaciones sencillas; el punto de venta completo se optimiza primero para escritorio y tablet.
- La venta manejará precio y medio de pago, aunque sus reglas definitivas aún están pendientes.
- Los roles descritos son provisionales hasta aprobar una matriz de permisos.

## 4. Usuarios y necesidades

### 4.1 Cajero o vendedor

**Objetivos:**

- Iniciar una venta rápidamente.
- Buscar o escanear productos.
- Elegir presentación y cantidad.
- Conocer existencia y restricciones.
- Registrar cliente cuando corresponda.
- Recibir el pago y terminar la venta.
- Consultar una venta previa.

**Necesidades de interfaz:**

- Búsqueda siempre enfocada en el punto de venta.
- Operación completa con teclado.
- Totales visibles permanentemente.
- Mensajes cortos y accionables.
- Protección frente a doble confirmación.

### 4.2 Encargado de inventario

**Objetivos:**

- Consultar existencias por producto, lote y ubicación.
- Ver próximos vencimientos.
- Revisar movimientos.
- Registrar ajustes autorizados.
- Detectar diferencias y rastrear su origen.

**Necesidades de interfaz:**

- Filtros por producto, lote, estado de vencimiento, fecha y ubicación.
- Fechas destacadas con texto e iconos.
- Acceso directo desde un lote a sus movimientos.
- Cantidades expresadas en presentación y unidad base cuando aporte claridad.

### 4.3 Encargado de compras

**Objetivos:**

- Registrar compras.
- Recibir productos.
- Capturar lote y fecha de vencimiento.
- Consultar compras y proveedores.
- Identificar obligaciones asociadas cuando se confirme esa regla.

**Necesidades de interfaz:**

- Editor de líneas eficiente.
- Validación por cada producto recibido.
- Resumen antes de afectar inventario.
- Reutilización de proveedor y productos ya registrados.

### 4.4 Encargado de cartera y pagos

**Objetivos:**

- Consultar saldos.
- Registrar abonos y pagos.
- Identificar obligaciones vencidas.
- Revisar el historial de movimientos.

**Necesidades de interfaz:**

- Saldo pendiente destacado.
- Historial cronológico.
- Resumen antes de aplicar un pago.
- Filtros por tercero, estado y vencimiento.

### 4.5 Administrador

**Objetivos:**

- Administrar usuarios y permisos.
- Configurar productos y presentaciones.
- Supervisar operaciones.
- Consultar reportes.
- Revisar copias de seguridad.

**Necesidades de interfaz:**

- Separación clara entre operación y configuración.
- Explicación del impacto de cambios sensibles.
- Visibilidad sobre usuario, fecha y motivo de operaciones críticas.

### 4.6 Propietario o supervisor

**Objetivos:**

- Conocer el estado operativo.
- Consultar ventas, caja, cartera e inventario.
- Atender alertas de vencimiento.
- Autorizar excepciones cuando la política lo permita.

**Necesidades de interfaz:**

- Resumen breve y accionable.
- Filtros de periodo y ubicación.
- Acceso al detalle desde cada indicador.

## 5. Prioridad de tareas

### Frecuencia alta

- Nueva venta.
- Búsqueda o escaneo de productos.
- Consulta de existencia.
- Consulta y registro de movimientos de caja.
- Consulta de alertas de vencimiento.

### Frecuencia media

- Recepción de compras.
- Registro de clientes y proveedores.
- Registro de pagos y abonos.
- Consulta de lotes y movimientos.
- Apertura y cierre de caja, si se confirma este proceso.

### Frecuencia baja pero riesgo alto

- Ajustes de inventario.
- Anulaciones.
- Cambios de equivalencias.
- Cambios de permisos.
- Restauración de copias de seguridad.
- Excepciones a FEFO.

Las acciones de baja frecuencia y alto riesgo no deben competir visualmente con las tareas diarias.

## 6. Arquitectura de información

La navegación se organiza según tareas del negocio y no según las capas técnicas del sistema.

```text
Inicio
├── Resumen
├── Alertas de vencimiento
│
├── Vender
│   ├── Nueva venta
│   ├── Historial de ventas
│   └── Detalle de venta
│
├── Caja
│   ├── Caja actual
│   ├── Movimientos
│   └── Historial de cierres
│
├── Inventario
│   ├── Existencias
│   ├── Lotes y vencimientos
│   ├── Movimientos
│   ├── Ajustes
│   ├── Productos
│   └── Categorías
│
├── Compras
│   ├── Compras
│   ├── Registrar compra
│   └── Proveedores
│
├── Clientes y cartera
│   ├── Clientes
│   ├── Cuentas por cobrar
│   └── Recaudos
│
├── Proveedores y pagos
│   ├── Proveedores
│   ├── Cuentas por pagar
│   └── Pagos
│
├── Reportes
│
└── Administración
    ├── Usuarios
    ├── Roles y permisos
    ├── Configuración
    └── Copias de seguridad
```

La facturación electrónica no aparecerá en la navegación hasta que la fase DIAN esté disponible. En ese momento se añadirá dentro de **Ventas** o **Administración**, según las tareas definitivas.

## 7. Navegación principal

### Escritorio

- Sidebar izquierda de 248 px, plegable a 72 px.
- Logo/nombre de la farmacia en la parte superior.
- Botón destacado **Nueva venta** antes de los grupos de navegación.
- Grupos: Operación, Inventario, Abastecimiento, Cartera, Reportes y Administración.
- Topbar con breadcrumb, contexto de sede si aplica, alertas y menú del usuario.
- Contenido con ancho fluido y máximo cómodo para formularios.

### Tablet

- Sidebar plegada por defecto.
- Botón **Nueva venta** visible en topbar.
- Tablas con columnas priorizadas y panel de detalle lateral.
- Objetivos táctiles de al menos 44 × 44 px.

### Móvil

- Barra superior compacta.
- Navegación inferior con cuatro destinos: **Inicio**, **Vender**, **Inventario** y **Más**.
- Los formularios se presentan en una columna.
- Las tablas cambian a listas de tarjetas.
- Acciones principales fijas al borde inferior cuando sea útil.

## 8. Navegación por rol

La visibilidad definitiva depende de la matriz de permisos.

| Área | Cajero | Inventario | Compras | Cartera | Administrador | Supervisor |
|---|---:|---:|---:|---:|---:|---:|
| Nueva venta | Principal | Según permiso | — | — | Sí | Sí |
| Historial de ventas | Limitado | — | — | Consulta | Sí | Sí |
| Caja | Principal | — | — | Según proceso | Sí | Sí |
| Inventario | Consulta | Principal | Consulta | — | Sí | Sí |
| Compras | — | Recepción | Principal | — | Sí | Sí |
| Clientes | Consulta/crear | — | — | Principal | Sí | Sí |
| Cuentas por cobrar | Según permiso | — | — | Principal | Sí | Sí |
| Cuentas por pagar | — | — | Consulta | Principal | Sí | Sí |
| Reportes | Limitado | Limitado | Limitado | Limitado | Sí | Sí |
| Usuarios y permisos | — | — | — | — | Principal | Según permiso |

Los guiones representan una propuesta de ocultamiento, no una regla confirmada.

## 9. Mapa de pantallas

| ID | Pantalla | Objetivo principal |
|---|---|---|
| UX-01 | Inicio de sesión | Acceder de forma segura |
| UX-02 | Dashboard | Ver pendientes y entrar a tareas frecuentes |
| UX-03 | Nueva venta | Registrar una venta completa |
| UX-04 | Historial de ventas | Buscar y consultar ventas |
| UX-05 | Detalle de venta | Revisar productos, lotes, pagos y trazabilidad |
| UX-06 | Productos | Consultar y administrar catálogo |
| UX-07 | Producto — detalle/formulario | Crear o editar información y presentaciones |
| UX-08 | Categorías | Administrar categorías en una vista compacta |
| UX-09 | Existencias | Consultar inventario consolidado |
| UX-10 | Lotes y vencimientos | Controlar existencias por lote |
| UX-11 | Detalle de lote | Revisar saldo, vencimiento y movimientos |
| UX-12 | Movimientos de inventario | Consultar trazabilidad |
| UX-13 | Ajuste de inventario | Registrar una corrección autorizada |
| UX-14 | Alertas de vencimiento | Priorizar lotes próximos a vencer |
| UX-15 | Compras | Buscar y consultar compras |
| UX-16 | Registrar/editar compra | Capturar encabezado y líneas |
| UX-17 | Recepción de compra | Confirmar cantidades, lotes y vencimientos |
| UX-18 | Detalle de compra | Revisar documento, recepción y movimientos |
| UX-19 | Proveedores | Consultar y administrar proveedores |
| UX-20 | Clientes | Consultar y administrar clientes |
| UX-21 | Cuentas por cobrar | Consultar cartera de clientes |
| UX-22 | Detalle de cuenta por cobrar | Ver saldo e ingresar un abono |
| UX-23 | Cuentas por pagar | Consultar obligaciones con proveedores |
| UX-24 | Detalle de cuenta por pagar | Ver saldo y registrar pago |
| UX-25 | Caja actual | Ver estado y movimientos de la caja activa |
| UX-26 | Apertura/cierre de caja | Ejecutar el control de caja, si se confirma |
| UX-27 | Reportes | Seleccionar, filtrar y generar reportes |
| UX-28 | Usuarios | Administrar acceso de usuarios |
| UX-29 | Roles y permisos | Configurar matriz de permisos |
| UX-30 | Configuración | Definir parámetros aprobados |
| UX-31 | Copias de seguridad | Consultar estado y ejecutar acciones autorizadas |

## 10. Flujo principal: nueva venta

### Punto de entrada

- Botón persistente **Nueva venta**.
- Acceso directo desde el dashboard.
- Atajo de teclado configurable.

### Flujo

```text
Nueva venta
→ cursor activo en buscar/escanear
→ seleccionar producto
→ elegir presentación y cantidad
→ validar existencia
→ agregar a la venta
→ repetir productos
→ identificar cliente cuando corresponda
→ seleccionar medio de pago o crédito
→ revisar resumen
→ confirmar una sola vez
→ mostrar resultado y comprobante
```

### Diseño de la pantalla

#### Columna izquierda — búsqueda y resultados

- Campo grande **Escanear código o buscar producto**.
- Resultados con nombre, presentación, precio y existencia disponible.
- Indicador de lote próximo a vencer cuando sea relevante.
- Acción rápida **Agregar**.

#### Columna derecha — venta actual

- Líneas agregadas.
- Presentación y cantidad editables.
- Precio unitario, subtotal y disponibilidad.
- Acceso secundario a **Ver asignación FEFO**.
- Cliente.
- Totales.
- Acción primaria **Continuar al pago**.

### FEFO en la experiencia

- El cajero no escoge lote en el flujo normal.
- El sistema muestra `Asignación FEFO automática` como estado informativo.
- Un detalle expandible indica lote, vencimiento y cantidad asignada.
- Si un lote no cubre toda la cantidad, se muestran las asignaciones por lote.
- Si se aprueban excepciones, la acción **Cambiar lote** sólo aparece para usuarios autorizados y solicita motivo.
- Los productos vencidos se muestran como no disponibles si se confirma la regla de bloqueo.

### Validaciones

- Producto sin existencia suficiente.
- Presentación sin equivalencia configurada.
- Cantidad inválida.
- Precio ausente, si el sistema lo requiere.
- Cliente obligatorio para crédito, si se confirma.
- Caja cerrada, si se exige caja abierta para vender.
- Sesión o conexión perdida antes de confirmar.

### Prevención de doble venta

Al pulsar **Confirmar venta**:

- Deshabilitar el botón y mostrar `Confirmando venta…`.
- No limpiar la pantalla hasta recibir resultado definitivo.
- Si se pierde conexión, mostrar `Estamos verificando si la venta fue registrada` y consultar su estado.
- No invitar al usuario a confirmar nuevamente sin verificar primero.

### Éxito

Mostrar una vista clara con:

- `Venta registrada`.
- Número de operación.
- Total y medio de pago.
- Acciones **Imprimir comprobante**, **Ver detalle** y **Nueva venta**.

## 11. Flujo: compra y recepción

```text
Compras
→ Registrar compra
→ seleccionar proveedor
→ capturar documento y fecha
→ agregar productos, presentación, cantidad y costo
→ guardar según estado permitido
→ iniciar recepción
→ capturar lotes y vencimientos
→ revisar resumen de ingreso
→ confirmar recepción
→ actualizar inventario
```

### Decisiones de interfaz

- El encabezado ocupa una sección breve.
- Las líneas se editan en una tabla especializada.
- Lote y vencimiento aparecen en la recepción, no necesariamente al crear la compra.
- Una línea con varios lotes se expande para capturar cada distribución.
- Antes de confirmar se muestra el total de unidades base que ingresará.
- Los campos de costo, impuestos y descuentos quedan sujetos a las reglas pendientes.

### Errores relevantes

- Cantidad recibida diferente de la comprada.
- Suma de lotes diferente de la cantidad recibida.
- Lote duplicado con datos incompatibles.
- Fecha de vencimiento faltante para producto controlado.
- Fecha de vencimiento anterior a la permitida por la política, aún pendiente.

## 12. Flujo: inventario y vencimientos

```text
Dashboard o Inventario
→ Lotes y vencimientos
→ filtrar por estado o periodo
→ abrir lote
→ revisar saldo y movimientos
→ ejecutar una acción autorizada si corresponde
```

### Clasificación visual propuesta

- **Vigente:** sin alerta activa.
- **Próximo a vencer:** dentro del umbral definido.
- **Vencido:** fecha anterior a la fecha operativa.
- **Agotado:** saldo cero.

`Próximo a vencer` y `Vencido` son estados calculados. El umbral debe configurarse cuando el negocio lo defina.

### Alerta

Cada alerta muestra:

- Producto.
- Lote.
- Fecha de vencimiento.
- Días restantes o días vencido.
- Cantidad disponible.
- Ubicación, si existe más de una.
- Acciones **Ver lote** y **Ver movimientos**.

No se propone `Resolver alerta` hasta definir qué significa resolverla en el proceso real.

## 13. Flujo: ajuste de inventario

```text
Inventario
→ Registrar ajuste
→ buscar producto
→ seleccionar ubicación y lote
→ indicar cantidad o nuevo saldo según política
→ seleccionar motivo
→ agregar observación
→ revisar impacto
→ confirmar
→ mostrar movimiento generado
```

### Reglas de experiencia

- Mostrar saldo actual y saldo resultante antes de confirmar.
- Diferenciar visualmente incremento y disminución.
- Motivo obligatorio.
- Una disminución que deje saldo negativo se bloquea si esa regla es aprobada.
- No permitir editar el movimiento después de confirmado; ofrecer reversión autorizada.

## 14. Flujo: cuenta por cobrar y recaudo

```text
Cuentas por cobrar
→ buscar cliente u obligación
→ abrir detalle
→ seleccionar Registrar abono
→ ingresar fecha, valor y medio de pago
→ mostrar saldo resultante
→ confirmar
→ registrar movimiento de cartera y caja
```

La misma estructura se reutiliza para cuentas por pagar, cambiando tercero, lenguaje y dirección del dinero.

### Validaciones

- Valor mayor que cero.
- Valor no superior al saldo, salvo que el negocio defina anticipos.
- Medio de pago requerido.
- Caja disponible, si la operación debe afectarla.

## 15. Flujo: caja

El proceso de caja sigue pendiente de negocio. La propuesta visual contempla:

```text
Caja cerrada
→ Abrir caja
→ registrar base inicial
→ operar ventas, recaudos, ingresos o egresos autorizados
→ consultar resumen
→ iniciar cierre
→ ingresar efectivo contado
→ revisar diferencia
→ confirmar cierre
```

### Pantalla Caja actual

- Estado de la caja.
- Usuario responsable.
- Hora de apertura.
- Resumen por medio de pago.
- Ingresos y egresos.
- Últimos movimientos.
- Acción primaria dependiente del estado: **Abrir caja** o **Cerrar caja**.

No deben mostrarse valores sensibles a usuarios sin permiso.

## 16. Dashboard

El dashboard se adapta al rol. No debe llenarse de gráficos decorativos.

### Cajero

- Estado de caja.
- Acción **Nueva venta**.
- Últimas ventas propias o permitidas.
- Alertas operativas que impidan vender.

### Inventario

- Lotes próximos a vencer.
- Lotes vencidos.
- Acceso a existencias y movimientos recientes.
- Compras pendientes de recepción, si se confirma ese estado.

### Administrador o supervisor

- Ventas del periodo seleccionado.
- Estado de caja.
- Cuentas por cobrar/pagar próximas o vencidas.
- Alertas de vencimiento.
- Estado de la última copia de seguridad.

Cada tarjeta debe enlazar a la lista filtrada correspondiente. Los indicadores y periodos definitivos dependen de los reportes aprobados.

## 17. Diseño de tablas

### Patrón común

- Título y contador de resultados.
- Búsqueda principal.
- Filtros más usados visibles.
- Filtros adicionales en drawer.
- Indicador claro de filtros activos.
- Ordenamiento en columnas pertinentes.
- Paginación.
- Acciones por fila dentro de un menú, salvo la acción principal de abrir detalle.
- Columnas configuradas por prioridad, no todas visibles simultáneamente.
- Encabezado fijo cuando la tabla sea larga.

### Productos

**Columnas:** producto, categoría, presentaciones, estado y acción de detalle.  
**Pendientes:** código, código de barras, precio y datos regulatorios.

### Existencias

**Columnas:** producto, ubicación, cantidad base, equivalencia legible, lotes activos y próximo vencimiento.

### Lotes

**Columnas:** producto, lote, vencimiento, estado, cantidad, ubicación y acción.

**Filtros:** estado de vencimiento, rango de fechas, producto, categoría, lote y ubicación.

### Movimientos de inventario

**Columnas:** fecha/hora, tipo, producto, lote, cantidad, saldo resultante, origen y usuario.

### Ventas

**Columnas:** número, fecha/hora, cliente, total, medio de pago, estado, cajero y acción.

### Compras

**Columnas:** número interno, documento del proveedor, fecha, proveedor, total, estado y acción.

### Cuentas por cobrar/pagar

**Columnas:** tercero, documento origen, emisión, vencimiento, total, saldo y estado.

### Usuarios

**Columnas:** nombre, identificación de acceso, roles, estado, último acceso y acción.

### Adaptación móvil

Cada fila se convierte en tarjeta con:

- Identificador principal.
- Dos o tres datos críticos.
- Badge de estado.
- Acción **Ver detalle**.
- Menú de acciones secundarias.

## 18. Formularios

### Patrón común

- Etiquetas permanentes, no depender del placeholder.
- Campos obligatorios identificados de forma consistente.
- Ayuda sólo donde previene errores.
- Validación al salir del campo y al enviar.
- Resumen de errores al inicio para formularios largos.
- Botón principal con verbo específico: **Guardar producto**, **Recibir compra**, **Registrar abono**.
- Acción secundaria **Cancelar** o **Volver**, sin competir visualmente.
- Prevención de pérdida de cambios no guardados.

### Producto

#### Confirmado

- Nombre.
- Categoría.
- Presentaciones permitidas: unidad, blíster y caja.
- Equivalencias por presentación.
- Indicación de control por lote y vencimiento cuando aplique.

#### Pendiente de definición

- Código interno.
- Código de barras.
- Laboratorio, principio activo, concentración y registro sanitario.
- Precio de venta, costo e impuestos.
- Imagen.

### Proveedor y cliente

La estructura definitiva depende de los datos aprobados. El formulario debe agrupar:

- Identificación.
- Información de contacto.
- Información comercial o de crédito, sólo si se confirma.
- Estado activo/inactivo.

### Usuario

- Nombre.
- Identificación de acceso.
- Roles.
- Estado.
- Datos para recuperación de acceso, si se habilita.

Los permisos finos se administran en la pantalla de roles, no como una lista extensa dentro de cada usuario.

## 19. Búsqueda y filtros

### Productos

- Búsqueda parcial por nombre.
- Código interno y código de barras cuando se confirmen.
- Resultado por presentación.
- En punto de venta, máximo énfasis en disponibilidad y precio.

### Clientes y proveedores

- Nombre o razón social.
- Identificación.
- Datos de contacto cuando estén definidos.

### Documentos

- Número.
- Tercero.
- Fecha.
- Estado.
- Usuario responsable cuando aplique.

### Comportamiento

- Espera breve al escribir en búsquedas administrativas.
- Escaneo o coincidencia exacta en punto de venta sin espera perceptible.
- Filtros activos representados mediante chips removibles.
- Acción **Limpiar filtros** visible cuando hay filtros activos.
- La URL conserva filtros importantes para volver o compartir una vista autorizada.

## 20. Estados de procesos

Los siguientes estados son una propuesta visual y no sustituyen la definición del negocio.

| Proceso | Estados propuestos |
|---|---|
| Producto | Activo, Inactivo |
| Lote | Vigente, Próximo a vencer, Vencido, Agotado |
| Venta | Borrador, Confirmada, Anulada |
| Compra | Borrador, Pendiente de recepción, Recibida, Anulada |
| Cuenta por cobrar | Pendiente, Parcial, Pagada, Vencida, Anulada |
| Cuenta por pagar | Pendiente, Parcial, Pagada, Vencida, Anulada |
| Caja | Cerrada, Abierta, En cierre, Cerrada con diferencia |
| Usuario | Activo, Inactivo, Bloqueado |
| Trabajo DIAN futuro | Pendiente, Enviado, Validado, Rechazado, Reintentando |

### Convenciones visuales

- Neutral: borradores o información sin riesgo.
- Azul: procesos en curso.
- Verde: confirmados o completados.
- Ámbar: requieren atención.
- Rojo: vencidos, rechazados o errores.
- Gris: inactivos, agotados o anulados.

Siempre acompañar el color con texto e icono.

## 21. Estados de pantalla

### Loading

- Skeleton que conserve la estructura de la tabla o tarjeta.
- En acciones, spinner dentro del botón con verbo en progreso.
- No reemplazar toda la pantalla por un spinner genérico.

### Vacío inicial

Ejemplo:

> Aún no hay proveedores. Registra el primero para comenzar a crear compras.

Incluye acción sólo si el usuario tiene permiso.

### Sin resultados

Ejemplo:

> No encontramos lotes con estos filtros. Prueba ampliando el rango de vencimiento.

Incluye **Limpiar filtros**.

### Error de carga

Ejemplo:

> No pudimos cargar las existencias. Intenta nuevamente. Si continúa, informa el código de soporte `ABC-123`.

### Sin permisos

Ejemplo:

> No tienes permiso para consultar cuentas por pagar. Solicita acceso a un administrador.

### Offline

- Banner persistente: `Sin conexión. Puedes consultar la información ya visible, pero no confirmar operaciones.`
- Deshabilitar confirmaciones y explicar el motivo.
- No prometer ventas offline en el MVP.

### Éxito

- Toast para operaciones pequeñas y reversibles.
- Pantalla o bloque de resultado para venta, recepción, pago, ajuste o cierre.
- Evitar mensajes ambiguos como `Operación exitosa`.

## 22. Acciones críticas

### Venta y recepción

Mostrar un resumen embebido o paso de revisión. Evitar un modal pequeño con demasiada información.

### Ajuste

Mostrar saldo actual, cambio, saldo final y motivo.

### Pago o abono

Mostrar tercero, obligación, saldo actual, valor y saldo resultante.

### Anulación

- Diálogo específico.
- Explicar impacto.
- Motivo obligatorio.
- Reautenticación o aprobación superior sólo si la política lo exige.
- Usar `Anular`, no `Eliminar`.

### Cambio de permisos

Mostrar resumen de permisos añadidos y retirados antes de guardar.

### Restauración de respaldo

Debe estar separada de la acción de crear respaldo y requerir confirmación reforzada. El detalle del proceso depende de la estrategia operativa aprobada.

## 23. Componentes reutilizables

### Estructura

- `AppShell`
- `SidebarNavigation`
- `TopBar`
- `PageHeader`
- `Breadcrumbs`
- `PermissionBoundary`

### Datos

- `DataTable`
- `MobileRecordCard`
- `FilterBar`
- `ActiveFilterChips`
- `Pagination`
- `DetailDrawer`
- `KeyValueList`
- `Timeline`

### Dominio de farmacia

- `ProductSearch`
- `BarcodeSearchInput`
- `PresentationSelector`
- `QuantityInput`
- `StockAvailability`
- `ExpiryBadge`
- `LotSelector`
- `FefoAllocationSummary`
- `SaleLineEditor`
- `PurchaseLineEditor`
- `MoneySummary`
- `CashStatusCard`

### Formularios y acciones

- `TextField`
- `NumberField`
- `CurrencyField`
- `SelectField`
- `DateField`
- `AutocompleteField`
- `FormSection`
- `StickyActionBar`
- `ConfirmActionDialog`
- `ReasonDialog`

### Retroalimentación

- `StatusBadge`
- `InlineAlert`
- `Toast`
- `Skeleton`
- `EmptyState`
- `ErrorState`
- `NoPermissionState`
- `OfflineBanner`

### Estados de componentes

Cada componente interactivo debe definir `default`, `hover`, `focus-visible`, `active`, `disabled`, `loading` y `error`. Los campos pueden añadir `success` cuando la validación positiva ayude al usuario.

## 24. Sistema visual

### Dirección

Interfaz profesional, sobria y limpia. Debe sentirse como una herramienta de trabajo confiable, no como una tienda en línea ni una aplicación clínica.

### Paleta propuesta

| Token | Color | Uso |
|---|---|---|
| `primary-700` | `#0F766E` | Acciones principales y navegación activa |
| `primary-100` | `#CCFBF1` | Fondos informativos de marca |
| `surface` | `#FFFFFF` | Tarjetas, paneles y formularios |
| `background` | `#F5F8F7` | Fondo general |
| `text-primary` | `#17211F` | Texto principal |
| `text-secondary` | `#52605D` | Texto auxiliar |
| `border` | `#D7E0DD` | Divisores y bordes |
| `success` | `#16734A` | Estados completados |
| `warning` | `#9A5B00` | Próximos vencimientos y atención |
| `danger` | `#B42318` | Vencidos, errores y acciones destructivas |
| `info` | `#175CD3` | Información y procesos en curso |

La paleta debe validarse con contraste WCAG AA en su combinación real.

### Tipografía

- Familia: Inter o una sans serif de alta legibilidad.
- Cuerpo base: 16 px.
- Texto compacto de tablas: 14 px como mínimo.
- Títulos con jerarquía clara, sin tamaños publicitarios.
- Números monetarios alineados para facilitar comparación.

### Espaciado y forma

- Escala base de 4 px: 4, 8, 12, 16, 24, 32 y 48.
- Radio: 8 px en controles y 12 px en tarjetas.
- Bordes suaves; sombras discretas sólo para separar elevaciones.
- Tablas compactas con altura de fila de 48–52 px en escritorio.
- Evitar gradientes, efectos brillantes y exceso de tarjetas flotantes.

### Iconografía

- Un solo conjunto de iconos lineales.
- Iconos acompañados por texto en acciones importantes.
- Símbolos consistentes para lote, vencimiento, caja, compra y venta.

## 25. Responsive

### Breakpoints conceptuales

- Móvil: 360–767 px.
- Tablet: 768–1279 px.
- Escritorio: 1280 px en adelante.

### Nueva venta

- **Escritorio:** búsqueda/resultados a la izquierda y venta actual a la derecha.
- **Tablet:** búsqueda principal y carrito accesible en panel lateral.
- **Móvil:** una columna, alternando catálogo y venta; total y acción fijos abajo.

### Tablas

- **Escritorio:** tabla completa con columnas prioritarias.
- **Tablet:** ocultar columnas secundarias y usar drawer de detalle.
- **Móvil:** tarjetas, filtros en pantalla completa y acciones táctiles.

### Formularios

- **Escritorio:** hasta dos columnas sólo para campos relacionados.
- **Tablet:** una o dos columnas según ancho.
- **Móvil:** una columna, teclado apropiado y botones de ancho completo.

### Dashboard

- **Escritorio:** cuadrícula de máximo cuatro columnas.
- **Tablet:** dos columnas.
- **Móvil:** una columna ordenada por urgencia.

## 26. Accesibilidad

- Contraste mínimo WCAG AA.
- Navegación completa por teclado.
- Foco visible y con suficiente contraste.
- Orden de tabulación lógico.
- Etiquetas asociadas a cada control.
- Mensajes de error vinculados al campo y anunciados a tecnologías de asistencia.
- Encabezados y relaciones correctas en tablas.
- Objetivos táctiles de al menos 44 × 44 px.
- No usar sólo rojo o verde para comunicar estado.
- Respetar preferencia de movimiento reducido.
- Mantener zoom hasta 200 % sin pérdida de funciones.
- Totales, vencimientos y errores expresados mediante texto legible.

## 27. Rendimiento percibido

- Precargar únicamente catálogos pequeños y estables.
- Buscar productos conforme se escribe o escanea.
- Mostrar skeletons con la forma del contenido.
- Mantener filtros al volver de un detalle.
- Evitar actualizaciones optimistas en ventas, pagos, caja e inventario.
- Permitir actualización optimista sólo en preferencias visuales o acciones fácilmente reversibles.
- Mostrar progreso real para reportes o exportaciones largas.

## 28. Wireframes conceptuales

### Dashboard de supervisor

```text
┌──────────────┬─────────────────────────────────────────────────────────┐
│ Farmacia     │ Inicio                         Alertas  Sede  Usuario    │
│              ├─────────────────────────────────────────────────────────┤
│ + Nueva venta│ Resumen de hoy                          [Periodo ▾]     │
│ Inicio       │ [Ventas] [Caja] [Por cobrar] [Por pagar]               │
│ Ventas       │                                                         │
│ Caja         │ Atención requerida                                     │
│ Inventario   │ [12 lotes próximos] [3 lotes vencidos]                 │
│ Compras      │                                                         │
│ Cartera      │ Actividad reciente                                     │
│ Reportes     │ ┌─────────────────────────────────────────────────────┐ │
│ Admin        │ │ Operación · Usuario · Hora · Estado               │ │
│              │ └─────────────────────────────────────────────────────┘ │
└──────────────┴─────────────────────────────────────────────────────────┘
```

### Nueva venta

```text
┌──────────────┬─────────────────────────────────────────────────────────┐
│ Navegación   │ Nueva venta                                  Caja abierta│
│              ├─────────────────────────────┬───────────────────────────┤
│              │ Escanear o buscar producto  │ Venta actual              │
│              │ [_________________________] │                           │
│              │                             │ Acetaminofén   2 blísteres│
│              │ Resultados                  │ $ …                       │
│              │ Producto · Presentación     │ FEFO automático ✓         │
│              │ Precio · Existencia         │                           │
│              │                             │ Cliente [Opcional/Pend.]  │
│              │                             │ Subtotal                  │
│              │                             │ Total                     │
│              │                             │ [Continuar al pago]        │
└──────────────┴─────────────────────────────┴───────────────────────────┘
```

### Lotes y vencimientos

```text
┌──────────────┬─────────────────────────────────────────────────────────┐
│ Navegación   │ Lotes y vencimientos                [Exportar pendiente]│
│              │ Buscar [________] Estado [Todos ▾] Vence [30 días ▾]   │
│              │ Filtros: Próximo a vencer ×                           │
│              ├─────────────────────────────────────────────────────────┤
│              │ Producto │ Lote │ Vencimiento │ Estado │ Cantidad │ ⋮ │
│              │ ...                                             ...    │
│              │                                                         │
│              │ 24 resultados                         ‹ 1 2 3 ›        │
└──────────────┴─────────────────────────────────────────────────────────┘
```

## 29. Riesgos de usabilidad

| Riesgo | Impacto | Mitigación de diseño |
|---|---|---|
| El cajero debe decidir lotes manualmente | Venta lenta y errores FEFO | Asignación automática con detalle secundario |
| Demasiadas columnas | Dificultad para encontrar información | Priorización, detalle lateral y vistas guardadas futuras |
| Estados de negocio no definidos | Botones y mensajes inconsistentes | Aprobar estados antes del prototipo final |
| Exceso de confirmaciones | Fatiga y confirmación automática | Confirmar sólo acciones irreversibles o de alto impacto |
| Pérdida de conexión al confirmar | Venta duplicada | Estado de verificación e idempotencia visible |
| Equivalencias poco claras | Descuadre de inventario | Mostrar presentación, factor y unidad base en operaciones críticas |
| Permisos ambiguos | Frustración o exposición | Navegación por permiso y explicación de acceso restringido |
| Diseño móvil como tabla reducida | Lectura e interacción deficientes | Tarjetas y acciones priorizadas |
| Uso exclusivo del color | Barreras de accesibilidad | Texto, icono y color en cada estado |

## 30. Validación con usuarios

Antes de implementar, realizar pruebas moderadas con al menos un representante de caja, inventario, compras y administración.

### Tareas a probar

1. Registrar una venta con dos productos y presentaciones diferentes.
2. Entender qué lote seleccionó FEFO.
3. Detectar por qué una venta no puede confirmarse.
4. Recibir una compra distribuida en dos lotes.
5. Encontrar un producto que vence en los próximos 30 días.
6. Rastrear un movimiento hasta su documento de origen.
7. Registrar un abono y anticipar el saldo resultante.
8. Cerrar una caja con diferencia, si el proceso se confirma.
9. Identificar qué acción no está disponible por permisos.

### Señales de éxito propuestas

- El usuario completa la venta sin explicación del facilitador.
- La selección FEFO se entiende sin tener que escoger un lote.
- Los errores se corrigen desde la misma pantalla.
- Ningún participante confunde anular con eliminar.
- Las alertas de vencimiento se pueden priorizar por fecha.

## 31. Decisiones pendientes antes del diseño de alta fidelidad

1. Roles y permisos definitivos.
2. Sedes, bodegas y cajas.
3. Datos obligatorios del producto.
4. Estructura de precios, descuentos e impuestos.
5. Medios de pago.
6. Cliente obligatorio u opcional por tipo de venta.
7. Flujo de crédito.
8. Estados y anulaciones de compras y ventas.
9. Política para vencidos y excepciones FEFO.
10. Apertura, cierre, arqueo y diferencias de caja.
11. Reportes definitivos.
12. Periféricos y formatos de impresión.
13. Necesidad real de operación sin conexión.

## 32. Prompt maestro para Google Stitch

Google Stitch permite generar e iterar interfaces de alta fidelidad desde lenguaje natural, enlazar pantallas como prototipos y mantener reglas de diseño mediante `DESIGN.md` ([anuncio oficial de Google](https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/)).

Copiar el siguiente bloque como prompt inicial:

```text
Diseña una aplicación web responsive de alta fidelidad para la operación interna de una farmacia en Colombia. El producto es una herramienta administrativa y de punto de venta para cajeros, encargados de inventario, compras, cartera, administradores y supervisores. No es una tienda en línea ni una aplicación para pacientes.

OBJETIVO DEL PRODUCTO
Permitir registrar ventas con rapidez, controlar inventario por producto y lote, manejar presentaciones por unidad, blíster y caja, aplicar FEFO automáticamente, controlar vencimientos, registrar compras, proveedores, clientes, cuentas por cobrar, cuentas por pagar, caja, usuarios, permisos y reportes básicos.

PRINCIPIOS DE EXPERIENCIA
- Prioriza claridad, velocidad operativa y prevención de errores.
- La acción Nueva venta debe ser visible desde cualquier sección para los usuarios autorizados.
- FEFO es automático: al vender un medicamento, el sistema asigna primero el lote disponible con vencimiento más próximo.
- El cajero no debe escoger lotes manualmente en el flujo normal.
- Muestra la asignación FEFO mediante un resumen expandible con lote, vencimiento y cantidad.
- Las acciones críticas deben mostrar el impacto antes de confirmar.
- No uses confirmaciones para acciones fácilmente reversibles.
- No dependas sólo del color para mostrar estados; combina texto, iconos y color.
- No agregues módulos no solicitados como comercio electrónico, fidelización, domicilios, historia clínica o inteligencia artificial.

IDIOMA Y FORMATO
- Todo el contenido debe estar en español de Colombia.
- Usa fechas legibles como “18 sep 2026”.
- Usa valores monetarios ilustrativos en pesos colombianos, claramente ficticios.
- Usa nombres y datos ficticios, sin información personal real.

LAYOUT DE ESCRITORIO
- Aplicación desktop-first con ancho mínimo de referencia de 1280 px.
- Sidebar izquierda de 248 px, plegable a 72 px.
- En la parte superior del sidebar coloca una marca neutral llamada “Farmacia”.
- Coloca un botón primario “Nueva venta” encima de la navegación.
- Agrupa la navegación en: Operación, Inventario, Abastecimiento, Cartera, Reportes y Administración.
- Usa una topbar compacta con breadcrumb, selector de sede sólo como contexto provisional, alertas y menú del usuario.
- El contenido debe usar fondos claros, paneles blancos, bordes sutiles y sombras mínimas.

NAVEGACIÓN
- Inicio.
- Ventas: Nueva venta, Historial.
- Caja: Caja actual, Movimientos, Cierres.
- Inventario: Existencias, Lotes y vencimientos, Movimientos, Ajustes, Productos, Categorías.
- Compras: Compras, Registrar compra, Proveedores.
- Clientes y cartera: Clientes, Cuentas por cobrar.
- Proveedores y pagos: Proveedores, Cuentas por pagar.
- Reportes.
- Administración: Usuarios, Roles y permisos, Configuración, Copias de seguridad.
- No muestres todavía facturación electrónica DIAN en la navegación principal.

SISTEMA VISUAL
- Estética profesional, sobria, confiable y contemporánea.
- No usar estilo de ecommerce, estética hospitalaria, ilustraciones decorativas, glassmorphism, gradientes intensos ni efectos 3D.
- Color primario teal oscuro #0F766E.
- Fondo general #F5F8F7.
- Superficies #FFFFFF.
- Texto principal #17211F y secundario #52605D.
- Bordes #D7E0DD.
- Éxito #16734A, advertencia #9A5B00, peligro #B42318 e información #175CD3.
- Usa tipografía Inter o una sans serif muy legible.
- Cuerpo de 16 px; tablas de mínimo 14 px.
- Escala de espaciado basada en 4 px.
- Radio de 8 px en controles y 12 px en tarjetas.
- Foco de teclado claramente visible.
- Contraste WCAG AA.

COMPONENTES REUTILIZABLES
Crea y reutiliza: AppShell, SidebarNavigation, TopBar, PageHeader, Breadcrumbs, DataTable, MobileRecordCard, FilterBar, ActiveFilterChips, DetailDrawer, StatusBadge, ProductSearch, BarcodeSearchInput, PresentationSelector, QuantityInput, StockAvailability, ExpiryBadge, FefoAllocationSummary, SaleLineEditor, PurchaseLineEditor, MoneySummary, CashStatusCard, FormSection, StickyActionBar, ConfirmActionDialog, ReasonDialog, InlineAlert, Toast, Skeleton, EmptyState, ErrorState, NoPermissionState y OfflineBanner.

GENERA LAS SIGUIENTES PANTALLAS CON CONSISTENCIA VISUAL

1. INICIO DE SESIÓN
- Panel centrado y compacto.
- Campos “Usuario o correo” y “Contraseña”.
- Acción primaria “Ingresar”.
- Estados de credenciales incorrectas, cargando y cuenta bloqueada.
- Sin elementos promocionales.

2. DASHBOARD DE SUPERVISOR
- Encabezado “Resumen de hoy” con selector de periodo.
- Tarjetas accionables: Ventas, Estado de caja, Cuentas por cobrar, Cuentas por pagar.
- Sección “Atención requerida” con lotes próximos a vencer y lotes vencidos.
- Lista compacta de actividad reciente.
- Cada tarjeta debe abrir la lista filtrada correspondiente.
- Evita gráficos decorativos; usa información que permita actuar.

3. NUEVA VENTA — ESCRITORIO
- Diseño de dos columnas.
- Columna izquierda: campo grande “Escanear código o buscar producto”, resultados con nombre, presentación, precio ilustrativo, existencia y botón Agregar.
- Columna derecha: venta actual con líneas, presentación, cantidad, precio, subtotal y eliminación de línea.
- Muestra “Asignación FEFO automática” con icono de éxito y detalle expandible de lotes.
- Incluye selector de cliente con indicación de que puede ser opcional según la política.
- Mantén subtotal y total visibles.
- Botón primario “Continuar al pago”.
- Diseña también los estados: sin productos, inventario insuficiente, presentación sin equivalencia, cargando y sin conexión.

4. REVISIÓN Y PAGO DE VENTA
- Resumen de productos y cantidades.
- Cliente.
- Medio de pago.
- Total destacado.
- Botón “Confirmar venta”.
- Al confirmar, deshabilita el botón y muestra “Confirmando venta…”.
- Incluye estado de conexión perdida: “Estamos verificando si la venta fue registrada”.
- Diseña resultado exitoso con número de venta y acciones “Imprimir comprobante”, “Ver detalle” y “Nueva venta”.

5. EXISTENCIAS
- Tabla con Producto, Ubicación, Cantidad, Equivalencia legible, Lotes activos y Próximo vencimiento.
- Búsqueda y filtros por categoría y ubicación.
- Encabezado fijo, paginación y acceso al detalle.
- Estado vacío, sin resultados, error y loading skeleton.

6. LOTES Y VENCIMIENTOS
- Tabla con Producto, Lote, Fecha de vencimiento, Estado, Cantidad, Ubicación y menú de acciones.
- Filtros visibles por estado y periodo de vencimiento.
- Chips de filtros activos.
- Usa badges con texto e iconos: Vigente, Próximo a vencer, Vencido y Agotado.
- Destaca fechas sin depender únicamente del color.
- Incluye un drawer de detalle con saldo, vencimiento, movimientos recientes y enlaces “Ver lote” y “Ver movimientos”.

7. RECEPCIÓN DE COMPRA
- Encabezado con proveedor, documento y fecha.
- Tabla editable de productos recibidos.
- Para cada línea permite seleccionar presentación, cantidad y capturar uno o varios lotes con fecha de vencimiento.
- Muestra equivalencia en unidades base.
- Si una línea usa varios lotes, muéstralos en una sección expandida.
- Incluye resumen final de unidades que ingresarán.
- Acción primaria “Confirmar recepción”.
- Diseña errores para suma de lotes incorrecta y vencimiento faltante.

8. CUENTAS POR COBRAR
- Tabla con Cliente, Documento origen, Emisión, Vencimiento, Total, Saldo y Estado.
- Filtros por cliente, estado y vencimiento.
- Drawer de detalle con historial cronológico de abonos.
- Acción “Registrar abono”.
- Formulario de abono con fecha, valor, medio de pago, saldo actual y saldo resultante.
- Reutiliza esta estructura para una variante de cuentas por pagar.

9. CAJA ACTUAL
- Estado de caja, responsable y hora de apertura.
- Resumen por medio de pago.
- Totales de ingresos y egresos.
- Lista de últimos movimientos.
- Acción principal contextual “Abrir caja” o “Cerrar caja”.
- En el cierre muestra valor esperado, efectivo contado y diferencia claramente etiquetada.

10. PRODUCTOS
- Tabla con Producto, Categoría, Presentaciones, Control por lote y Estado.
- Pantalla de formulario por secciones: Información básica, Presentaciones y Control de lotes.
- Presentaciones configurables: Unidad, Blíster y Caja.
- Cada presentación muestra su equivalencia en unidades base.
- Incluye una advertencia antes de modificar equivalencias que ya pueden tener movimientos históricos.
- No inventes campos regulatorios como obligatorios; muéstralos sólo como sección pendiente u opcional.

11. USUARIOS Y ROLES
- Tabla de usuarios con Nombre, Acceso, Roles, Estado y Último acceso.
- Pantalla de roles con matriz de permisos agrupada por módulo.
- Antes de guardar cambios, muestra permisos añadidos y retirados.
- No presentes permisos como una lista interminable sin agrupación.

ESTADOS GLOBALES
Para todas las pantallas de datos diseña:
- Loading con skeleton que conserve la estructura.
- Vacío inicial con explicación y acción autorizada.
- Sin resultados con “Limpiar filtros”.
- Error con acción “Intentar nuevamente” y código de soporte.
- Sin permisos con explicación clara.
- Offline con banner persistente y operaciones mutables deshabilitadas.
- Éxito con mensaje específico, no “Operación exitosa”.

RESPONSIVE
- Tablet: sidebar plegada, tablas con menos columnas y detalle en drawer.
- Móvil: barra inferior con Inicio, Vender, Inventario y Más.
- Convierte tablas en tarjetas; no uses tablas horizontalmente desbordadas.
- Formularios en una columna.
- En Nueva venta móvil alterna entre búsqueda y venta actual, manteniendo total y acción primaria fijos abajo.
- Áreas táctiles de al menos 44 × 44 px.
- No dependas de hover.

ACCESIBILIDAD
- Contraste WCAG AA.
- Labels persistentes.
- Foco visible.
- Navegación por teclado.
- Errores vinculados al campo.
- Iconos acompañados por texto en acciones importantes.
- Estados expresados con texto, icono y color.
- Compatible con zoom al 200 %.

PROTOTIPO
Conecta las pantallas en estos recorridos:
1. Dashboard → Nueva venta → Revisión y pago → Venta registrada → Nueva venta.
2. Dashboard → Alertas de vencimiento → Lotes y vencimientos → Detalle de lote.
3. Compras → Recepción de compra → Confirmación → Existencias actualizadas.
4. Cuentas por cobrar → Detalle → Registrar abono → Saldo actualizado.
5. Caja actual → Cerrar caja → Resumen de diferencia → Caja cerrada.

RESTRICCIONES
- No conviertas cada acción en un modal.
- No uses más de una acción primaria por sección.
- No llenes el dashboard con gráficos sin propósito.
- No muestres acciones que el rol no puede ejecutar.
- No hagas que el usuario seleccione manualmente lotes en una venta normal.
- No inventes reglas definitivas para impuestos, descuentos, crédito, caja, anulaciones o medicamentos vencidos. Cuando sean necesarias para ilustrar la pantalla, identifícalas como “Pendiente de política”.
- Mantén el resultado compatible conceptualmente con React y Material UI.

Entrega un conjunto coherente de pantallas de alta fidelidad, variantes responsive y un prototipo navegable. Conserva todas las decisiones visuales en un DESIGN.md reutilizable dentro del proyecto de Stitch.
```

### Iteraciones recomendadas en Stitch

Después de la generación inicial, solicitar por separado:

1. `Reduce la densidad visual del dashboard sin eliminar información y prioriza los bloques que requieren acción.`
2. `Prueba el flujo de nueva venta sólo con teclado y mejora el orden de foco, mensajes y estados de confirmación.`
3. `Genera variantes móvil y tablet de Nueva venta, Lotes y Recepción de compra respetando el mismo sistema visual.`
4. `Revisa contraste, foco, etiquetas, objetivos táctiles y comunicación de estados según WCAG AA.`
5. `Extrae y actualiza DESIGN.md con colores, tipografía, espaciado, componentes, variantes y reglas responsive.`

Google indica que Stitch admite iteración conversacional, prototipos conectados y exportación a herramientas de desarrollo; por eso conviene generar primero las pantallas centrales y refinar luego cada flujo ([actualización oficial](https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-updates/)).

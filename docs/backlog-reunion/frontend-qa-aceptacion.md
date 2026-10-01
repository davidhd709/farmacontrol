# Backlog ejecutable — Frontend, QA y aceptación de la última reunión

## 1. Propósito y reglas de uso

Este backlog convierte los acuerdos reportados en la última reunión con el cliente en trabajo ejecutable para frontend, QA y aceptación. El estado de cada tarea se contrastó con la implementación y las pruebas existentes al 27 de septiembre de 2026.

Clasificación usada:

- **Acuerdo reportado:** comportamiento solicitado expresamente en la reunión. Puede planificarse cuando sus reglas y dependencias estén definidas.
- **Recomendación:** detalle técnico o de experiencia propuesto para hacer verificable y seguro el acuerdo; requiere validación si altera una regla del negocio.
- **Bloqueado:** no debe implementarse como regla definitiva hasta recibir la decisión indicada.

Estados usados:

- **IMPLEMENTADO:** el comportamiento observado cubre el acuerdo dentro del alcance revisado.
- **EN PROGRESO:** existe una implementación parcial, pero faltan condiciones necesarias o pruebas.
- **PENDIENTE:** no existe implementación suficiente.
- **BLOQUEADO:** depende de información del cliente o de otro contrato todavía no definido.

Este documento no confirma políticas tributarias, topes de descuento, reglas de promociones, matriz completa de permisos, modelo de costos ni umbrales definitivos de vencimiento.

## 2. Backlog funcional y de QA

### T-02 — Limpiar y corregir el Dashboard principal

**Clasificación:** Acuerdo reportado.  
**Prioridad reportada:** P1.  
**Estado comprobado:** EN PROGRESO.

**Tarea concreta**

- Retirar del Dashboard la tarjeta redundante de Gestión de Usuarios, conservando su acceso en Configuración.
- Sustituir la tarjeta de acceso al POS por un resumen de ventas del periodo cuando exista el contrato agregado correspondiente.
- Presentar por separado efectivo en caja, transferencias/bancos y cartera; no sumar esos saldos bajo una misma etiqueta.
- Hacer accionables las métricas para abrir su listado con el mismo periodo o filtro.
- Resolver los estados de carga, error, vacío y datos parciales de cada indicador sin mostrar cero como si fuera un dato confirmado cuando una consulta falla.
- Evitar calcular cartera mediante la suma de una sola página de resultados; depender de un resumen agregado de servidor.

**Dependencias**

- Contrato de resumen de ventas y dinero por periodo.
- Separación funcional Caja/Bancos y regla de enrutamiento por medio de pago.
- Definición de periodo predeterminado del Dashboard.
- Permisos de lectura por indicador.

**Criterios de aceptación verificables**

- Gestión de Usuarios no aparece como tarjeta del Dashboard para ningún rol.
- Una venta de COP 100.000 en efectivo y otra de COP 50.000 por transferencia producen COP 100.000 en Caja y COP 50.000 en Bancos; el Dashboard no muestra COP 150.000 como efectivo.
- Ventas anuladas no aumentan ventas, caja, bancos ni cartera.
- Una venta a crédito aumenta cartera, pero no Caja ni Bancos.
- Cada indicador indica el periodo y abre una consulta equivalente.
- Si una consulta falla, su tarjeta muestra error y reintento; las demás continúan disponibles.
- Los indicadores no exponen acciones o datos para los que el usuario carece de permiso.

**Pruebas necesarias**

- Pruebas de componente para permisos, carga, error independiente, vacío y navegación filtrada.
- Prueba de contrato para efectivo, transferencia, crédito y anulación.
- Prueba de regresión con más de 50 cuentas por cobrar.
- E2E del Dashboard hacia ventas, Caja, Bancos, cartera y alertas.

---

### T-03 — Crear un comprobante de venta profesional y reimprimible

**Clasificación:** Acuerdo reportado; formato físico y datos legales BLOQUEADOS por confirmación del cliente.  
**Prioridad reportada:** P0.  
**Estado comprobado:** EN PROGRESO.

**Tarea concreta**

- Sustituir el nombre, NIT y régimen fiscal ficticios y hardcodeados por datos configurados y autorizados del establecimiento.
- Crear una vista imprimible aislada de la pantalla y de los controles del diálogo.
- Mostrar número, fecha, hora, cliente y documento cuando correspondan, vendedor, productos, presentación, cantidad, precio unitario, subtotal, descuentos, total, medio de pago, recibido, cambio y estado.
- Corregir la columna de detalle para que “Subtotal” no muestre un total distinto sin etiquetarlo correctamente.
- Reutilizar los valores históricos guardados en la venta; no recalcular la reimpresión con precios, presentaciones o datos actuales.
- Marcar claramente una venta anulada en pantalla e impresión.

**Dependencias**

- Confirmación del formato objetivo: 58 mm, 80 mm, A4 u otros.
- Datos comerciales y fiscales aprobados para impresión.
- Contrato de venta con todos los valores históricos necesarios.
- T-19 y T-20 para el detalle de descuentos cuando se implementen.

**Criterios de aceptación verificables**

- Imprimir desde el resultado del POS o desde el historial genera el mismo contenido para una venta determinada.
- La salida impresa contiene únicamente el comprobante y no incluye navegación, fondo, botones ni otros elementos de la aplicación.
- No aparece información fiscal ficticia o no configurada.
- Cada línea conserva producto, presentación, factor histórico, cantidad, precio y descuento originales.
- Efectivo muestra recibido y cambio; otros medios no muestran un cambio ficticio.
- Una venta anulada conserva el comprobante original y exhibe el estado ANULADA/CANCELADA de forma textual.
- Los valores monetarios y la suma de líneas coinciden con los totales persistidos.

**Pruebas necesarias**

- Pruebas de componente con efectivo, transferencia, descuentos, múltiples líneas, múltiples lotes, cliente general y venta anulada.
- Prueba de regresión de reimpresión después de modificar producto, presentación o precio.
- Verificación visual/PDF de estilos de impresión en el formato aprobado.
- Prueba de accesibilidad del diálogo y sus acciones mediante teclado.

**Bloqueo explícito**

No publicar un diseño fiscal definitivo hasta que el cliente confirme los datos obligatorios y el formato de impresión.

---

### T-06 — Mantener INVIMA y datos farmacológicos como opcionales

**Clasificación:** Acuerdo reportado.  
**Prioridad reportada:** P1.  
**Estado comprobado:** EN PROGRESO.

**Tarea concreta**

- Conservar INVIMA, principio activo/nombre genérico y concentración como campos opcionales en el formulario y el contrato.
- Aclarar visualmente que son opcionales y evitar mensajes o indicadores de obligatoriedad.
- Verificar que la edición de productos sin esos datos no introduzca cadenas vacías como valores obligatorios.
- Añadir cobertura específica para un producto no farmacéutico.

**Dependencias**

- Ninguna política adicional para mantenerlos opcionales.
- Cualquier regla futura que condicione estos campos por tipo de producto requiere confirmación separada.

**Criterios de aceptación verificables**

- Se puede crear y editar “Caldero 20 cm” sin INVIMA, principio activo ni concentración.
- El formulario no marca esos campos como requeridos.
- La API recibe ausencia o `null` según el contrato vigente, sin enviar datos inventados.
- Los productos farmacéuticos pueden seguir registrando los tres datos.
- La tabla y el detalle muestran un valor neutro cuando no existe información.

**Pruebas necesarias**

- Prueba de formulario creando y editando un producto no farmacéutico con los campos vacíos.
- Prueba del esquema Zod con valores omitidos, vacíos y válidos.
- Prueba de integración del contrato que confirme persistencia nula y recuperación posterior.

---

### T-07 — Reorganizar categorías iniciales sin volverlas rígidas

**Clasificación:** Acuerdo reportado para usar categorías generales; catálogo exacto inicial sujeto a validación.  
**Prioridad reportada:** P1.  
**Estado comprobado:** EN PROGRESO.

**Tarea concreta**

- Mantener creación, edición, consulta e inactivación de categorías.
- Preparar un catálogo inicial validable con categorías generales reportadas en la reunión.
- Evitar codificar las categorías propuestas como enumeración o lista inmutable en el frontend.
- Revisar el seed de demostración, que actualmente usa categorías farmacológicas específicas, antes del ambiente de aceptación.

**Dependencias**

- Confirmación del cliente sobre nombres, ortografía y categorías iniciales que deben cargarse.
- Política existente de categorías duplicadas e inactivación.

**Criterios de aceptación verificables**

- Un usuario autorizado puede crear, editar e inactivar categorías sin cambiar código.
- Un usuario sin permiso de gestión sólo puede consultar.
- Las categorías iniciales aprobadas aparecen una sola vez en el ambiente limpio.
- Inactivar una categoría no rompe productos históricos asociados.
- El frontend no presupone que todo producto es medicamento.

**Pruebas necesarias**

- Regresión de CRUD lógico, duplicados y permisos ya existentes.
- Prueba del seed aprobado en una base limpia.
- Prueba de producto no farmacéutico asociado a una categoría general.

**Bloqueo explícito**

No reemplazar automáticamente las categorías existentes ni cargar como definitivos los ejemplos de la reunión sin aprobación del cliente.

---

### T-10 — Conservar alertas actuales y preparar su parametrización

**Clasificación:** Acuerdo reportado para conservar alertas; umbrales definitivos BLOQUEADOS.  
**Prioridad reportada:** P1, parcialmente bloqueada.  
**Estado comprobado:** EN PROGRESO.

**Tarea concreta**

- Mantener operativos los estados vencido, crítico, alerta y próximo con la configuración temporal actual.
- Eliminar textos que presenten 30/60/90 días como política definitiva; identificarlos como configuración vigente.
- Diseñar la UI para consumir umbrales desde un contrato configurable, sin implementar reglas por producto/proveedor hasta definirlas.
- Garantizar que texto, icono y color comuniquen la severidad.

**Dependencias**

- Investigación del cliente sobre tiempos de cambio o devolución.
- Definición de si la configuración será global, por producto, por proveedor o combinada.
- Contrato backend de configuración y precedencia, cuando se apruebe.

**Criterios de aceptación verificables**

- Las alertas actuales siguen clasificando y listando lotes sin regresión.
- La interfaz no describe 30/60/90 como política contractual definitiva.
- Un cambio futuro de umbrales no exige modificar etiquetas hardcodeadas en múltiples componentes.
- La severidad puede entenderse sin depender sólo del color.

**Pruebas necesarias**

- Pruebas de límites: vencido, hoy, 1, 30, 31, 60, 61, 90 y 91 días bajo la configuración vigente.
- Pruebas de accesibilidad de chips y tarjetas.
- Prueba de contrato parametrizable cuando se defina la API.

**Bloqueo explícito**

No implementar precedencia por producto o proveedor ni cambiar los umbrales hasta recibir la regla del cliente.

---

### T-11 — Mostrar los productos y lotes detrás de cada alerta

**Clasificación:** Acuerdo reportado; navegación de detalle es recomendación UX documentada.  
**Prioridad reportada:** P1.  
**Estado comprobado:** IMPLEMENTADO parcialmente respecto al detalle navegable.

**Tarea concreta**

- Conservar la lista existente con producto, lote, cantidad disponible, vencimiento, días restantes y estado.
- Hacer que tarjetas y contadores del Dashboard y de la página abran la lista con la severidad correspondiente.
- Añadir acceso al detalle del lote y a sus movimientos sin duplicar información extensa en la tabla.
- Incorporar filtro por periodo de vencimiento si el contrato lo permite.

**Dependencias**

- T-02 para navegación desde el Dashboard.
- Ruta o panel de detalle de lote y permiso de lectura de inventario.
- T-10 para umbrales configurables futuros.

**Criterios de aceptación verificables**

- Al seleccionar “Críticos: 5” se muestran exactamente los cinco lotes clasificados como críticos bajo el mismo corte.
- Cada fila muestra producto, lote, unidad base, cantidad, fecha, días restantes y estado.
- Buscar o filtrar restablece la página y ofrece limpiar filtros.
- El usuario puede abrir el lote o sus movimientos si tiene permiso.
- Loading, error, vacío y sin resultados se distinguen claramente.

**Pruebas necesarias**

- Prueba de navegación contador → lista filtrada.
- Pruebas de búsqueda, severidad, paginación y limpieza.
- Prueba de permisos sobre detalle y movimientos.
- Prueba de consistencia entre resumen y total filtrado.

---

### T-14 — Completar el historial de compras

**Clasificación:** Acuerdo reportado.  
**Prioridad reportada:** P1.  
**Estado comprobado:** EN PROGRESO.

**Tarea concreta**

- Añadir filtros Desde/Hasta al historial.
- Conservar factura, proveedor, fecha, receptor, condición de pago, productos, lotes, cantidades comerciales, unidades base, costos, subtotales y total en el detalle.
- Formatear cantidades discretas sin ceros decimales innecesarios, conservando decimales reales para peso o volumen.
- Dejar de depender visualmente de metadatos extraídos desde notas cuando el contrato estructurado esté disponible.

**Dependencias**

- Contrato de consulta de compras con rango de fechas.
- T-25 para reglas comunes de rango y zona horaria.
- Modelo estructurado de condición y vencimiento de factura.

**Criterios de aceptación verificables**

- Una compra puede localizarse por factura, proveedor y rango de fechas.
- El detalle muestra todos los campos acordados y coincide con el documento persistido.
- Una cantidad entera se muestra como `2`, no como `2.0000`.
- Una cantidad decimal válida conserva su precisión funcional sin redondearse a entero.
- Un rango sin resultados ofrece limpiar filtros.
- Un usuario sin permiso de recepción puede consultar si tiene lectura, pero no iniciar una recepción.

**Pruebas necesarias**

- Pruebas de filtros individuales y combinados, fechas límite y rango inválido.
- Pruebas de renderizado de `2`, valores decimales y unidades distintas.
- Prueba de detalle con varias líneas, presentaciones y lotes.
- Prueba de permisos lectura/recepción.

---

### T-17 — Mostrar existencia disponible y actualizada en el POS

**Clasificación:** Acuerdo reportado; alcance del stock por ubicación BLOQUEADO.  
**Prioridad reportada:** P0.  
**Estado comprobado:** PENDIENTE.

**Tarea concreta**

- Ampliar el contrato de búsqueda del POS para incluir existencia disponible en unidad base y su contexto de ubicación.
- Mostrar la existencia junto al producto y mantenerla visible al elegir una presentación.
- Mostrar la equivalencia que se descontará en unidad base.
- Prevenir cantidades obviamente superiores al stock conocido y manejar el conflicto definitivo devuelto por servidor.
- Invalidar o refrescar las existencias después de confirmar o anular una venta.
- No presentar stock vencido o no vendible como disponible.

**Dependencias**

- Definición del cliente sobre stock por farmacia, sede, bodega o ubicación.
- Contrato API de búsqueda con stock disponible y versión/corte del dato.
- Reglas de lotes vencidos, reservas y concurrencia.
- Asignación FEFO e idempotencia existentes.

**Criterios de aceptación verificables**

- El resultado del POS muestra `Disponible: 89 Pastillas` para una existencia base de 89.
- Elegir un blíster de factor 10 muestra que una unidad comercial consume 10 pastillas.
- Confirmar la venta actualiza la existencia mostrada sin conservar un valor obsoleto.
- Si otro usuario consume el stock, la confirmación rechaza la venta de forma comprensible y conserva el carrito para corregirlo.
- Nunca se confirma stock negativo ni se promete disponibilidad basándose sólo en validación cliente.
- Productos agotados o no vendibles se distinguen antes de agregarlos.

**Pruebas necesarias**

- Componente: stock visible, agotado, presentación y equivalencia.
- Integración: stock exacto, insuficiente, vencido y producto sin lote.
- Concurrencia con PostgreSQL real: dos ventas sobre el mismo saldo.
- E2E: búsqueda → venta → stock actualizado → anulación → stock restituido.

**Bloqueo explícito**

No etiquetar una cifra como stock total disponible hasta definir su ubicación y exclusiones.

---

### T-18 — Completar permisos del cajero y demás roles

**Clasificación:** Acuerdo reportado en términos generales; matriz detallada BLOQUEADA.  
**Prioridad reportada:** P0.  
**Estado comprobado:** EN PROGRESO.

**Tarea concreta**

- Crear una guarda de ruta por permiso además de ocultar menús y botones.
- Mostrar una pantalla de acceso restringido para navegación directa sin permiso.
- Aplicar consistentemente permisos a lectura, creación, edición, anulación, exportación y acciones sensibles.
- Construir y automatizar una matriz acción × rol cuando el cliente la apruebe.
- Verificar que el frontend no utilice roles literales dispersos cuando ya existe un permiso específico.

**Dependencias**

- Matriz definitiva de permisos para administrador, supervisor, inventario, compras, cartera y cajero.
- Contratos y guardas backend para cada endpoint.
- Decisión sobre costos sensibles, arqueo, descuentos y configuración contable.

**Criterios de aceptación verificables**

- Una ruta protegida visitada directamente no renderiza ni consulta datos sin el permiso requerido.
- Ocultar una acción en frontend coincide con la autorización backend correspondiente.
- El cajero puede acceder sólo a las funciones aprobadas y recibe una explicación si intenta una URL restringida.
- Cambiar permisos durante una sesión actualiza navegación y acceso de forma definida, sin conservar acciones indebidas.
- Ninguna prueba usa “administrador” como único rol representativo.

**Pruebas necesarias**

- Matriz parametrizada de rutas, menús y acciones por permiso.
- Pruebas API 401/403 por cada operación crítica.
- E2E de URL directa sin permiso y cambio/revocación de sesión.
- Regresión de campos sensibles y exportaciones.

**Bloqueo explícito**

No convertir las responsabilidades sugeridas en permisos definitivos hasta que el cliente apruebe la matriz.

---

### T-25 — Incorporar filtros Desde/Hasta transversalmente

**Clasificación:** Acuerdo reportado.  
**Prioridad reportada:** P0.  
**Estado comprobado:** EN PROGRESO.

**Tarea concreta**

- Normalizar un patrón reutilizable de rango de fechas para ventas, compras, Caja, Bancos, Kardex, cartera, cuentas por pagar y reportes.
- Añadirlo primero a las pantallas que carecen de UI aunque sus APIs ya acepten fechas.
- Validar `Desde <= Hasta`, conservar filtros durante paginación y ofrecer limpieza explícita.
- Alinear pantalla, exportación y consulta con la misma zona horaria y definición de fecha.

**Dependencias**

- Definición de fecha operativa por módulo: creación, documento, vencimiento o movimiento.
- Zona horaria del negocio y semántica inclusiva de Desde/Hasta.
- Módulo Bancos para aplicar allí el patrón.

**Criterios de aceptación verificables**

- Todas las pantallas enumeradas muestran Desde y Hasta o documentan por qué no aplica.
- Ambos extremos son inclusivos según la zona horaria aprobada.
- Un rango inválido no ejecuta consulta y muestra un mensaje corregible.
- Cambiar página, orden o filtros secundarios conserva el rango.
- La exportación contiene el mismo universo filtrado que la pantalla.
- Limpiar restablece rango, página y resultados.

**Pruebas necesarias**

- Pruebas del componente común: vacío, sólo Desde, sólo Hasta, rango válido e inválido.
- Casos de medianoche y cambio de día en `America/Bogota` si esa zona se confirma.
- Pruebas por módulo con filtros combinados, paginación y exportación.
- E2E de consulta mensual solicitado por contabilidad.

**Bloqueo explícito**

No fijar `createdAt` como fecha contable de todos los módulos sin validarlo.

---

### T-32 — Calcular el margen potencial del inventario

**Clasificación:** Acuerdo reportado; definición porcentual es recomendación pendiente.  
**Prioridad reportada:** P1.  
**Estado comprobado:** EN PROGRESO.

**Tarea concreta**

- Mostrar automáticamente la diferencia entre valoración potencial de venta y valoración al costo.
- Añadir el valor en el resumen y, si se aprueba, por producto.
- Etiquetarlo como margen potencial, no utilidad realizada.
- Manejar datos sin costo o sin precio sin producir valores engañosos.

**Dependencias**

- Contrato agregado con diferencia o regla de cálculo acordada.
- Confirmación de si se requiere porcentaje y sobre qué base.
- Validez del costo usado para valorar el inventario.

**Criterios de aceptación verificables**

- Costo COP 10.000.000 y venta potencial COP 13.000.000 muestran margen potencial COP 3.000.000.
- El valor coincide con la suma de los productos incluidos bajo el mismo corte.
- La interfaz distingue claramente margen potencial de utilidad de ventas.
- Productos sin costo o precio se identifican y no quedan ocultos dentro de un total aparentemente completo.

**Pruebas necesarias**

- Cálculos con cero, valores grandes, decimales y productos sin precio/costo.
- Reconciliación del resumen contra filas.
- Prueba de exportación con la diferencia si se incluye en CSV.

---

### T-33 — Completar el reporte de ventas por periodo

**Clasificación:** Acuerdo reportado; modelo de costo definitivo BLOQUEADO.  
**Prioridad reportada:** P1.  
**Estado comprobado:** EN PROGRESO con una regresión de alto riesgo.

**Tarea concreta**

- Corregir la exclusión de ventas canceladas usando el estado real del contrato, actualmente `CANCELLED`.
- Incorporar total vendido bruto, costo asociado, descuentos, venta neta, utilidad según el modelo aprobado y número de ventas.
- Mostrar detalle y resumen reconciliables, con Desde/Hasta.
- Mantener exportación y pantalla bajo el mismo contrato.

**Dependencias**

- T-25.
- T-19/T-20/T-31 para descuentos trazables.
- Definición de costo histórico de venta.
- Reglas de devolución/anulación y ventas a crédito.

**Criterios de aceptación verificables**

- Una venta `CANCELLED` no aumenta ninguna métrica del periodo.
- Ventas brutas menos descuentos producen venta neta.
- El costo corresponde al histórico de la venta, no al costo actual del producto.
- El número de ventas y los totales coinciden con el detalle filtrado.
- Efectivo, transferencia y crédito forman parte del ingreso por venta sin confundirse con recaudo.
- Pantalla y CSV coinciden para el mismo rango.

**Pruebas necesarias**

- Regresión inmediata para `COMPLETED` frente a `CANCELLED`.
- Casos de descuento, crédito, distintos medios y fechas límite.
- Reconciliación de totales, detalle y exportación.
- Pruebas de precisión monetaria y redondeo.

**Bloqueo explícito**

No etiquetar una cifra como utilidad real hasta confirmar y persistir el costo histórico aplicable.

---

### T-34 — Crear reporte de productos más vendidos

**Clasificación:** Acuerdo reportado.  
**Prioridad reportada:** P1.  
**Estado comprobado:** PENDIENTE.

**Tarea concreta**

- Crear una vista por periodo con posición, producto, unidades base vendidas y valor vendido.
- Definir claramente si la rotación se ordena por unidades o valor y permitir interpretar presentaciones mediante unidad base.
- Excluir anulaciones y descontar devoluciones cuando ese flujo exista.

**Dependencias**

- T-25 y contrato agregado de ventas por producto.
- Normalización de presentaciones a unidad base.
- Regla aprobada de anulaciones/devoluciones.

**Criterios de aceptación verificables**

- El ranking muestra producto, unidades vendidas, valor vendido y posición.
- Ventas por unidad, blíster y caja se consolidan correctamente en unidad base.
- Las ventas canceladas no alteran el ranking.
- Empates y orden secundario son deterministas y documentados técnicamente.
- Un periodo sin ventas muestra estado vacío, no una gráfica de ceros.

**Pruebas necesarias**

- Consolidación de múltiples presentaciones del mismo producto.
- Anulaciones, empates, paginación y límites de periodo.
- Correspondencia entre resumen visual y exportación.

---

### T-35 — Analizar ventas por día

**Clasificación:** Acuerdo reportado.  
**Prioridad reportada:** P2.  
**Estado comprobado:** PENDIENTE.

**Tarea concreta**

- Crear una serie diaria para el periodo elegido y una tabla accesible equivalente.
- Permitir identificar días de mayor y menor venta sin derivar conclusiones promocionales automáticas.
- Diferenciar días sin operación de días con venta cero si el calendario operativo lo requiere.

**Dependencias**

- T-25 y T-33.
- Zona horaria y calendario operativo confirmados.
- Contrato agregado por día.

**Criterios de aceptación verificables**

- Cada venta se agrupa en el día correcto según la zona aprobada.
- El máximo y mínimo mostrados coinciden con la serie y la tabla.
- Las ventas canceladas no se incluyen.
- La visualización dispone de alternativa textual/tabular.
- El cambio de rango actualiza datos y etiquetas.

**Pruebas necesarias**

- Cruces de medianoche, días vacíos, empates y rango de un solo día.
- Accesibilidad de gráfica y tabla.
- Reconciliación con el total de T-33.

---

### T-36 — Mejorar visualmente los reportes

**Clasificación:** Acuerdo reportado con restricción UX de no usar gráficos decorativos.  
**Prioridad reportada:** P2.  
**Estado comprobado:** EN PROGRESO.

**Tarea concreta**

- Reorganizar los reportes en resumen ejecutivo, visualización accionable y detalle.
- Añadir únicamente gráficas respaldadas por T-32 a T-35 u otros contratos aprobados.
- Mantener tabla/exportación accesible y estados de carga, vacío y error.
- Diseñar comportamiento responsive para escritorio, tablet y móvil.

**Dependencias**

- T-32, T-33, T-34 y T-35 con datos confiables.
- Priorización del cliente sobre utilidad, cartera y vencimientos.
- Diseño UX validado con usuarios representativos.

**Criterios de aceptación verificables**

- Cada gráfica responde una pregunta operativa concreta y enlaza o acompaña el detalle correspondiente.
- La información esencial puede consultarse sin interpretar sólo color o pasar el cursor.
- Filtros y periodo son visibles y consistentes entre resumen, gráfica, tabla y CSV.
- No se muestran métricas parciales como totales completos.
- La pantalla funciona a 200 % de zoom y en móvil sin perder acciones esenciales.

**Pruebas necesarias**

- Pruebas visuales en tres anchos y zoom 200 %.
- Accesibilidad por teclado y lector de pantalla de controles y alternativas de gráficas.
- Estados loading/error/empty/success.
- Prueba de consistencia numérica entre todos los formatos.

---

### T-37 — Crear módulo separado de Promociones

**Clasificación:** Acuerdo reportado para separar promoción de descuento; reglas finales BLOQUEADAS.  
**Prioridad reportada:** P2.  
**Estado comprobado:** PENDIENTE.

**Tarea concreta**

- Diseñar un módulo de promociones separado del descuento puntual de una venta.
- Preparar listado, formulario, detalle, estados y permisos cuando las reglas estén listas.
- No reutilizar el campo de descuento manual como única representación de una promoción.

**Dependencias**

- Confirmación de los casos iniciales del cliente.
- T-38 y reglas de permisos.
- Contratos y persistencia específicos de promoción.
- T-19/T-20 para mantener separación con descuentos manuales.

**Criterios de aceptación verificables**

- Una promoción se administra fuera del flujo de una venta individual.
- La interfaz distingue nombre, vigencia, estado y alcance aprobados.
- Sólo usuarios autorizados pueden crear, editar, activar o inactivar.
- El historial de ventas puede identificar la promoción aplicada sin confundirla con un descuento manual.

**Pruebas necesarias**

- Permisos y estados de formulario.
- Vigencia futura, activa, vencida e inactiva.
- Regresión que demuestre la separación promoción/descuento manual.

**Bloqueo explícito**

No implementar el módulo definitivo hasta confirmar alcances, solapamientos, precedencia y autorizaciones.

---

### T-38 — Parametrizar promociones

**Clasificación:** Nombre, porcentaje, vigencia y estado fueron reportados; alcances por categoría/laboratorio/proveedor son propuestas parcialmente BLOQUEADAS.  
**Prioridad reportada:** P2.  
**Estado comprobado:** PENDIENTE.

**Tarea concreta**

- Implementar, tras aprobación, el formulario mínimo con nombre, porcentaje, inicio, fin, estado y alcance confirmado.
- Validar fechas, porcentaje y selección del alcance.
- Mostrar conflictos con otras promociones sin resolverlos silenciosamente en frontend.

**Dependencias**

- T-37.
- Confirmación del primer alcance soportado.
- Reglas de solapamiento, precedencia, acumulación y zona horaria.

**Criterios de aceptación verificables**

- No se guarda una promoción con nombre vacío, porcentaje inválido o fin anterior al inicio.
- Una promoción inactiva o fuera de vigencia no se presenta como aplicable.
- El alcance guardado se puede revisar antes de confirmar.
- Un conflicto de vigencia o alcance recibe una respuesta explícita del servidor y un mensaje corregible.

**Pruebas necesarias**

- Límites de porcentaje y fechas.
- Zona horaria en inicio/fin.
- Permisos y conflictos concurrentes.
- Pruebas por cada alcance que el cliente apruebe, sin anticipar los demás.

**Bloqueo explícito**

No implementar alcances por categoría, laboratorio o proveedor sólo porque fueron mencionados como posibilidades.

---

### T-39 — Aplicar promociones automáticamente en el POS

**Clasificación:** Acuerdo reportado; combinación con descuento manual BLOQUEADA.  
**Prioridad reportada:** P2.  
**Estado comprobado:** PENDIENTE.

**Tarea concreta**

- Mostrar precio normal, promoción aplicada, descuento promocional y precio final devueltos por el servidor.
- Aplicar la promoción automáticamente sin permitir que el cajero falsifique su vigencia o cálculo.
- Conservar el identificador y los valores históricos de la promoción en la venta y el comprobante.
- Recalcular de forma controlada si cambia producto, presentación, cantidad o fecha antes de confirmar.

**Dependencias**

- T-17, T-20, T-37 y T-38.
- Motor backend de elegibilidad y cálculo.
- Regla aprobada de acumulación con descuentos manuales.

**Criterios de aceptación verificables**

- Para una promoción válida de 10 % sobre COP 20.000, el POS muestra precio normal COP 20.000, promoción COP 2.000 y final COP 18.000; este ejemplo es prueba matemática, no política global.
- Una promoción vencida, futura o inactiva no se aplica.
- El comprobante y el historial identifican la promoción y conservan sus valores originales.
- El servidor vuelve a validar la promoción al confirmar la venta.
- Un cambio concurrente produce un mensaje claro y no confirma con un total obsoleto.

**Pruebas necesarias**

- Elegible/no elegible, inicio/fin, cambio de presentación y múltiples líneas.
- Concurrencia entre carga del carrito y confirmación.
- Idempotencia de confirmación.
- Comprobante, historial y reporte con promoción.

**Bloqueo explícito**

No definir desde frontend qué descuento prevalece cuando coinciden promoción y descuento manual.

## 3. Backlog UAT y aceptación

Las tareas T-40 y T-41 son criterios de aceptación del sistema, no sustituyen las pruebas automatizadas de cada historia ni deben ejecutarse sobre producción.

### T-40 — Preparar ambiente limpio de aceptación del cliente

**Clasificación:** Acuerdo reportado; credenciales y fecha de entrega dependen de coordinación.  
**Prioridad reportada:** P0 después de los cambios operativos previos.  
**Estado comprobado:** PENDIENTE.

**Tarea concreta**

- Crear un ambiente UAT separado de desarrollo, pruebas automatizadas y producción.
- Proveer un procedimiento seguro y repetible para reiniciar sólo UAT.
- Cargar exclusivamente configuración técnica mínima, roles aprobados y usuarios de aceptación; el cliente debe crear los datos operativos del recorrido.
- Preparar credenciales por rol, checklist, canal de incidencias, evidencia y política de respaldo/restauración.
- Mostrar claramente en la interfaz que se trata de un ambiente de pruebas.

**Dependencias de entrada a UAT**

- Correcciones P0 acordadas, especialmente T-03, T-09, T-17, T-18 y T-25.
- Caja/Bancos y contratos necesarios para efectivo, transferencia y crédito.
- Módulos contables que el cliente deba evaluar disponibles y declarados con su alcance real.
- Matriz de roles aprobada.
- Datos legales del comprobante y decisiones de negocio no bloqueadas.

**Criterios de aceptación del ambiente**

- UAT usa base, secretos, dominio y almacenamiento separados de producción.
- Reiniciar UAT no puede borrar desarrollo, pruebas automatizadas ni producción.
- El estado inicial y los únicos datos precargados están documentados.
- Cada participante recibe un usuario con el rol que va a validar, sin compartir credenciales administrativas.
- Existe respaldo previo al reinicio y procedimiento probado de restauración.
- Logs y correlación permiten rastrear una incidencia sin exponer datos sensibles.
- El cliente puede completar el recorrido acordado desde categorías hasta reportes sin intervención sobre la base de datos.

**Pruebas y verificaciones necesarias**

- Smoke test posterior a cada reinicio: salud, login, permisos, API, base y flujo no destructivo.
- Ensayo de reset y restauración sobre UAT.
- Verificación de aislamiento y de que no existen datos personales reales.
- Checklist de navegadores/dispositivos acordados.

**Criterio de salida**

- Ambiente estable, credenciales entregadas, checklist aprobado y cero defectos bloqueantes conocidos en el recorrido inicial.

**Bloqueo explícito**

No reutilizar `farmacia_test` ni producción como ambiente de aceptación. No entregar credenciales hasta definir participantes y alcance habilitado.

---

### T-41 — Ejecutar simulación de operación real durante varios días

**Clasificación:** Acuerdo reportado; duración, participantes y criterio de aprobación BLOQUEADOS por coordinación con el cliente.  
**Prioridad reportada:** P0 antes de producción.  
**Estado comprobado:** PENDIENTE.

**Tarea concreta**

- Ejecutar en UAT una simulación multidiaria del flujo aprobado.
- Registrar cada escenario con usuario, fecha operativa, datos sintéticos, resultado esperado, resultado real, evidencia e incidencia asociada.
- Conciliar al cierre de cada día ventas, inventario, Kardex, Caja, Bancos, cartera, cuentas por pagar y reportes.
- Clasificar hallazgos, repetir regresión tras correcciones y obtener aprobación explícita antes de producción.

**Dependencias de entrada a la simulación**

- T-40 completada.
- T-02, T-03, T-06, T-07, T-09, T-11, T-14, T-17, T-18 y T-25 aceptadas para el alcance operativo.
- Caja/Bancos, cartera y cuentas por pagar disponibles para los medios incluidos.
- Descuentos y promociones sólo se incluyen si sus políticas fueron aprobadas e implementadas.
- Reportes/contabilidad incluidos sólo hasta el alcance declarado como listo.

**Guion mínimo de aceptación**

1. Día inicial: crear categorías, productos farmacéuticos y no farmacéuticos, unidades, presentaciones, proveedores y clientes.
2. Recibir compras con producto controlado por lote y producto sin control de lote.
3. Comprobar existencias, equivalencias, lotes, vencimientos y Kardex.
4. Vender por unidad y por presentación comercial con FEFO.
5. Cobrar en efectivo, transferencia y crédito; verificar el destino de cada valor.
6. Aplicar descuento o promoción únicamente si la política correspondiente fue aprobada.
7. Registrar y consultar movimientos autorizados de Caja, Bancos, cartera y cuentas por pagar.
8. Reimprimir comprobantes y anular al menos una venta autorizada.
9. Cerrar cada día conciliando stock, Kardex, Caja, Bancos y saldos.
10. Consultar filtros y reportes para cada día y para el periodo completo.

**Criterios de aceptación UAT**

- Cada venta puede rastrearse hasta sus líneas, presentación, lotes, movimiento de inventario y destino monetario.
- No existen stock negativo, duplicación por doble envío ni saldos parciales después de errores simulados.
- Efectivo, transferencias y crédito concilian por separado.
- Reimpresión, anulación y filtros conservan datos históricos y permisos.
- Los reportes del periodo reconcilian con los movimientos de detalle bajo las reglas aprobadas.
- Todo defecto tiene severidad, evidencia, responsable y decisión antes del cierre.
- No quedan defectos críticos o bloqueantes abiertos para solicitar pase a producción.
- El cliente registra aceptación explícita o lista de observaciones pendientes.

**Pruebas complementarias necesarias**

- E2E automatizado del camino crítico como regresión, sin sustituir la sesión con usuarios.
- Pruebas concurrentes sobre stock, doble confirmación y pagos repetidos.
- Pérdida de red durante confirmación con verificación de idempotencia.
- Smoke test al inicio de cada jornada y regresión al cerrar defectos.

**Criterio de salida**

- Conciliación final aprobada, evidencias archivadas, regresión crítica aprobada, defectos bloqueantes cerrados y decisión documentada de salida o no salida a producción.

**Bloqueo explícito**

No fijar duración, participantes, datos ni resultado de aprobación sin acordarlos con el cliente. No simular políticas que continúan pendientes.

## 4. Orden ejecutable recomendado para este frente

1. **Correcciones operativas P0:** T-03, T-17 y la parte aprobada de T-18; coordinar T-09 con backend aunque no forme parte de este archivo.
2. **Catálogo y consulta operativa:** cerrar cobertura de T-06, validar T-07, completar T-11 y T-14.
3. **Consultas transversales:** T-25 y correcciones del Dashboard T-02 cuando Caja/Bancos exponga contratos confiables.
4. **Reportes confiables antes que visuales:** T-32, corrección inmediata de T-33, T-34 y T-35; luego T-36.
5. **Promociones sólo tras definición:** T-37, T-38 y T-39.
6. **Aceptación:** T-40 y, con criterios de entrada cumplidos, T-41.

## 5. Definition of Done del backlog frontend/QA

Una tarea de este documento sólo puede marcarse IMPLEMENTADA cuando:

- cumple sus criterios verificables y no depende de una regla pendiente;
- los permisos están representados en interfaz y validados por backend;
- contempla loading, error, vacío, éxito y sin permiso cuando correspondan;
- funciona en escritorio y móvil conforme al diseño vigente;
- incluye pruebas proporcionales al riesgo y éstas fueron ejecutadas;
- formatter, lint, typecheck, build y regresión relacionada pasan;
- contratos, documentación y datos de prueba se mantienen sincronizados;
- no introduce datos fiscales, porcentajes, umbrales, costos ni permisos inventados;
- el diff fue revisado y no modifica funcionalidad fuera del slice.

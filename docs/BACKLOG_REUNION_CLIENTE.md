# Backlog de la última reunión con el cliente

**Estado:** propuesta de ejecución basada en minuta; pendiente de ratificación del cliente.  
**Revisión estática:** 27 de septiembre de 2026.  
**Requerimientos:** [levantamiento actualizado 0.2](levantamiento-requerimientos-farmacia-v02.md).

> El adjunto mezcla acuerdos reportados, ejemplos, recomendaciones y prioridades sugeridas; no es transcripción literal. P0/P1/P2 son prioridades provisionales de esa minuta. Léase primero la [nota de clasificación y supersedencias](backlog-reunion/criterios-de-integracion.md), que resuelve discrepancias entre el índice y las fichas especializadas.

## Uso y estados canónicos

Los estados de esta tabla son los estados canónicos del backlog. Expresiones técnicas más detalladas en las fichas son descripción, no un estado adicional.

- **IMPLEMENTADO:** criterios cumplidos y pruebas ejecutadas con evidencia.
- **EN PROGRESO:** existe una parte, pero faltan criterios, integración, seguridad o validación.
- **PENDIENTE:** no hay implementación suficiente o falta iniciar el slice.
- **BLOQUEADO:** falta una política del cliente/contadora o una dependencia necesaria.

La inspección estática no certifica aceptación ni prueba en ejecución. Trabajar cada tarea como slice verificable. Las operaciones críticas deben mantener transacción, autorización backend, trazabilidad e idempotencia; los cambios de esquema usan migración nueva.

Detalle por especialidad: [backend y datos](backlog-reunion/backend-datos.md) · [frontend, QA y aceptación](backlog-reunion/frontend-qa-aceptacion.md).

## Resumen de riesgos

- T-33 puede incluir ventas canceladas al comparar con el estado incorrecto. Es una regresión aislable: confirmar el estado canónico y cubrirlo antes de ampliar el reporte.
- T-09 exige diseñar saldo sin lote y migrar datos; no se resuelve ocultando campos.
- T-17 no está implementada: el POS no muestra existencias.
- T-21/T-24 mezclan transferencias con efectivo y algunas operaciones de pago reducen Caja. No hay módulo bancario.
- T-03 presenta identificación comercial/fiscal hardcodeada, aparentemente de ejemplo.
- T-04/T-05 no aplican las restricciones administrativas reportadas.
- T-19 acepta valores sin política aprobada; T-28 a T-31 no se deben ejecutar como contabilidad antes de aprobación y definiciones de la contadora.
- T-40/T-41 requieren UAT aislado y un guion aprobado; el test database no es ambiente UAT.

## Cobertura T-01 a T-41

| Tarea | Resumen                        | Prioridad minuta | Estado canónico | Detalle                                                                                                                                                                                      |
| ----- | ------------------------------ | ---------------: | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-01  | Nombre definitivo              |               P2 | BLOQUEADO       | Decisión del cliente; no bloquea otras tareas.                                                                                                                                               |
| T-02  | Dashboard y cifras             |               P1 | EN PROGRESO     | [T-02](backlog-reunion/frontend-qa-aceptacion.md#t-02--limpiar-y-corregir-el-dashboard-principal)                                                                                            |
| T-03  | Comprobante reimprimible       |               P0 | EN PROGRESO     | [T-03](backlog-reunion/frontend-qa-aceptacion.md#t-03--crear-un-comprobante-de-venta-profesional-y-reimprimible)                                                                             |
| T-04  | Corregir documento cliente     |               P1 | EN PROGRESO     | [T-04](backlog-reunion/backend-datos.md#t-04--corrección-administrativa-del-documento-de-cliente)                                                                                            |
| T-05  | Corregir NIT proveedor         |               P1 | EN PROGRESO     | [T-05](backlog-reunion/backend-datos.md#t-05--corrección-administrativa-del-nit-de-proveedor)                                                                                                |
| T-06  | Datos farmacéuticos opcionales |               P1 | EN PROGRESO     | [T-06](backlog-reunion/frontend-qa-aceptacion.md#t-06--mantener-invima-y-datos-farmacológicos-como-opcionales)                                                                               |
| T-07  | Categorías generales           |               P1 | EN PROGRESO     | [T-07](backlog-reunion/frontend-qa-aceptacion.md#t-07--reorganizar-categorías-iniciales-sin-volverlas-rígidas)                                                                               |
| T-08  | Unidad base y presentaciones   |               P0 | EN PROGRESO     | [T-08](backlog-reunion/backend-datos.md#t-08--cerrar-el-modelo-de-unidad-base-y-presentaciones); decimalidad por definir.                                                                    |
| T-09  | Lote/vencimiento condicional   |               P0 | PENDIENTE       | [T-09](backlog-reunion/backend-datos.md#t-09--hacer-lote-y-vencimiento-condicionales-por-producto); decisión de saldo sin lote necesaria.                                                    |
| T-10  | Alertas parametrizables        |               P1 | BLOQUEADO       | [T-10](backlog-reunion/frontend-qa-aceptacion.md#t-10--conservar-alertas-actuales-y-preparar-su-parametrización); mantener umbrales actuales como temporales.                                |
| T-11  | Ver detalle detrás de alertas  |               P1 | EN PROGRESO     | [T-11](backlog-reunion/frontend-qa-aceptacion.md#t-11--mostrar-los-productos-y-lotes-detrás-de-cada-alerta)                                                                                  |
| T-12  | Devolución/cambio proveedor    |                — | BLOQUEADO       | Proceso y efectos pendientes del cliente.                                                                                                                                                    |
| T-13  | Recepción por presentación     |               P0 | EN PROGRESO     | [T-13](backlog-reunion/backend-datos.md#t-13--consolidar-recepción-de-compra-mediante-presentaciones)                                                                                        |
| T-14  | Historial de compras           |               P1 | EN PROGRESO     | [Backend](backlog-reunion/backend-datos.md#t-14--completar-consulta-e-historial-de-compras) · [Frontend](backlog-reunion/frontend-qa-aceptacion.md#t-14--completar-el-historial-de-compras)  |
| T-15  | Descuento en compra            |                — | BLOQUEADO       | [T-15](backlog-reunion/backend-datos.md#t-15--definir-y-registrar-descuentos-en-compras); definición contable.                                                                               |
| T-16  | Impuestos                      |                — | BLOQUEADO       | [T-16](backlog-reunion/backend-datos.md#t-16--definir-impuestos-de-compras-y-ventas); definición fiscal.                                                                                     |
| T-17  | Existencias en POS             |               P0 | PENDIENTE       | [T-17](backlog-reunion/frontend-qa-aceptacion.md#t-17--mostrar-existencia-disponible-y-actualizada-en-el-pos)                                                                                |
| T-18  | Permisos por rol               |               P0 | EN PROGRESO     | [T-18](backlog-reunion/frontend-qa-aceptacion.md#t-18--completar-permisos-del-cajero-y-demás-roles); matriz por confirmar.                                                                   |
| T-19  | Descuento manual limitado      |               P1 | BLOQUEADO       | [T-19](backlog-reunion/backend-datos.md#t-19--aplicar-descuento-manual-controlado); límite/rol no definidos.                                                                                 |
| T-20  | Motivo de descuento            |               P1 | BLOQUEADO       | [T-20](backlog-reunion/backend-datos.md#t-20--registrar-motivo-y-autorización-del-descuento); formato por definir.                                                                           |
| T-21  | Caja de efectivo               |               P0 | EN PROGRESO     | [T-21](backlog-reunion/backend-datos.md#t-21--convertir-caja-en-auxiliar-exclusivo-de-efectivo); resolver cajas/turnos.                                                                      |
| T-22  | Auxiliar Bancos                |               P0 | PENDIENTE       | [T-22](backlog-reunion/backend-datos.md#t-22--crear-auxiliar-de-bancos); depende de cuentas bancarias.                                                                                       |
| T-23  | Catálogo de bancos             |               P1 | PENDIENTE       | [T-23](backlog-reunion/backend-datos.md#t-23--crear-catálogo-de-cuentas-bancarias)                                                                                                           |
| T-24  | Enrutamiento por medio de pago |               P0 | PENDIENTE       | [T-24](backlog-reunion/backend-datos.md#t-24--enrutar-movimientos-por-medio-de-pago); depende de T-21/T-22/T-23 y políticas de crédito.                                                      |
| T-25  | Filtros Desde/Hasta            |               P0 | EN PROGRESO     | [Backend](backlog-reunion/backend-datos.md#t-25--normalizar-filtros-desdehasta) · [Frontend](backlog-reunion/frontend-qa-aceptacion.md#t-25--incorporar-filtros-desdehasta-transversalmente) |
| T-26  | Cuentas por Cobrar             |               P1 | EN PROGRESO     | [T-26](backlog-reunion/backend-datos.md#t-26--completar-cuentas-por-cobrar); integración a crédito pendiente.                                                                                |
| T-27  | Cuentas por Pagar              |               P1 | EN PROGRESO     | [T-27](backlog-reunion/backend-datos.md#t-27--completar-cuentas-por-pagar-y-otras-obligaciones)                                                                                              |
| T-28  | Estado de Situación Financiera |               P1 | BLOQUEADO       | [T-28](backlog-reunion/backend-datos.md#t-28--estado-de-situación-financiera-a-una-fecha); cambio de alcance.                                                                                |
| T-29  | Estado de Resultados           |               P1 | BLOQUEADO       | [T-29](backlog-reunion/backend-datos.md#t-29--estado-de-resultados-por-periodo); costeo/contabilidad pendientes.                                                                             |
| T-30  | Gastos causados y pagos        |               P1 | BLOQUEADO       | [T-30](backlog-reunion/backend-datos.md#t-30--registrar-gasto-causado-separado-de-su-pago)                                                                                                   |
| T-31  | Descuentos como menor ingreso  |               P1 | EN PROGRESO     | [T-31](backlog-reunion/backend-datos.md#t-31--integrar-descuentos-de-venta-con-estado-de-resultados); depende de política contable.                                                          |
| T-32  | Margen potencial de inventario |               P1 | EN PROGRESO     | [T-32](backlog-reunion/frontend-qa-aceptacion.md#t-32--calcular-el-margen-potencial-del-inventario); no equivale a utilidad realizada.                                                       |
| T-33  | Ventas por periodo             |               P1 | EN PROGRESO     | [T-33](backlog-reunion/frontend-qa-aceptacion.md#t-33--completar-el-reporte-de-ventas-por-periodo); posible inclusión de anuladas.                                                           |
| T-34  | Productos más vendidos         |               P1 | PENDIENTE       | [T-34](backlog-reunion/frontend-qa-aceptacion.md#t-34--crear-reporte-de-productos-más-vendidos)                                                                                              |
| T-35  | Ventas por día                 |               P2 | PENDIENTE       | [T-35](backlog-reunion/frontend-qa-aceptacion.md#t-35--analizar-ventas-por-día); propuesta por ratificar.                                                                                    |
| T-36  | Mejoras visuales de reportes   |               P2 | PENDIENTE       | [T-36](backlog-reunion/frontend-qa-aceptacion.md#t-36--mejorar-visualmente-los-reportes); datos primero.                                                                                     |
| T-37  | Módulo de promociones          |               P2 | BLOQUEADO       | [T-37](backlog-reunion/frontend-qa-aceptacion.md#t-37--crear-módulo-separado-de-promociones); reglas pendientes.                                                                             |
| T-38  | Parámetros de promoción        |               P2 | BLOQUEADO       | [T-38](backlog-reunion/frontend-qa-aceptacion.md#t-38--parametrizar-promociones)                                                                                                             |
| T-39  | Aplicación automática en POS   |               P2 | BLOQUEADO       | [T-39](backlog-reunion/frontend-qa-aceptacion.md#t-39--aplicar-promociones-automáticamente-en-el-pos)                                                                                        |
| T-40  | Ambiente de aceptación         | P0 preproducción | PENDIENTE       | [T-40](backlog-reunion/frontend-qa-aceptacion.md#t-40--preparar-ambiente-limpio-de-aceptación-del-cliente)                                                                                   |
| T-41  | Simulación de varios días      | P0 preproducción | PENDIENTE       | [T-41](backlog-reunion/frontend-qa-aceptacion.md#t-41--ejecutar-simulación-de-operación-real-durante-varios-días)                                                                            |

## Secuencia sugerida

1. Corregir T-33 con una prueba de regresión para `CANCELLED`; validar contrato antes de ampliar métricas.
2. Resolver decisiones de cantidad fraccionaria y saldo no loteado; ejecutar T-08 → T-09 → T-13 → T-14. Después integrar T-17.
3. Aprobar matriz de permisos y completar T-04/T-05/T-18. T-19/T-20 solo avanzan después de aprobar la política de descuentos.
4. Definir las cajas y cuentas. Ejecutar T-23 (cuentas bancarias) → T-22 (auxiliar de Bancos); T-21 puede avanzar en paralelo una vez definida política de cajas. Después integrar todo en T-24.
5. Completar T-25 y los reportes operativos T-02/T-32/T-33/T-34. T-35 requiere ratificación; T-36 depende de datos confiables.
6. Aprobar el alcance contable con la contadora antes de poner T-28/T-29/T-30/T-31 en ejecución.
7. Confirmar reglas de promoción y descuento antes de T-37 → T-38 → T-39.
8. Completar T-40 y luego T-41 en ambiente separado, tras satisfacer sus dependencias.

No es calendario ni aprobación final del MVP. La minuta no justifica ejecutar todas las tareas en paralelo.

## Definiciones necesarias para cerrar tareas

1. ¿La unidad base puede ser decimal para peso/volumen? ¿Inventario sin lote se lleva por ubicación?
2. ¿Qué ubicación, reservas y vencidos determinan stock disponible del POS?
3. ¿Qué formato, numeración y datos legales se imprimen en el comprobante?
4. ¿Qué acciones permite cada rol, incluyendo costos, anulaciones, descuentos, caja y exportaciones?
5. ¿Cuál es el tope de descuento, cómo se expresa y quién autoriza excepciones?
6. ¿Caja se organiza por farmacia, sede, cajero o turno? ¿Qué apertura, cierre y arqueo necesita?
7. ¿Qué cuentas bancarias, medios mixtos, tarjetas, comisiones y reversos se admiten?
8. ¿Cómo se autoriza crédito y se define su vencimiento/cupo?
9. ¿Contabilidad formal o reportes gerenciales? ¿Qué plan, saldos iniciales y cierres define la contadora?
10. ¿Qué método de costo y tratamiento de devoluciones/anulaciones se aplican?
11. ¿Qué impuestos y descuentos aplican a compras y ventas?
12. ¿Cómo se combinan promociones con descuentos manuales?
13. ¿Qué tiempos y proceso de devolución acepta cada proveedor?
14. ¿Quién participa en UAT, durante cuánto tiempo y cómo aprueba?

## Definition of Done

- Criterios de aceptación cumplidos y políticas necesarias resueltas.
- Migración, API/OpenAPI y documentación actualizadas cuando corresponda.
- Permisos backend, trazabilidad y protección ante duplicados en operaciones críticas.
- Dinero con aritmética decimal exacta y cantidades conforme a política.
- Pruebas proporcionales al riesgo ejecutadas, incluyendo PostgreSQL real para transacciones/concurrencia.
- Formatter, lint, typecheck, build, regresión y revisión de diff con resultado informado.
- No se presenta una recomendación, ejemplo o prioridad provisional como decisión del cliente.

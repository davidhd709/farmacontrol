# Levantamiento de requerimientos — Farmacia (versión 0.2)

**Fuente:** levantamiento inicial 0.1 y minuta interpretada de la última reunión.  
**Estado:** actualización preliminar, pendiente de aprobación del cliente y la contadora.  
**Documento base:** [levantamiento de requerimientos 0.1](levantamiento-requerimientos-farmacia.md).

> El archivo de reunión empieza como una propuesta de backlog (“Yo lo convertiría en un backlog…”) y mezcla acuerdos reportados, recomendaciones, ejemplos y prioridades. No es una transcripción literal. Por trazabilidad, las necesidades nuevas se clasifican como **reportadas en la minuta** hasta que el cliente confirme el acta. Este documento complementa la versión 0.1; las prioridades y el texto de la minuta no aprueban automáticamente cambios de alcance.

## 1. Propósito y clasificación

La actualización registra necesidades de operación sobre productos, compras, POS, tesorería y reportes. También plantea estados financieros y causación de gastos, lo cual amplía el alcance inicial. La arquitectura vigente de monolito modular continúa siendo la referencia.

- **Reportado como acuerdo:** la minuta atribuye expresamente la necesidad a la reunión; falta ratificación del cliente.
- **Pendiente:** requiere definición del cliente o la contadora antes de implementar la regla final.
- **Recomendación/ejemplo:** propuesta del redactor que no constituye requerimiento aprobado.
- **Estado del software:** evidencia estática del repositorio; no equivale a aceptación ni a prueba ejecutada.

Los requisitos RF-028 a RF-048 de esta versión y las tareas T-01 a T-41 se relacionan en el [backlog de la reunión](BACKLOG_REUNION_CLIENTE.md).

## 2. Requisitos nuevos o ampliados

Todos los RF de esta sección son **reportados en la minuta y pendientes de ratificación**, salvo que la fila indique una decisión pendiente adicional.

| ID     | Requisito reportado                                                                                                                                                                                               | Estado/decisiones pendientes                                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-028 | Retirar del Dashboard el acceso redundante a gestión de usuarios y priorizar información operativa.                                                                                                               | Los indicadores, periodos y cifras que compondrán cada KPI requieren definición.                                                                                |
| RF-029 | Abrir e imprimir desde el historial un comprobante independiente de la tabla, reproduciendo los datos originales de la venta.                                                                                     | Definir naturaleza fiscal/no fiscal, numeración, tamaño y datos legales autorizados. No usar datos ficticios.                                                   |
| RF-030 | Solo el administrador podrá corregir documento de cliente y NIT/identificación del proveedor; validar duplicados y conservar relaciones históricas.                                                               | Confirmar cambio del tipo de documento y auditoría explícita de la corrección.                                                                                  |
| RF-031 | Registro sanitario/INVIMA, principio activo y concentración serán opcionales cuando no apliquen al producto.                                                                                                      | Reportado sin pendiente material.                                                                                                                               |
| RF-032 | Categorías generales deben poder crearse, editarse y activarse/inactivarse.                                                                                                                                       | Ejemplos de categorías no son lista cerrada; catálogo inicial por acordar.                                                                                      |
| RF-033 | Existencias y movimientos se expresan en unidad base por producto; presentaciones conservan factor histórico y se habilitan para compra, venta o ambas.                                                           | Determinar si peso/volumen admite cantidades base fraccionarias.                                                                                                |
| RF-034 | Compra/recepción exige lote y vencimiento solo cuando el producto tiene habilitado ese control; regla obligatoria en UI, API y persistencia.                                                                      | Definir representación de inventario sin lote antes de la migración. No inventar lotes ni fechas.                                                               |
| RF-035 | Los indicadores de vencimiento permiten consultar los productos/lotes subyacentes, cantidad, vencimiento, días y estado.                                                                                          | Umbrales siguen abiertos.                                                                                                                                       |
| RF-036 | Mantener alertas actuales mientras se acuerdan tiempos de gestión de cambios/devoluciones.                                                                                                                        | Rangos 30/60/90 son referencias, no política. Regla final puede depender de producto/proveedor.                                                                 |
| RF-037 | Recepción e historial conservan proveedor, factura, fechas, receptor, condición de pago y líneas con presentación, cantidad comercial, factor histórico, cantidad base, costos y lote/vencimiento cuando aplique. | Descuentos de compra e impuestos requieren decisión contable.                                                                                                   |
| RF-038 | POS muestra existencias vigentes en unidad base y su unidad de medida.                                                                                                                                            | Definir sede/bodega de consulta, reservas y tratamiento de vencidos.                                                                                            |
| RF-039 | Cajero se restringe a POS, ventas y acciones autorizadas de caja; las operaciones sensibles se protegen en backend.                                                                                               | Roles mencionados: administrador, supervisor, inventario, compras, cartera y cajero. Matriz completa, permisos de costos y operaciones sensibles pendientes.    |
| RF-040 | Descuentos puntuales deben conservarse en venta, comprobante, historial e informes y asociarse a un motivo.                                                                                                       | Definir porcentaje/valor, límite, autorización, rol y captura del motivo. 10 % es solo ejemplo.                                                                 |
| RF-041 | Caja representa efectivo; transferencias ingresan a Bancos y una venta a crédito genera Cuentas por Cobrar.                                                                                                       | Definir pagos mixtos, medios, cuentas destino, comisiones, conciliación y reversos.                                                                             |
| RF-042 | Consultar auxiliares con fecha, concepto, débitos, créditos, saldo y referencia; Banco identifica la cuenta.                                                                                                      | Definir una/múltiples cajas, apertura, cierre, base, arqueo y tolerancias.                                                                                      |
| RF-043 | Incorporar filtros Desde/Hasta en ventas, compras, caja, bancos, Kardex, cartera, CxP e informes.                                                                                                                 | Definir inclusividad, zona horaria y si se filtra fecha operativa, documento o registro.                                                                        |
| RF-044 | Mantener módulos de Cuentas por Cobrar y Cuentas por Pagar y distinguir obligación causada de pago.                                                                                                               | Ampliar CxP a servicios u obligaciones que no provengan de compras requiere aprobación.                                                                         |
| RF-045 | La minuta solicita Estado de Situación Financiera a una fecha y Estado de Resultados por periodo; registrar gasto causado aunque esté pendiente de pago.                                                          | Cambio de alcance mayor. Cliente/contadora deben definir si será contabilidad formal o reporte gerencial, modelo y reglas. No crear un plan contable inventado. |
| RF-046 | Consultar ventas por periodo y productos de mayor rotación; comparar valor de inventario a costo y precio.                                                                                                        | La diferencia es margen potencial, no utilidad realizada. Método de costo pendiente. Análisis por día y gráficas son propuestas/ejemplos.                       |
| RF-047 | Separar promociones programadas de descuentos puntuales y aplicar promociones en POS si se aprueba su política.                                                                                                   | Alcance, acumulación, precedencia, vigencia, exclusiones y autorización pendientes. Categoría/laboratorio/proveedor son ejemplos.                               |
| RF-048 | Preparar ambiente de aceptación y simular varios días de operación antes de producción.                                                                                                                           | Definir participantes, datos, duración, reinicios permitidos y criterios de aprobación.                                                                         |

## 3. Reglas aún no aprobadas

1. **T-01 — Nombre del sistema:** el nombre sigue pendiente y no bloquea otras tareas.
2. **T-10/T-12 — Vencimientos y devolución a proveedor:** faltan tiempos por producto/proveedor y proceso real de devolución, reemplazo, documentos y efecto en inventario/costos/cuentas.
3. **T-15 — Descuento de compra:** definir bruto, descuento y neto con la contadora.
4. **T-16 — Impuestos:** definir responsabilidades tributarias, productos afectados, cálculo y presentación.
5. **T-19/T-20 — Descuento de venta:** definir límite, valor o porcentaje, alcance y autorización.
6. **RF-033/RF-034 — Unidades y lotes:** cantidad fraccionaria y modelo de saldo sin lote.
7. **RF-041/RF-042 — Tesorería:** cajas/turnos, medios mixtos, pagos, conciliación y reversos.
8. **RF-045 — Contabilidad:** aprobar alcance formal frente a reportes gerenciales, plan/cuentas, saldos iniciales, cierres y responsable.
9. **RF-046 — Costos:** definir método de valoración/costo de venta y tratamiento de anulaciones y devoluciones.
10. **RF-047 — Promociones:** reglas de solapamiento y prioridad frente a descuento manual.
11. **RF-039 — Permisos:** matriz acción×rol, costos, anulaciones, descuentos, caja y exportaciones.
12. **RF-029 — Comprobante:** contenido legal, formato y consecutivo.
13. **RF-048 — Aceptación:** criterios de salida y responsable de aprobar.

## 4. Cambios de alcance respecto a 0.1

La versión 0.1 indicaba que no se asumían módulos contables. RF-045 plantea estados financieros y causación, por lo que su aprobación es necesaria antes de incluir contabilidad en el MVP. Caja/Bancos también crea un dominio financiero más amplio, y RF-047 añade promociones. Las fases y prioridades de la minuta son sugerencias del redactor, no aprobación del alcance.

La arquitectura monolítica modular sigue siendo válida. La integración entre ventas, inventario, Caja/Bancos y cartera deberá preservar atomicidad e idempotencia. La venta y sus efectos financieros no deben implementarse como tareas independientes que puedan dejar saldos inconsistentes.

## 5. Criterios de aceptación añadidos

### CA-007 — Recepción sin lote

**Dado que** el producto no requiere control por lote, **cuando** un usuario autorizado registra una compra, **entonces** puede hacerlo sin número de lote ni vencimiento y el sistema conserva la cantidad, costo y movimiento de inventario.

### CA-008 — Recepción con lote

**Dado que** el producto requiere control por lote, **cuando** se recibe, **entonces** lote y vencimiento válidos son obligatorios y quedan asociados a la cantidad recibida.

### CA-009 — Existencia en el POS

**Dado que** el POS muestra un producto, **cuando** consulta disponibilidad, **entonces** presenta el saldo actual en unidad base. Tras confirmar o anular una venta, el dato refleja el saldo actualizado conforme al origen de inventario acordado.

### CA-010 — Enrutamiento financiero

**Dado que** una operación confirmada usa efectivo, transferencia o crédito, **cuando** se registra, **entonces** efectivo afecta Caja, transferencia afecta la cuenta bancaria seleccionada y crédito afecta Cuentas por Cobrar; los efectos relacionados se confirman consistentemente.

### CA-011 — Reimpresión

**Dado que** existe una venta consultable, **cuando** se reabre desde el historial, **entonces** el comprobante reproduce los datos originales definidos, muestra estado de la venta y no contiene datos legales ficticios.

### CA-012 — Corrección de identificación

**Dado que** un usuario sin privilegio administrativo intenta cambiar documento o NIT, **cuando** envía la solicitud al backend, **entonces** la operación se rechaza. El administrador puede corregir la identificación sin duplicados ni pérdida de relaciones.

### CA-013 — Filtros por periodo

**Dado que** el usuario selecciona un rango válido, **cuando** consulta un módulo incluido en RF-043, **entonces** resultados, paginación y exportación respetan límites y zona horaria aprobados.

### CA-014 — Descuento trazable

**Dado que** el cliente aprobó una política de descuentos, **cuando** un usuario autorizado aplica uno, **entonces** el importe, motivo y autorización quedan conservados y los reportes distinguen bruto, descuento y neto.

## 6. Criterio de listo y relación con el backlog

El [backlog ejecutable](BACKLOG_REUNION_CLIENTE.md) asigna estado actual, dependencias, criterios de aceptación y pruebas requeridas a T-01…T-41. Una tarea bloqueada por política no está lista para desarrollo aunque tenga prioridad provisional P0. El código presente en el repositorio debe verificarse con pruebas y aceptación antes de marcar una tarea IMPLEMENTADA.

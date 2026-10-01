# Clasificación y reglas de integración del backlog

Este documento resuelve diferencias editoriales entre las fichas preparadas por los subagentes. El [índice del backlog](../BACKLOG_REUNION_CLIENTE.md) y el [levantamiento 0.2](../levantamiento-requerimientos-farmacia-v02.md) son normativos ante cualquier contradicción.

## Evidencia de la reunión

El archivo recibido es una minuta interpretada, no una transcripción primaria. Por tanto, cuando las fichas especializadas usen `CONFIRMADO`, debe leerse como **“la minuta reporta que se acordó”**, pendiente de ratificación del cliente. No equivale a aprobación formal del requisito ni del cambio de alcance.

Las prioridades P0/P1/P2 son las prioridades propuestas en la minuta. Las historias, modelos, permisos, pruebas y detalles de implementación que agregan los redactores son propuestas técnicas para hacer el trabajo verificable; no cambian las reglas del negocio por sí solos.

## Correcciones que gobiernan las fichas

### T-04 — Identidad del cliente

La minuta reporta que solo el administrador puede corregir el **número** de documento. No determina que cambiar el tipo de documento sea parte del acuerdo, ni exige motivo obligatorio o un permiso nuevo con ese nombre. Esos elementos son recomendaciones sujetas a ratificación. La validación de duplicados y conservación de relaciones históricas sí forman parte del objetivo reportado.

### T-19/T-20 — Descuentos de venta

La necesidad de descuento y motivo está reportada, pero límite, fórmula, alcance, autorización y forma del motivo no están definidos. Estas tareas están `BLOQUEADAS` para la política final. Se puede trabajar en diagnóstico o endurecer fallos técnicos demostrables, pero no habilitar ventas con un límite inventado. La frase “trabajo concreto listo” en la ficha T-19 no significa que la política esté lista para desarrollo.

### T-21/T-22/T-23/T-24 — Caja y Bancos

El índice establece secuencia técnica: T-23 (cuentas) antes de T-22 (movimientos por cuenta); T-21 puede avanzar en paralelo después de definir caja/turnos; T-24 integra los destinos cuando estén listos Caja, Banco, cartera y sus políticas. Ninguna venta debe quedar confirmada con efectos financieros parciales.

### T-30 — Gastos

El estado canónico es `BLOQUEADO`: la separación entre causación y pago está reportada, pero faltan alcance, datos, cuentas y clasificación contable. No crear el módulo definitivo antes de la definición de la contadora.

### T-31/T-33 — Reportes

T-31 está en la ficha backend/datos con encabezado “Integrar descuentos de venta con Estado de Resultados”. T-33 está en la ficha frontend/QA; no hay una ficha T-33 en backend/datos. La prioridad inmediata de T-33 es validar el estado canónico de venta cancelada y evitar sumar ventas anuladas.

### T-35 — Ventas por día

La minuta lo presenta como análisis posterior y una idea útil para promociones; se mantiene `PENDIENTE DE RATIFICACIÓN`, no como acuerdo confirmado. El ejemplo de que un día de la semana tenga menos ventas no crea una regla de negocio.

### T-41 — Entradas mínimas de la simulación

El UAT de flujo completo requiere, según el alcance que se vaya a aceptar:

- T-08 y T-13 para productos, presentaciones y recepción;
- T-09 para cubrir productos con y sin control de lote;
- T-17 y T-18 para existencia en POS y permisos;
- T-21, T-22, T-23 y T-24 para comprobar enrutamiento de dinero;
- T-26/T-27 si el guion incluye cartera y cuentas por pagar;
- T-25 para reconciliar periodos;
- decisiones aprobadas de descuentos, impuestos, costo o promociones solo si esos flujos forman parte de la aceptación.

La lista concreta de pruebas debe reflejar qué módulos están habilitados y declarados listos; no debe simular reglas que sigan bloqueadas.

## Estados

El índice usa únicamente `IMPLEMENTADO`, `EN PROGRESO`, `PENDIENTE` y `BLOQUEADO`. Las frases `PARCIAL`, `NO INICIADO` o `PARCIAL AVANZADO` en una ficha son descripción del grado de soporte inspeccionado; no sustituyen el estado canónico. `IMPLEMENTADO` requiere criterios satisfechos y pruebas ejecutadas, no solo código observado.

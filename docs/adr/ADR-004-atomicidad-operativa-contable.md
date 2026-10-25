# ADR-004: Atomicidad entre operación confirmada y asiento obligatorio

- **Estado:** Aprobado e implementado en F1 (PR #13 y #14; detalle en [F1.2_trazabilidad_contable.md](../F1.2_trazabilidad_contable.md))
- **Fecha:** 2026-10-24
- **Origen:** Decisión explícita del propietario al autorizar F1.
- **Alcance:** operaciones internas confirmadas que requieren contabilización; no define costeo, impuestos ni aislamiento multiempresa.

## Contexto

El motor contable se invoca desde varios flujos operativos. En el estado previo a F1, algunas rutas podían registrar una advertencia y devolver null si faltaban mapeos, mientras el llamador continuaba dentro de la transacción comercial. La venta también tenía un fallback a registro neto cuando faltaba el propósito SALES_DISCOUNTS; los cierres podían escoger cuentas por prefijo o una cuenta de patrimonio arbitraria.

Los requerimientos exigen asientos balanceados e inmutables. La decisión del propietario precisa que una operación definitiva que requiere asiento no puede persistir sus efectos operativos sin el asiento correspondiente.

## Decisión

1. Cada operación comercial confirmada que requiere asiento registra sus efectos operativos y contables dentro de una misma transacción PostgreSQL.
2. Cualquier error de contabilización obligatoria aborta la transacción completa. Esto incluye cuenta o mapeo faltante, asiento descuadrado, periodo bloqueado, error de persistencia o cualquier restricción de integridad que impida registrar el asiento.
3. Un resultado null del motor no se acepta como éxito para un evento que requiere asiento. El servicio debe producir un error de dominio controlado que llegue al límite transaccional y provoque rollback.
4. Una repetición idempotente de una operación ya confirmada puede devolver su resultado/asiento existente. No debe crear un segundo asiento ni repetir efectos operativos.
5. Las operaciones en borrador pueden existir sin asiento solo mientras no creen efectos definitivos en inventario, caja, cartera o contabilidad.
6. Las integraciones externas, como facturación electrónica, se ejecutan fuera de transacciones PostgreSQL prolongadas. Se deben coordinar mediante estado persistente y mecanismos de recuperación/reintento apropiados. Esta ADR no define su proveedor ni implementa esa integración.

## Consecuencias

- Los llamadores del motor deben suministrar el mismo cliente transaccional que usa la operación o asegurar que el caso de uso abra una única transacción que abarque ambos efectos.
- Los errores de configuración o contabilización deben distinguirse de errores inesperados, pero no capturarse para continuar la operación.
- El motor no puede usar fallback silencioso a ventas netas, selección de cuentas por código ni selección arbitraria de patrimonio cuando un propósito es obligatorio.
- Los asientos publicados permanecen inmutables; correcciones se modelan con reversiones o ajustes permitidos.
- Pruebas de integración con PostgreSQL deben comprobar rollback de los efectos operativos ante falla contable, configuración ausente, periodo cerrado, fallo durante escritura, reintento y solicitudes duplicadas/concurrentes.
- Esta decisión se aplica a F1. No autoriza modificar método de valoración (F2), reglas tributarias (F3), ni esquema multiempresa (F4).

## Límites

Los eventos y montos que requieren asiento se determinan por el contrato contable existente y la operación que se confirma. No se amplía en esta ADR el catálogo de eventos contabilizados ni se define tratamiento contable nuevo para ajustes, vencimientos o movimientos manuales sin cobertura; esos casos pertenecen al alcance F6.

## Referencias

- [Plan híbrido, principios y F1](../FarmaControl_Arquitectura_Hibrida_Plan_Implementacion.md)
- [Línea base F0 y revalidación AUD-CT](../F0_linea_base_arquitectura_hibrida.md)
- [ADR-003, despliegue híbrido](ADR-003-despliegue-hibrido-y-frontera-empresarial.md)

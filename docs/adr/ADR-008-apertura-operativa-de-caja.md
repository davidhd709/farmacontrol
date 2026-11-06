# ADR-008: Incorporación operativa del efectivo de apertura

- Estado: implementación local de FARM-TEST-001; pendiente de despliegue autorizado y validación funcional.
- Fecha: 2026-11-04.
- Origen: solicitud FARM-TEST-001, corrección y pruebas en rama local.
- Complementa ADR-003, ADR-004, ADR-006 y ADR-007.

## Problema comprobado

El asistente publicaba `OPENING_BALANCE`, sin incorporar el efectivo a `cash_movements`.
Caja obtiene disponibilidad del último `balanceAfter`; sin movimientos devuelve cero.
Un recibo manual adicional vuelve a contabilizar el efectivo y no repara esta diferencia.

## Decisión

1. `AccountingSetupService` coordina asiento e incorporación de efectivo en una única
   transacción SERIALIZABLE con reintentos. `Idempotency-Key` es obligatorio y su respuesta
   se guarda en esa misma transacción. Una apertura vigente impide crear otra, incluso
   después de expirar la clave HTTP. Un reintento no repara implícitamente una apertura antigua.
2. La cuenta se resuelve por `CASH` a fecha efectiva y debe coincidir con el mapeo vigente
   actual. No se usan códigos PUC fijos. El neto cero no crea movimiento; negativo o fuera
   de precisión de Caja se rechaza. Para un neto positivo se requiere Caja sin historial
   y saldo contable total igual al neto de apertura.
3. El movimiento `SALDO_APERTURA` incorpora disponibilidad una vez, referenciando el
   asiento original. No pasa por el motor de contabilización y no emite RC/CE ni consume
   sus consecutivos. No se suma a ingresos/egresos diarios ni al reporte de flujo de caja.
   El historial de Caja lo identifica como saldo inicial y muestra su débito operativo.
4. `CashOpening` conserva empresa, asiento, movimiento, cuenta, valor, fecha efectiva,
   responsable y fecha de registro. FKs, restricciones, índices únicos y triggers protegen
   la identidad e inmutabilidad. El movimiento no puede confirmarse huérfano del vínculo.
   El motivo y el modo de incorporación se conservan en auditoría dentro de la transacción.
5. El contrato ligero `CashOpeningModule` no depende del motor ni de `CashModule`, que ya
   importa contabilidad. Evita una dependencia circular y mantiene el caso de uso en el
   asistente y la escritura del auxiliar en Caja.
6. Se usa el mismo advisory lock de los movimientos de Caja. Bajo ese cerrojo el registro
   recibe una fecha estrictamente posterior al último movimiento (al menos 1 ms). Esto
   evita que `now()`, que representa el inicio de transacción, invierta movimientos que
   esperaron el cerrojo. Lectores y escritor usan `createdAt, id`; no se reescribe historia.
   La fecha efectiva contable se conserva separada de la fecha de registro operativo.
7. La reparación es una operación administrativa explícita y transaccional que exige
   identidad empresarial, asiento, cuenta e importe esperados, motivo e idempotencia.
   Se rechaza cualquier historial de Caja, aun con saldo final cero. No es una migración
   de datos ni un proceso automático de arranque. Solo se aplica con autorización aparte.
8. Hasta F9 la frontera es una base dedicada: los auxiliares y asientos anteriores no
   tienen `companyId`. Se exige exactamente una empresa en toda la base y que esté activa;
   una segunda empresa, incluso inactiva, obliga a resolver la atribución histórica.
   Se rechaza una empresa esperada diferente. Esto no introduce multiempresa compartida.
9. Una apertura con efectivo incorporado no se puede anular solo en contabilidad. Servicio
   y base de datos rechazan esa reversión. Un futuro flujo de corrección conjunta requiere
   diseño específico, sin modificar registros inmutables. Las aperturas sin incorporación
   operativa conservan el flujo de anulación anterior.

## Alternativas descartadas

- Recibo manual: duplica la contabilización del aporte.
- Hacer que Caja lea únicamente el mayor: deja incompatible la cadena `balanceAfter` y
  no resuelve la incorporación operativa de forma trazable.
- Insertar/actualizar saldos por script o recalcular históricos: viola el control de
  operaciones e inmutabilidad, especialmente si ya hubo movimientos posteriores.
- Sincronización eventual: innecesaria; ambos registros usan la misma base PostgreSQL.
- Ampliar Tesorería, cartera, proveedores o turnos: fuera del alcance autorizado.

## Límites

`READY` sigue describiendo requisitos de configuración, no garantiza conciliación completa.
La conciliación contable sigue siendo el control de diferencias. Esta corrección inicializa
Caja; no inicializa bancos ni otros auxiliares. La migración no contiene backfills ni repara
aperturas existentes. No se ha validado la instalación desplegada del cliente.

Los movimientos históricos con la misma fecha de registro se desempatan por identificador;
esto no reconstruye su orden real ni corrige cadenas antiguas. La reparación de apertura
rechaza cualquier historial, y las escrituras nuevas mantienen fechas estrictamente crecientes.

## Operación

Ver [procedimiento de reparación](../runbooks/FARM-TEST-001-apertura-caja.md).

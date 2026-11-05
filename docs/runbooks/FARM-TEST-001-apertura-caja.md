# FARM-TEST-001: incorporación de Caja para una apertura existente

Estado: procedimiento preparado; **no ejecutado sobre Droguería Vida Sana S.A.S.**
No ejecutar sin autorización específica, incluso en la base de pruebas. Este documento
no autoriza despliegue, migración ni reparación en ninguna base persistente.

## Revisión previa de solo lectura

1. Identificar servidor, base y versión efectiva; confirmar expresamente el entorno de
   pruebas y que corresponde a Droguería Vida Sana S.A.S. Conservar respaldo verificable.
2. Leer la única empresa de la base y registrar su UUID. Si existe otra empresa, aun
   inactiva, detenerse: los asientos históricos no tienen atribución multiempresa.
3. Consultar `GET /api/v1/accounting/opening-balances` y el detalle del asiento. Registrar
   UUID, fecha 2026-11-03, estado POSTED, ausencia de anulación y líneas originales:
   Caja 2.000.000 débito, Bancos 6.000.000 débito, Capital 8.000.000 crédito.
4. Verificar el mapeo CASH vigente a la fecha del asiento y actualmente: mismo UUID de
   cuenta, activa e imputable. No seleccionar una cuenta solo por el código 110505.
5. Verificar ausencia de todos los movimientos de Caja y del vínculo CashOpening.
   Un saldo cero no basta. Confirmar que el total contable de CASH es exactamente
   2.000.000; otros asientos sin movimiento operativo requieren una revisión diferente.
6. Guardar la conciliación previa: Caja 2.000.000/0; Bancos 6.000.000/6.000.000.
   Registrar saldo y movimientos bancarios para comprobar que permanecen intactos.

La migración estructural debe haberse validado primero en una base efímera. Su aplicación
a la base existente es una acción separada que requiere autorización; por sí sola no
incorpora dinero ni altera movimientos anteriores.

## Acción propuesta, pendiente de autorización

Durante una ventana sin operaciones concurrentes de la empresa, usar una sesión con
`accounting:manage` y `cash:movements` y ejecutar una sola solicitud:

```http
POST /api/v1/accounting/opening-balances/{asiento-original-uuid}/cash
Idempotency-Key: {uuid-de-la-solicitud-conservado-para-reintentos}
Content-Type: application/json

{
  "companyId": "{empresa-verificada-uuid}",
  "accountId": "{cuenta-CASH-verificada-uuid}",
  "expectedAmount": "2000000.00",
  "reason": "FARM-TEST-001: incorporación del efectivo de apertura del 2026-11-03, autorizada por ..."
}
```

La API vuelve a validar todo dentro de la transacción. Responde 201 con el vínculo,
identidades y fechas; no crea otro asiento ni recibo. Si se pierde la respuesta, reenviar
exactamente la misma solicitud con la misma clave. Una clave distinta para una apertura
ya incorporada recibe conflicto; nunca insertar un segundo movimiento por fuera de la API.

Se rechazan empresa/cuenta/importe incorrectos, apertura anulada o no vigente, mapeos
inconsistentes, saldo contable distinto o cualquier historial de Caja. No forzar esos
casos mediante SQL ni modificar `balanceAfter`: requieren diagnóstico y diseño aparte.

## Comprobación posterior

- Caja operativa: 2.000.000, un movimiento SALDO_APERTURA con referencia al asiento original.
- Caja contable: 2.000.000, diferencia cero en conciliación, `ok: true`.
- Asiento original: mismas líneas y totales de 8.000.000; ningún asiento nuevo.
- Bancos: saldo 6.000.000 y movimientos originales sin cambios.
- Sin recibos ni comprobantes ficticios, sin consumo de sus consecutivos.
- Auditoría: actor, empresa, cuenta, importe, fecha efectiva, momento de registro y motivo.
- Ingresos y egresos diarios no incluyen los 2.000.000 de apertura.

Conservar evidencia y resultado. Si una comprobación falla, detener operaciones y
diagnosticar; no anular automáticamente el asiento ni borrar el movimiento.

## Restricciones conocidas

No se admite anular aisladamente una apertura vinculada a Caja. No hay en este cambio
un flujo de compensación de apertura después de movimientos posteriores. `READY` no
sustituye la conciliación. La verificación funcional del sistema desplegado sigue pendiente.

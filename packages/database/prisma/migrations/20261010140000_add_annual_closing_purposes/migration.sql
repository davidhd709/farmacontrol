-- Cierre anual (acuerdo del 4 de octubre de 2026): el resultado del año se traslada a
-- utilidades acumuladas (3705) o pérdidas acumuladas (3710). Cuentas configurables por
-- propósito, como el resto del motor contable.
ALTER TYPE "AccountingPurpose" ADD VALUE IF NOT EXISTS 'RETAINED_EARNINGS';
ALTER TYPE "AccountingPurpose" ADD VALUE IF NOT EXISTS 'ACCUMULATED_LOSSES';

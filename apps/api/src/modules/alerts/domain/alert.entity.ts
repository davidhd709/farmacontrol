import { ExpirationSeverity } from '@farmacia/contracts';

/**
 * Calcula la severidad de vencimiento de un lote a partir de su fecha de vencimiento y una fecha de referencia.
 * Reglas de negocio (RN-001, RN-002, RF-008):
 * - VENCIDO: daysRemaining <= 0
 * - CRITICO: 1 <= daysRemaining <= 30
 * - ALERTA: 31 <= daysRemaining <= 60
 * - PROXIMO: 61 <= daysRemaining <= 90
 * - NORMAL: daysRemaining > 90
 */
export function calculateExpirationSeverity(
  expirationDate: Date,
  referenceDate: Date = new Date(),
): { daysRemaining: number; severity: ExpirationSeverity } {
  // Normalizar ambas fechas a medianoche UTC para comparar días enteros sin sesgos horarios
  const expUtc = Date.UTC(
    expirationDate.getUTCFullYear(),
    expirationDate.getUTCMonth(),
    expirationDate.getUTCDate(),
  );
  const refUtc = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );

  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const daysRemaining = Math.round((expUtc - refUtc) / MS_PER_DAY);

  let severity: ExpirationSeverity;
  if (daysRemaining <= 0) {
    severity = 'VENCIDO';
  } else if (daysRemaining <= 30) {
    severity = 'CRITICO';
  } else if (daysRemaining <= 60) {
    severity = 'ALERTA';
  } else if (daysRemaining <= 90) {
    severity = 'PROXIMO';
  } else {
    severity = 'NORMAL';
  }

  return { daysRemaining, severity };
}

export class InventoryAlert {
  constructor(
    public readonly id: string,
    public readonly lotId: string,
    public readonly productId: string,
    public readonly alertType: string,
    public severity: ExpirationSeverity,
    public daysRemaining: number,
    public currentQuantity: number,
    public isResolved: boolean,
    public resolvedAt: Date | null,
    public lastEvaluatedAt: Date,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  /**
   * Actualiza el estado evaluado de la alerta.
   */
  updateEvaluation(
    daysRemaining: number,
    severity: ExpirationSeverity,
    currentQuantity: number,
    evaluationDate: Date = new Date(),
  ): void {
    this.daysRemaining = daysRemaining;
    this.severity = severity;
    this.currentQuantity = currentQuantity;
    this.lastEvaluatedAt = evaluationDate;
    this.updatedAt = evaluationDate;

    // Si el stock se agotó o la severidad vuelve a NORMAL (>90d), se marca como resuelta
    if (this.currentQuantity <= 0 || this.severity === 'NORMAL') {
      this.isResolved = true;
      this.resolvedAt = evaluationDate;
    } else {
      this.isResolved = false;
      this.resolvedAt = null;
    }
  }

  /**
   * Resuelve manualmente la alerta (por ejemplo tras ajuste o disposición del lote).
   */
  resolve(resolvedDate: Date = new Date()): void {
    this.isResolved = true;
    this.resolvedAt = resolvedDate;
    this.updatedAt = resolvedDate;
  }
}

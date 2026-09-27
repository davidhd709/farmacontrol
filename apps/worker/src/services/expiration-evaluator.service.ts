import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { prisma, PrismaClient } from '@farmacia/database';
import { EvaluationResultDto, ExpirationSeverity } from '@farmacia/contracts';

/**
 * Función canónica de cálculo de severidad de vencimientos
 * conforme a RN-001, RN-002 y RF-008.
 */
export function calculateExpirationSeverity(
  expirationDate: Date,
  referenceDate: Date = new Date(),
): { daysRemaining: number; severity: ExpirationSeverity } {
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

@Injectable()
export class ExpirationEvaluatorService {
  private readonly logger = new Logger(ExpirationEvaluatorService.name);
  private readonly db: PrismaClient = prisma;

  /**
   * Ejecuta el escaneo de lotes en inventario y clasifica vencimientos en PostgreSQL
   * sin bloquear transacciones de venta (consulta indexada sobre expiration_date y current_quantity).
   */
  async evaluate(referenceDate: Date = new Date()): Promise<EvaluationResultDto> {
    this.logger.log(
      `[Worker] Iniciando evaluación periódica de lotes con fecha base: ${referenceDate.toISOString()}`,
    );

    const lots = await this.db.inventoryLot.findMany({
      where: { isActive: true },
      select: {
        id: true,
        productId: true,
        lotNumber: true,
        expirationDate: true,
        currentQuantity: true,
      },
    });

    let evaluatedLots = 0;
    let createdAlerts = 0;
    let updatedAlerts = 0;
    let resolvedAlerts = 0;

    for (const lot of lots) {
      evaluatedLots++;
      const { daysRemaining, severity } = calculateExpirationSeverity(
        lot.expirationDate,
        referenceDate,
      );

      // Si el lote tiene stock disponible y está en riesgo (<= 90 días o vencido)
      if (lot.currentQuantity > 0 && severity !== 'NORMAL') {
        const existing = await this.db.inventoryAlert.findUnique({
          where: {
            lotId_alertType: {
              lotId: lot.id,
              alertType: 'EXPIRATION',
            },
          },
        });

        if (!existing) {
          await this.db.inventoryAlert.create({
            data: {
              id: randomUUID(),
              lotId: lot.id,
              productId: lot.productId,
              alertType: 'EXPIRATION',
              severity,
              daysRemaining,
              currentQuantity: lot.currentQuantity,
              isResolved: false,
              lastEvaluatedAt: referenceDate,
            },
          });
          createdAlerts++;
        } else {
          await this.db.inventoryAlert.update({
            where: { id: existing.id },
            data: {
              severity,
              daysRemaining,
              currentQuantity: lot.currentQuantity,
              isResolved: false,
              resolvedAt: null,
              lastEvaluatedAt: referenceDate,
            },
          });
          updatedAlerts++;
        }
      } else {
        // Si el lote tiene cantidad 0 o ya está en estado NORMAL (>90d), resolver alerta previa
        const existing = await this.db.inventoryAlert.findUnique({
          where: {
            lotId_alertType: {
              lotId: lot.id,
              alertType: 'EXPIRATION',
            },
          },
        });

        if (existing && !existing.isResolved) {
          await this.db.inventoryAlert.update({
            where: { id: existing.id },
            data: {
              severity,
              daysRemaining,
              currentQuantity: lot.currentQuantity,
              isResolved: true,
              resolvedAt: referenceDate,
              lastEvaluatedAt: referenceDate,
            },
          });
          resolvedAlerts++;
        }
      }
    }

    this.logger.log(
      `[Worker] Evaluación completada: ${evaluatedLots} lotes analizados, ${createdAlerts} creadas, ${updatedAlerts} actualizadas, ${resolvedAlerts} resueltas.`,
    );

    return {
      evaluatedLots,
      createdAlerts,
      updatedAlerts,
      resolvedAlerts,
      timestamp: referenceDate.toISOString(),
    };
  }
}

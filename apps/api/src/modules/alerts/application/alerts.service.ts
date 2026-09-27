import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { prisma as defaultPrisma, PrismaClient } from '@farmacia/database';
import {
  AlertsQueryFilters,
  AlertsSummaryDto,
  BackgroundJobDto,
  EvaluationResultDto,
  ExpirationSeverity,
  InventoryAlertDto,
} from '@farmacia/contracts';
import { calculateExpirationSeverity } from '../domain/alert.entity';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private readonly prisma: PrismaClient;

  constructor() {
    this.prisma = defaultPrisma;
  }

  /**
   * Obtiene la lista de alertas de vencimiento con filtros y paginación.
   */
  async getExpirationAlerts(filters: AlertsQueryFilters = {}) {
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.max(1, Math.min(100, filters.pageSize || 20));
    const skip = (page - pageSize) * 0 + (page - 1) * pageSize;

    const where: any = {
      alertType: 'EXPIRATION',
      isResolved: filters.isResolved !== undefined ? filters.isResolved : false,
    };

    if (filters.severity) {
      where.severity = filters.severity;
    }

    if (filters.locationId) {
      where.lot = { locationId: filters.locationId };
    }

    if (filters.search && filters.search.trim()) {
      const search = filters.search.trim();
      where.OR = [
        { product: { name: { contains: search, mode: 'insensitive' } } },
        { product: { code: { contains: search, mode: 'insensitive' } } },
        { lot: { lotNumber: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, records] = await Promise.all([
      this.prisma.inventoryAlert.count({ where }),
      this.prisma.inventoryAlert.findMany({
        where,
        include: {
          product: {
            include: {
              category: true,
            },
          },
          lot: {
            include: {
              location: true,
            },
          },
        },
        orderBy: [
          { daysRemaining: 'asc' },
          { currentQuantity: 'desc' },
        ],
        skip,
        take: pageSize,
      }),
    ]);

    const items: InventoryAlertDto[] = records.map((record: any) => ({
      id: record.id,
      lotId: record.lotId,
      lotNumber: record.lot.lotNumber,
      productId: record.productId,
      productCode: record.product.code,
      productName: record.product.name,
      categoryName: record.product.category?.name,
      locationId: record.lot.locationId,
      locationName: record.lot.location.name,
      expirationDate: record.lot.expirationDate.toISOString().split('T')[0],
      daysRemaining: record.daysRemaining,
      severity: record.severity as ExpirationSeverity,
      currentQuantity: record.currentQuantity,
      baseUnit: record.product.baseUnit,
      isResolved: record.isResolved,
      resolvedAt: record.resolvedAt ? record.resolvedAt.toISOString() : null,
      lastEvaluatedAt: record.lastEvaluatedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Resumen numérico consolidado para badges de navegación (Topbar) y Dashboard.
   */
  async getAlertsSummary(): Promise<AlertsSummaryDto> {
    const activeAlerts = await this.prisma.inventoryAlert.findMany({
      where: {
        alertType: 'EXPIRATION',
        isResolved: false,
        currentQuantity: { gt: 0 },
      },
      select: {
        severity: true,
        lastEvaluatedAt: true,
      },
    });

    let vencidos = 0;
    let criticos = 0;
    let alertas = 0;
    let proximos = 0;
    let latestEvaluation: Date | null = null;

    for (const a of activeAlerts) {
      if (a.severity === 'VENCIDO') vencidos++;
      else if (a.severity === 'CRITICO') criticos++;
      else if (a.severity === 'ALERTA') alertas++;
      else if (a.severity === 'PROXIMO') proximos++;

      if (!latestEvaluation || a.lastEvaluatedAt > latestEvaluation) {
        latestEvaluation = a.lastEvaluatedAt;
      }
    }

    return {
      totalActive: activeAlerts.length,
      vencidos,
      criticos,
      alertas,
      proximos,
      lastEvaluatedAt: latestEvaluation ? latestEvaluation.toISOString() : undefined,
    };
  }

  /**
   * Ejecuta el escaneo y evaluación periódica de lotes.
   * Identifica y clasifica vencimientos en tiempo real de forma no bloqueante (RN-001, RN-002, RF-008).
   */
  async evaluateLotsExpirations(referenceDate: Date = new Date()): Promise<EvaluationResultDto> {
    this.logger.log(`Iniciando evaluación de vencimientos de lotes con fecha de referencia ${referenceDate.toISOString()}`);

    const lots = await this.prisma.inventoryLot.findMany({
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

      // Si el lote tiene existencias y está en riesgo (<= 90 días o vencido)
      if (lot.currentQuantity > 0 && severity !== 'NORMAL') {
        const existing = await this.prisma.inventoryAlert.findUnique({
          where: {
            lotId_alertType: {
              lotId: lot.id,
              alertType: 'EXPIRATION',
            },
          },
        });

        if (!existing) {
          await this.prisma.inventoryAlert.create({
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
          await this.prisma.inventoryAlert.update({
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
        // Si el lote se agotó o su vencimiento ya es mayor a 90 días, resolvemos cualquier alerta previa
        const existing = await this.prisma.inventoryAlert.findUnique({
          where: {
            lotId_alertType: {
              lotId: lot.id,
              alertType: 'EXPIRATION',
            },
          },
        });

        if (existing && !existing.isResolved) {
          await this.prisma.inventoryAlert.update({
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
      `Evaluación finalizada: ${evaluatedLots} lotes evaluados, ${createdAlerts} creadas, ${updatedAlerts} actualizadas, ${resolvedAlerts} resueltas.`,
    );

    return {
      evaluatedLots,
      createdAlerts,
      updatedAlerts,
      resolvedAlerts,
      timestamp: referenceDate.toISOString(),
    };
  }

  /**
   * Encola un trabajo en PostgreSQL para procesamiento por el worker.
   */
  async enqueueEvaluationJob(priority = 0): Promise<BackgroundJobDto> {
    const job = await this.prisma.backgroundJob.create({
      data: {
        id: randomUUID(),
        jobType: 'EVALUATE_EXPIRATIONS',
        status: 'PENDING',
        priority,
        scheduledAt: new Date(),
      },
    });

    return {
      id: job.id,
      jobType: job.jobType,
      status: job.status as any,
      priority: job.priority,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      lastError: job.lastError,
      scheduledAt: job.scheduledAt.toISOString(),
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  /**
   * Obtiene historial de trabajos en segundo plano.
   */
  async getBackgroundJobs(limit = 20): Promise<BackgroundJobDto[]> {
    const jobs = await this.prisma.backgroundJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return jobs.map((job: any) => ({
      id: job.id,
      jobType: job.jobType,
      payload: job.payload,
      status: job.status as any,
      priority: job.priority,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      lastError: job.lastError,
      scheduledAt: job.scheduledAt.toISOString(),
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    }));
  }
}

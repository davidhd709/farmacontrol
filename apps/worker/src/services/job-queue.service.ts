import { Injectable, Logger } from '@nestjs/common';
import { prisma, PrismaClient } from '@farmacia/database';
import { ExpirationEvaluatorService } from './expiration-evaluator.service';

@Injectable()
export class JobQueueService {
  private readonly logger = new Logger(JobQueueService.name);
  private readonly db: PrismaClient = prisma;
  private isProcessing = false;

  constructor(private readonly expirationEvaluator: ExpirationEvaluatorService) {}

  /**
   * Procesa los trabajos pendientes en PostgreSQL respetando concurrencia y reintentos (sección 14 de Arquitectura).
   */
  async processPendingJobs(): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }

    this.isProcessing = true;
    let processedCount = 0;

    try {
      // Reclamar hasta 5 trabajos pendientes cuya fecha programada sea <= now
      const now = new Date();
      const pendingJobs = await this.db.backgroundJob.findMany({
        where: {
          status: 'PENDING',
          scheduledAt: { lte: now },
        },
        orderBy: [
          { priority: 'desc' },
          { scheduledAt: 'asc' },
        ],
        take: 5,
      });

      for (const job of pendingJobs) {
        processedCount++;
        await this.executeJob(job);
      }
    } catch (err: any) {
      this.logger.error(`[Worker JobQueue] Error al reclamar trabajos: ${err.message}`, err.stack);
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  private async executeJob(job: any): Promise<void> {
    this.logger.log(`[Worker JobQueue] Procesando trabajo ${job.id} (${job.jobType})`);

    // Marcar como PROCESSING e incrementar intentos
    await this.db.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: 'PROCESSING',
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    try {
      if (job.jobType === 'EVALUATE_EXPIRATIONS') {
        const payloadDate = job.payload && typeof job.payload === 'object' && 'referenceDate' in job.payload
          ? new Date((job.payload as any).referenceDate)
          : new Date();
        await this.expirationEvaluator.evaluate(payloadDate);
      } else {
        this.logger.warn(`[Worker JobQueue] Tipo de trabajo desconocido: ${job.jobType}`);
      }

      // Marcar como COMPLETED
      await this.db.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          lastError: null,
        },
      });

      this.logger.log(`[Worker JobQueue] Trabajo ${job.id} finalizado exitosamente.`);
    } catch (error: any) {
      this.logger.error(`[Worker JobQueue] Falló ejecución del trabajo ${job.id}: ${error.message}`);
      const newAttempts = job.attempts + 1;
      const isFailed = newAttempts >= job.maxAttempts;

      await this.db.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: isFailed ? 'FAILED' : 'PENDING',
          lastError: error.message || String(error),
          // Si no es fallo definitivo, reprogramar reintento exponencial (ej. 30s * intentos)
          scheduledAt: isFailed ? undefined : new Date(Date.now() + 30000 * newAttempts),
        },
      });
    }
  }
}

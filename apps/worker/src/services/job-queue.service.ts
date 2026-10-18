import { Injectable, Logger } from '@nestjs/common';
import { prisma, PrismaClient, type BackgroundJob } from '@farmacia/database';
import { ExpirationEvaluatorService } from './expiration-evaluator.service';

// Sin configuración de tiempos en el worker: 15 min cubren el lote de 5 evaluaciones
// con timeout de 2 min cada una. Un trabajo más antiguo se considera interrumpido.
const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;
const RETRY_DELAY_MS = 60 * 1000;

/** Un día calendario (YYYY-MM-DD) se evalúa como ese día en Bogotá (UTC-05:00), no como medianoche UTC. */
function businessReferenceDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T05:00:00.000Z`) : new Date(value);
}

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
      const now = new Date();
      const interruptedBefore = new Date(now.getTime() - PROCESSING_TIMEOUT_MS);
      const retryAt = new Date(now.getTime() + RETRY_DELAY_MS);
      // UPDATE condicional atómico: PostgreSQL vuelve a comprobar el estado si otro
      // consumidor recuperó o terminó la fila mientras esperaba su bloqueo.
      await this.db.$executeRaw`
        UPDATE background_jobs
        SET status = CASE WHEN attempts < max_attempts THEN 'PENDING' ELSE 'FAILED' END,
            scheduled_at = CASE WHEN attempts < max_attempts THEN ${retryAt} ELSE scheduled_at END,
            started_at = NULL,
            completed_at = NULL,
            last_error = CASE WHEN attempts < max_attempts
              THEN 'Trabajo interrumpido; se reintenta automáticamente'
              ELSE 'Trabajo interrumpido; intentos agotados' END,
            updated_at = ${now}
        WHERE status = 'PROCESSING' AND started_at < ${interruptedBefore}
      `;

      // Reclamar hasta 5 trabajos pendientes cuya fecha programada sea <= now
      const pendingJobs = await this.db.$transaction(async (tx) => {
        const claimed = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM background_jobs
          WHERE status = 'PENDING' AND scheduled_at <= ${now}
          ORDER BY priority DESC, scheduled_at ASC, id ASC
          LIMIT 5 FOR UPDATE SKIP LOCKED
        `;
        if (claimed.length === 0) return [];

        const ids = claimed.map((job) => job.id);
        await tx.backgroundJob.updateMany({
          where: { id: { in: ids } },
          data: { status: 'PROCESSING', startedAt: now, attempts: { increment: 1 } },
        });
        return tx.backgroundJob.findMany({ where: { id: { in: ids } } });
      });

      for (const job of pendingJobs) {
        processedCount++;
        await this.executeJob(job);
      }
    } catch (err: unknown) {
      this.logger.error(
        `[Worker JobQueue] Error al recuperar o reclamar trabajos: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  private async executeJob(job: BackgroundJob): Promise<void> {
    this.logger.log(`[Worker JobQueue] Procesando trabajo ${job.id} (${job.jobType})`);
    // Una ejecución que reaparece tras ser recuperada no puede finalizar otro intento.
    const claimedAttempt = {
      id: job.id,
      status: 'PROCESSING',
      startedAt: job.startedAt,
      attempts: job.attempts,
    };

    try {
      if (job.jobType === 'EVALUATE_EXPIRATIONS') {
        const payloadDate =
          job.payload && typeof job.payload === 'object' && 'referenceDate' in job.payload
            ? businessReferenceDate(String(job.payload.referenceDate))
            : new Date();
        const result = await this.expirationEvaluator.evaluate(payloadDate);
        if (result.skipped) {
          await this.db.backgroundJob.updateMany({
            where: claimedAttempt,
            data: {
              status: 'PENDING',
              scheduledAt: new Date(Date.now() + RETRY_DELAY_MS),
              startedAt: null,
              completedAt: null,
              attempts: { decrement: 1 },
              lastError:
                'Evaluación omitida: bloqueo de vencimientos ocupado; se reintenta automáticamente',
            },
          });
          return;
        }
      } else {
        this.logger.warn(`[Worker JobQueue] Tipo de trabajo desconocido: ${job.jobType}`);
      }

      // Marcar como COMPLETED
      const completed = await this.db.backgroundJob.updateMany({
        where: claimedAttempt,
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          lastError: null,
        },
      });

      if (completed.count > 0) {
        this.logger.log(`[Worker JobQueue] Trabajo ${job.id} finalizado exitosamente.`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Worker JobQueue] Falló ejecución del trabajo ${job.id}: ${message}`);
      const newAttempts = job.attempts;
      const isFailed = newAttempts >= job.maxAttempts;

      await this.db.backgroundJob.updateMany({
        where: claimedAttempt,
        data: {
          status: isFailed ? 'FAILED' : 'PENDING',
          lastError: message,
          // Si no es fallo definitivo, reprogramar reintento exponencial (ej. 30s * intentos)
          scheduledAt: isFailed ? undefined : new Date(Date.now() + 30000 * newAttempts),
        },
      });
    }
  }
}

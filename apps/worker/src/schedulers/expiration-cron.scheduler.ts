import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { ExpirationEvaluatorService } from '../services/expiration-evaluator.service';
import { JobQueueService } from '../services/job-queue.service';

@Injectable()
export class ExpirationCronScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExpirationCronScheduler.name);

  constructor(
    private readonly expirationEvaluator: ExpirationEvaluatorService,
    private readonly jobQueue: JobQueueService,
  ) {}

  /**
   * Al iniciar el worker, ejecuta una evaluación inicial de sincronización.
   */
  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('[Worker Scheduler] Ejecutando escaneo inicial de vencimientos...');
    try {
      await this.expirationEvaluator.evaluate();
    } catch (err: any) {
      this.logger.warn(`[Worker Scheduler] Escaneo inicial diferido: ${err.message}`);
    }
  }

  /**
   * Cron programado: Evaluación periódica cada hora de los lotes en PostgreSQL (RF-008, HU-022).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleScheduledExpirationScan(): Promise<void> {
    this.logger.log('[Worker Scheduler] Disparando escaneo horario programado de vencimientos...');
    try {
      await this.expirationEvaluator.evaluate();
    } catch (err: any) {
      this.logger.error(`[Worker Scheduler] Error en escaneo horario: ${err.message}`);
    }
  }

  /**
   * Intervalo cada 15 segundos: procesa la cola persistente de trabajos en segundo plano en PostgreSQL.
   */
  @Interval(15000)
  async handleJobQueueProcessing(): Promise<void> {
    try {
      await this.jobQueue.processPendingJobs();
    } catch (err: any) {
      this.logger.error(`[Worker Scheduler] Error procesando cola de trabajos: ${err.message}`);
    }
  }
}

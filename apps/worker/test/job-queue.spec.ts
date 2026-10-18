import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanTestDatabase, prisma } from '@farmacia/database';
import { ExpirationEvaluatorService } from '../src/services/expiration-evaluator.service';
import { JobQueueService } from '../src/services/job-queue.service';

describe('Worker job queue recovery (PostgreSQL real)', () => {
  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each([0, 2])(
    'reprograma por lock ocupado sin consumir intentos (intentos previos: %i)',
    async (attempts) => {
      const evaluator = new ExpirationEvaluatorService();
      const queue = new JobQueueService(evaluator);
      const job = await prisma.backgroundJob.create({
        data: { jobType: 'EVALUATE_EXPIRATIONS', attempts, maxAttempts: 3 },
      });
      const before = Date.now();

      // Mantiene el mismo lock que usan el cron y la evaluación manual de la API.
      await prisma.$transaction(async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
          SELECT pg_try_advisory_xact_lock(41704, 1) AS acquired
        `;
        expect(lock.acquired).toBe(true);
        expect((await evaluator.evaluate()).skipped).toBe(true);
        expect(await queue.processPendingJobs()).toBe(1);
        // Otra pasada tampoco reclama el trabajo antes de su nueva fecha.
        expect(await queue.processPendingJobs()).toBe(0);
      });

      const pending = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(pending.status).toBe('PENDING');
      expect(pending.attempts).toBe(attempts);
      expect(pending.startedAt).toBeNull();
      expect(pending.completedAt).toBeNull();
      expect(pending.scheduledAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
      expect(pending.scheduledAt.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
      expect(pending.lastError).toContain('bloqueo de vencimientos ocupado');

      // Liberado el lock y llegado el próximo intento, sí se evalúa y completa.
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: { scheduledAt: new Date() },
      });
      expect(await queue.processPendingJobs()).toBe(1);
      const completed = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(completed.status).toBe('COMPLETED');
      expect(completed.attempts).toBe(attempts + 1);
      expect(completed.completedAt).not.toBeNull();
      expect(completed.lastError).toBeNull();
    },
  );

  it('recupera PROCESSING antiguo a PENDING conservando los intentos consumidos', async () => {
    const job = await prisma.backgroundJob.create({
      data: {
        jobType: 'EVALUATE_EXPIRATIONS',
        status: 'PROCESSING',
        attempts: 1,
        startedAt: new Date(Date.now() - 16 * 60_000),
      },
    });
    const before = Date.now();
    const queue = new JobQueueService(new ExpirationEvaluatorService());
    expect(await queue.processPendingJobs()).toBe(0);

    const recovered = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(recovered.status).toBe('PENDING');
    expect(recovered.attempts).toBe(1);
    expect(recovered.startedAt).toBeNull();
    expect(recovered.completedAt).toBeNull();
    expect(recovered.scheduledAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect(recovered.lastError).toBe('Trabajo interrumpido; se reintenta automáticamente');

    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: { scheduledAt: new Date() },
    });
    expect(await queue.processPendingJobs()).toBe(1);
    expect(await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: 'COMPLETED',
      attempts: 2,
      lastError: null,
    });
  });

  it.each([3, 4])('marca FAILED el huérfano con %i intentos y máximo 3', async (attempts) => {
    const job = await prisma.backgroundJob.create({
      data: {
        jobType: 'EVALUATE_EXPIRATIONS',
        status: 'PROCESSING',
        attempts,
        maxAttempts: 3,
        startedAt: new Date(Date.now() - 16 * 60_000),
      },
    });
    expect(await new JobQueueService(new ExpirationEvaluatorService()).processPendingJobs()).toBe(
      0,
    );

    expect(await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: 'FAILED',
      attempts,
      startedAt: null,
      completedAt: null,
      scheduledAt: job.scheduledAt,
      lastError: 'Trabajo interrumpido; intentos agotados',
    });
  });

  it('no toca un PROCESSING reciente ni estados terminales', async () => {
    const jobs = await Promise.all(
      ['PROCESSING', 'COMPLETED', 'FAILED'].map((status) =>
        prisma.backgroundJob.create({
          data: {
            jobType: 'EVALUATE_EXPIRATIONS',
            status,
            attempts: 1,
            startedAt: new Date(Date.now() - (status === 'PROCESSING' ? 1 : 16) * 60_000),
          },
        }),
      ),
    );
    expect(await new JobQueueService(new ExpirationEvaluatorService()).processPendingJobs()).toBe(
      0,
    );
    for (const job of jobs) {
      expect(await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } })).toEqual(job);
    }
  });

  it('dos recuperaciones simultáneas no duplican el efecto ni reclaman el huérfano', async () => {
    const job = await prisma.backgroundJob.create({
      data: {
        jobType: 'EVALUATE_EXPIRATIONS',
        status: 'PROCESSING',
        attempts: 1,
        startedAt: new Date(Date.now() - 16 * 60_000),
      },
    });
    const evaluator = new ExpirationEvaluatorService();
    const evaluate = vi.spyOn(evaluator, 'evaluate');
    const first = new JobQueueService(evaluator);
    const second = new JobQueueService(evaluator);
    expect(await Promise.all([first.processPendingJobs(), second.processPendingJobs()])).toEqual([
      0, 0,
    ]);
    expect(evaluate).not.toHaveBeenCalled();
    const recovered = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(recovered).toMatchObject({ status: 'PENDING', attempts: 1, startedAt: null });
    expect(recovered.lastError).toBe('Trabajo interrumpido; se reintenta automáticamente');

    await Promise.all([first.processPendingJobs(), second.processPendingJobs()]);
    expect(await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } })).toEqual(
      recovered,
    );
  });

  it('una ejecución antigua no sobrescribe el estado recuperado al finalizar', async () => {
    const job = await prisma.backgroundJob.create({ data: { jobType: 'EVALUATE_EXPIRATIONS' } });
    const evaluator = new ExpirationEvaluatorService();
    vi.spyOn(evaluator, 'evaluate').mockImplementationOnce(async () => {
      // Simula una pausa del proceso que supera el umbral mientras evalúa.
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: { startedAt: new Date(Date.now() - 16 * 60_000) },
      });
      expect(await new JobQueueService(new ExpirationEvaluatorService()).processPendingJobs()).toBe(
        0,
      );
      return {
        skipped: false,
        evaluatedLots: 0,
        createdAlerts: 0,
        updatedAlerts: 0,
        resolvedAlerts: 0,
        timestamp: new Date().toISOString(),
      };
    });
    expect(await new JobQueueService(evaluator).processPendingJobs()).toBe(1);
    expect(await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: 'PENDING',
      attempts: 1,
      startedAt: null,
      completedAt: null,
      lastError: 'Trabajo interrumpido; se reintenta automáticamente',
    });
  });

  it('una evaluación normal termina COMPLETED tras evaluar realmente', async () => {
    const job = await prisma.backgroundJob.create({ data: { jobType: 'EVALUATE_EXPIRATIONS' } });
    const evaluator = new ExpirationEvaluatorService();
    const evaluate = vi.spyOn(evaluator, 'evaluate');
    expect(await new JobQueueService(evaluator).processPendingJobs()).toBe(1);
    expect(evaluate).toHaveBeenCalledOnce();
    expect(await evaluate.mock.results[0].value).toMatchObject({ skipped: false });
    const completed = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(completed).toMatchObject({ status: 'COMPLETED', attempts: 1, lastError: null });
    expect(completed.completedAt).not.toBeNull();
  });
});

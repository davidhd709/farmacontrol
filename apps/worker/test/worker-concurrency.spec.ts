import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanTestDatabase, prisma } from '@farmacia/database';
import { ExpirationEvaluatorService } from '../src/services/expiration-evaluator.service';
import { JobQueueService } from '../src/services/job-queue.service';

describe('Worker concurrency (PostgreSQL real)', () => {
  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('evita dos evaluaciones simultáneas y una alerta duplicada', async () => {
    const category = await prisma.category.create({ data: { name: 'Worker concurrency' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'WORKER-CONC',
        name: 'Producto worker',
        basePrice: '100',
      },
    });
    const location = await prisma.location.create({
      data: { code: 'WORKER', name: 'Bodega worker' },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        productId: product.id,
        locationId: location.id,
        lotNumber: 'CONC-1',
        expirationDate: new Date('2026-06-01T00:00:00Z'),
        currentQuantity: 10,
      },
    });
    const referenceDate = new Date('2026-06-01T15:00:00Z');
    const [first, second] = await Promise.all([
      new ExpirationEvaluatorService().evaluate(referenceDate),
      new ExpirationEvaluatorService().evaluate(referenceDate),
    ]);

    expect(first.createdAlerts + second.createdAlerts).toBe(1);
    expect(await prisma.inventoryAlert.count({ where: { lotId: lot.id } })).toBe(1);
    const alert = await prisma.inventoryAlert.findUniqueOrThrow({
      where: { lotId_alertType: { lotId: lot.id, alertType: 'EXPIRATION' } },
    });
    expect(alert.severity).toBe('CRITICO');
    expect(alert.daysRemaining).toBe(0);
  });

  it('dos consumidores reclaman trabajos sin ejecutarlos dos veces', async () => {
    const jobs = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        prisma.backgroundJob.create({
          data: {
            jobType: 'EVALUATE_EXPIRATIONS',
            payload: { referenceDate: '2026-06-01T15:00:00Z', index },
          },
        }),
      ),
    );
    const calls: number[] = [];
    const evaluator = {
      evaluate: async (date: Date) => {
        calls.push(date.getTime());
        await new Promise((resolve) => setTimeout(resolve, 30));
      },
    } as unknown as ExpirationEvaluatorService;
    const [first, second] = await Promise.all([
      new JobQueueService(evaluator).processPendingJobs(),
      new JobQueueService(evaluator).processPendingJobs(),
    ]);

    expect(first + second).toBe(6);
    expect(calls).toHaveLength(6);
    const completed = await prisma.backgroundJob.findMany({
      where: { id: { in: jobs.map((job) => job.id) } },
    });
    expect(completed).toHaveLength(6);
    expect(completed.every((job) => job.status === 'COMPLETED' && job.attempts === 1)).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { prisma, cleanTestDatabase } from '../src';
import { seedPuc } from '../src/seed/seed-puc';

describe('Siembra del PUC (PostgreSQL real)', () => {
  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await prisma.$disconnect();
  });

  it('los mapeos rigen desde el día de Bogotá aunque en UTC ya sea el día siguiente', async () => {
    // 23:30 del 24 de octubre en Bogotá = 04:30 del 25 en UTC. Antes regían desde el 25 y una
    // compra o venta de ese día fallaba por falta de mapeo vigente.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T04:30:00.000Z'));

    const { mappedCount } = await seedPuc();
    expect(mappedCount).toBeGreaterThan(0);

    const inventory = await prisma.companyAccountingMapping.findFirstOrThrow({
      where: { purpose: 'INVENTORY', status: 'ACTIVE' },
      include: { account: true },
    });
    expect(inventory.effectiveFrom.toISOString().slice(0, 10)).toBe('2026-10-24');
    expect(inventory.account?.allowsMovement).toBe(true);
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma, cleanTestDatabase } from '../src';
import { Prisma } from '@prisma/client';

describe('CashMovements — Integridad de Persistencia en PostgreSQL (Integration)', () => {
  let userId: string;

  beforeAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();

    const user = await prisma.user.create({
      data: {
        username: 'cajero_test',
        passwordHash: '$2b$10$hashedpasswordforexamplepurposeonly',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  it('permite insertar un movimiento de ingreso y luego un egreso manteniendo la trazabilidad del saldo', async () => {
    // 1. Ingreso de base o venta inicial
    const ingreso = await prisma.cashMovement.create({
      data: {
        movementType: 'INGRESO_MANUAL',
        amount: new Prisma.Decimal('50000.00'),
        paymentMethod: 'EFECTIVO',
        reason: 'Base inicial de caja',
        balanceAfter: new Prisma.Decimal('50000.00'),
        createdByUserId: userId,
      },
    });

    expect(ingreso.id).toBeDefined();
    expect(Number(ingreso.amount)).toBe(50000);
    expect(Number(ingreso.balanceAfter)).toBe(50000);
    expect(ingreso.paymentMethod).toBe('EFECTIVO');

    // 2. Egreso por compra menor o retiro
    const egreso = await prisma.cashMovement.create({
      data: {
        movementType: 'EGRESO_MANUAL',
        amount: new Prisma.Decimal('15000.00'),
        paymentMethod: 'EFECTIVO',
        reason: 'Pago de servicio de mensajería',
        balanceAfter: new Prisma.Decimal('35000.00'),
        createdByUserId: userId,
      },
    });

    expect(egreso.id).toBeDefined();
    expect(Number(egreso.amount)).toBe(15000);
    expect(Number(egreso.balanceAfter)).toBe(35000);

    // 3. Consulta de movimientos ordenados cronológicamente
    const list = await prisma.cashMovement.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdByUser: true },
    });

    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(egreso.id);
    expect(list[0].createdByUser.username).toBe('cajero_test');
  });

  it('rechaza mediante CHECK constraint un monto menor o igual a cero', async () => {
    await expect(
      prisma.cashMovement.create({
        data: {
          movementType: 'INGRESO_MANUAL',
          amount: new Prisma.Decimal('0.00'),
          paymentMethod: 'EFECTIVO',
          reason: 'Monto inválido cero',
          balanceAfter: new Prisma.Decimal('0.00'),
          createdByUserId: userId,
        },
      }),
    ).rejects.toThrow();
  });

  it('rechaza mediante CHECK constraint un saldo posterior (balance_after) negativo', async () => {
    await expect(
      prisma.cashMovement.create({
        data: {
          movementType: 'EGRESO_MANUAL',
          amount: new Prisma.Decimal('10000.00'),
          paymentMethod: 'EFECTIVO',
          reason: 'Intento de saldo negativo',
          balanceAfter: new Prisma.Decimal('-5000.00'),
          createdByUserId: userId,
        },
      }),
    ).rejects.toThrow();
  });
});

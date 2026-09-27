import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma, cleanTestDatabase } from '@farmacia/database';
import { PrismaAuditEventRepository } from '../../src/modules/audit/infrastructure/adapters/prisma-audit-event.repository';
import { AuditService } from '../../src/modules/audit/application/services/audit.service';

describe('AuditService (Integration with PostgreSQL)', () => {
  const repository = new PrismaAuditEventRepository(prisma);
  const auditService = new AuditService(repository);

  beforeAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await prisma.$disconnect();
  });

  it('debe registrar un evento de auditoría asociado a un usuario y persistirlo en PostgreSQL', async () => {
    const user = await prisma.user.create({
      data: {
        username: 'farmaceutico_1',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
        isActive: true,
      },
    });

    const event = await auditService.recordEvent({
      userId: user.id,
      action: 'user:update_password',
      entity: 'User',
      entityId: user.id,
      details: { changedBy: 'self', method: 'web' },
      ipAddress: '192.168.1.15',
      correlationId: 'corr-req-001',
    });

    expect(event.id).toBeDefined();
    expect(event.userId).toBe(user.id);
    expect(event.action).toBe('user:update_password');
    expect(event.entity).toBe('User');
    expect(event.entityId).toBe(user.id);
    expect(event.details).toEqual({ changedBy: 'self', method: 'web' });
    expect(event.ipAddress).toBe('192.168.1.15');
    expect(event.correlationId).toBe('corr-req-001');

    // Comprobar persistencia real en la base de datos
    const dbRecord = await prisma.auditEvent.findUnique({
      where: { id: event.id },
    });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.action).toBe('user:update_password');
    expect(dbRecord?.correlationId).toBe('corr-req-001');
  });

  it('debe registrar un evento de auditoría del sistema cuando userId es null', async () => {
    const event = await auditService.recordEvent({
      action: 'auth:login_failed',
      entity: 'Session',
      details: { username: 'intruder', reason: 'invalid_password' },
      ipAddress: '203.0.113.195',
      correlationId: 'corr-failed-login',
    });

    expect(event.id).toBeDefined();
    expect(event.userId).toBeNull();
    expect(event.action).toBe('auth:login_failed');

    const retrieved = await auditService.findById(event.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.userId).toBeNull();
    expect(retrieved?.action).toBe('auth:login_failed');
  });

  it('debe persistir un evento de auditoría dentro de una transacción interactiva de Prisma', async () => {
    const user = await prisma.user.create({
      data: {
        username: 'transaccional_user',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
        isActive: true,
      },
    });

    // Ejecutar operación de negocio y auditoría dentro de $transaction
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });

      await auditService.recordEvent(
        {
          userId: user.id,
          action: 'user:deactivate',
          entity: 'User',
          entityId: user.id,
          details: { previousStatus: true, newStatus: false },
          correlationId: 'corr-tx-success',
        },
        tx
      );
    });

    // Verificar que tanto la entidad como el evento se consolidaron en BD
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updatedUser?.isActive).toBe(false);

    const auditEvents = await auditService.findByCorrelationId('corr-tx-success');
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].action).toBe('user:deactivate');
  });

  it('debe revertir atómicamente el evento de auditoría si la transacción falla y hace rollback', async () => {
    const correlationId = 'corr-tx-rollback-test';

    const txPromise = prisma.$transaction(async (tx) => {
      await auditService.recordEvent(
        {
          action: 'payment:process',
          entity: 'Payment',
          entityId: 'pay-001',
          details: { amount: 50000 },
          correlationId,
        },
        tx
      );

      // Simular un fallo de negocio que aborta la transacción
      throw new Error('Fallo simulado en pasarela de pago');
    });

    await expect(txPromise).rejects.toThrow('Fallo simulado en pasarela de pago');

    // El evento de auditoría NO debe haberse persistido debido al rollback atómico
    const events = await auditService.findByCorrelationId(correlationId);
    expect(events).toHaveLength(0);
  });

  it('debe consultar eventos recientes con filtros de entidad y acción', async () => {
    await auditService.recordEvent({
      action: 'catalog:category_created',
      entity: 'Category',
      entityId: 'cat-1',
      correlationId: 'corr-cat',
    });

    await auditService.recordEvent({
      action: 'catalog:product_created',
      entity: 'Product',
      entityId: 'prod-1',
      correlationId: 'corr-prod',
    });

    await auditService.recordEvent({
      action: 'catalog:category_created',
      entity: 'Category',
      entityId: 'cat-2',
      correlationId: 'corr-cat-2',
    });

    const categoryEvents = await auditService.findRecent({
      entity: 'Category',
      action: 'catalog:category_created',
    });

    expect(categoryEvents).toHaveLength(2);
    expect(categoryEvents.every((e) => e.entity === 'Category')).toBe(true);
    expect(categoryEvents.every((e) => e.action === 'catalog:category_created')).toBe(true);
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma, cleanTestDatabase } from '../src';

describe('Auditoría — Integridad de Persistencia e Inmutabilidad de audit_events (Integration)', () => {
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

  it('debe registrar un evento de auditoría completo asociado a un usuario', async () => {
    const user = await prisma.user.create({
      data: {
        username: 'auditor_user',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
        isActive: true,
      },
    });

    const event = await prisma.auditEvent.create({
      data: {
        userId: user.id,
        action: 'auth:login_success',
        entity: 'User',
        entityId: user.id,
        details: { ip: '127.0.0.1', userAgent: 'Vitest/Test-Agent', reason: 'normal_login' },
        ipAddress: '127.0.0.1',
        correlationId: 'req-corr-12345',
      },
    });

    expect(event.id).toBeDefined();
    expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(event.userId).toBe(user.id);
    expect(event.action).toBe('auth:login_success');
    expect(event.entity).toBe('User');
    expect(event.entityId).toBe(user.id);
    expect(event.details).toEqual({ ip: '127.0.0.1', userAgent: 'Vitest/Test-Agent', reason: 'normal_login' });
    expect(event.ipAddress).toBe('127.0.0.1');
    expect(event.correlationId).toBe('req-corr-12345');
    expect(event.createdAt).toBeInstanceOf(Date);
  });

  it('debe registrar un evento de auditoría del sistema o anónimo (sin userId)', async () => {
    const event = await prisma.auditEvent.create({
      data: {
        userId: null,
        action: 'auth:login_failure',
        entity: 'Auth',
        entityId: null,
        details: { attemptedUsername: 'unknown_user', reason: 'invalid_credentials' },
        ipAddress: '192.168.1.100',
        correlationId: 'req-corr-system-999',
      },
    });

    expect(event.id).toBeDefined();
    expect(event.userId).toBeNull();
    expect(event.action).toBe('auth:login_failure');
    expect(event.entity).toBe('Auth');
    expect(event.details).toEqual({ attemptedUsername: 'unknown_user', reason: 'invalid_credentials' });
  });

  it('debe rechazar cualquier intento de UPDATE en audit_events mediante el trigger de base de datos', async () => {
    const event = await prisma.auditEvent.create({
      data: {
        action: 'inventory:adjustment',
        entity: 'Inventory',
        entityId: 'item-001',
        details: { diff: -5 },
      },
    });

    // Intento de modificar el evento
    await expect(
      prisma.$executeRaw`UPDATE "audit_events" SET "action" = 'tampered:action' WHERE "id" = ${event.id}::uuid`
    ).rejects.toThrow(/audit_events is an immutable append-only table/i);

    // Verificar que el registro permanezca intacto
    const unchanged = await prisma.auditEvent.findUnique({
      where: { id: event.id },
    });
    expect(unchanged?.action).toBe('inventory:adjustment');
  });

  it('debe rechazar cualquier intento de DELETE en audit_events mediante el trigger de base de datos', async () => {
    const event = await prisma.auditEvent.create({
      data: {
        action: 'cash:register_open',
        entity: 'CashRegister',
        entityId: 'register-01',
        details: { initialAmount: 100 },
      },
    });

    // Intento de eliminar el evento
    await expect(
      prisma.$executeRaw`DELETE FROM "audit_events" WHERE "id" = ${event.id}::uuid`
    ).rejects.toThrow(/audit_events is an immutable append-only table/i);

    // Verificar que el registro aún existe
    const exists = await prisma.auditEvent.findUnique({
      where: { id: event.id },
    });
    expect(exists).not.toBeNull();
  });

  it('debe impedir la eliminación (DELETE) de un usuario que tenga eventos de auditoría (onDelete: Restrict)', async () => {
    const user = await prisma.user.create({
      data: {
        username: 'protected_user',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
        isActive: true,
      },
    });

    await prisma.auditEvent.create({
      data: {
        userId: user.id,
        action: 'user:profile_update',
        entity: 'User',
        entityId: user.id,
      },
    });

    // Al intentar eliminar al usuario, la FK con Restrict debe rechazar la eliminación
    await expect(
      prisma.user.delete({
        where: { id: user.id },
      })
    ).rejects.toThrow();
  });

  it('cleanTestDatabase debe truncar y dejar limpia la tabla audit_events sin violar el trigger', async () => {
    await prisma.auditEvent.create({
      data: {
        action: 'test:cleanup',
        entity: 'Test',
      },
    });

    const beforeCount = await prisma.auditEvent.count();
    expect(beforeCount).toBe(1);

    await cleanTestDatabase();

    const afterCount = await prisma.auditEvent.count();
    expect(afterCount).toBe(0);
  });
});

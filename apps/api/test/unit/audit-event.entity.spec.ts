import { describe, it, expect } from 'vitest';
import { AuditEvent } from '../../src/modules/audit/domain/entities/audit-event.entity';

describe('AuditEvent Entity (Unit)', () => {
  it('debe instanciar un evento válido con todos sus campos', () => {
    const event = AuditEvent.create({
      userId: '11111111-1111-1111-1111-111111111111',
      action: 'user:create',
      entity: 'User',
      entityId: '22222222-2222-2222-2222-222222222222',
      details: { role: 'cajero', createdBy: 'admin' },
      ipAddress: '192.168.1.50',
      correlationId: 'req-corr-001',
    });

    expect(event.id).toBeDefined();
    expect(event.userId).toBe('11111111-1111-1111-1111-111111111111');
    expect(event.action).toBe('user:create');
    expect(event.entity).toBe('User');
    expect(event.entityId).toBe('22222222-2222-2222-2222-222222222222');
    expect(event.details).toEqual({ role: 'cajero', createdBy: 'admin' });
    expect(event.ipAddress).toBe('192.168.1.50');
    expect(event.correlationId).toBe('req-corr-001');
    expect(event.createdAt).toBeInstanceOf(Date);
  });

  it('debe permitir instanciar un evento del sistema sin usuario', () => {
    const event = AuditEvent.create({
      action: 'system:startup',
      entity: 'Platform',
    });

    expect(event.userId).toBeNull();
    expect(event.entityId).toBeNull();
    expect(event.details).toBeNull();
    expect(event.ipAddress).toBeNull();
    expect(event.correlationId).toBeNull();
  });

  it('debe rechazar acción vacía o en blanco', () => {
    expect(() =>
      AuditEvent.create({
        action: '',
        entity: 'User',
      })
    ).toThrow('La acción de auditoría no puede estar vacía.');

    expect(() =>
      AuditEvent.create({
        action: '   ',
        entity: 'User',
      })
    ).toThrow('La acción de auditoría no puede estar vacía.');
  });

  it('debe rechazar entidad vacía o en blanco', () => {
    expect(() =>
      AuditEvent.create({
        action: 'auth:login',
        entity: '',
      })
    ).toThrow('La entidad auditada no puede estar vacía.');

    expect(() =>
      AuditEvent.create({
        action: 'auth:login',
        entity: '   ',
      })
    ).toThrow('La entidad auditada no puede estar vacía.');
  });

  it('debe rechazar campos que excedan la longitud máxima de base de datos', () => {
    expect(() =>
      AuditEvent.create({
        action: 'a'.repeat(101),
        entity: 'User',
      })
    ).toThrow('La acción de auditoría no puede exceder 100 caracteres.');

    expect(() =>
      AuditEvent.create({
        action: 'valid:action',
        entity: 'e'.repeat(101),
      })
    ).toThrow('El nombre de la entidad auditada no puede exceder 100 caracteres.');

    expect(() =>
      AuditEvent.create({
        action: 'valid:action',
        entity: 'User',
        entityId: 'i'.repeat(256),
      })
    ).toThrow('El identificador de entidad no puede exceder 255 caracteres.');

    expect(() =>
      AuditEvent.create({
        action: 'valid:action',
        entity: 'User',
        ipAddress: '1'.repeat(46),
      })
    ).toThrow('La dirección IP no puede exceder 45 caracteres.');

    expect(() =>
      AuditEvent.create({
        action: 'valid:action',
        entity: 'User',
        correlationId: 'c'.repeat(101),
      })
    ).toThrow('El correlationId no puede exceder 100 caracteres.');
  });

  it('debe congelar la instancia y los detalles para garantizar inmutabilidad en memoria', () => {
    const event = AuditEvent.create({
      action: 'inventory:adjust',
      entity: 'Item',
      details: { qty: 10 },
    });

    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.details)).toBe(true);

    expect(() => {
      (event as unknown as Record<string, unknown>).action = 'tampered';
    }).toThrow();

    expect(() => {
      if (event.details) {
        (event.details as Record<string, unknown>).qty = 999;
      }
    }).toThrow();
  });

  it('debe convertir a DTO serializable correctamente', () => {
    const fixedDate = new Date('2026-09-25T12:00:00.000Z');
    const event = AuditEvent.reconstitute({
      id: 'testid-1234',
      userId: 'user-1',
      action: 'role:assign',
      entity: 'Role',
      entityId: 'role-admin',
      details: { assignedBy: 'supervisor' },
      ipAddress: '10.0.0.1',
      correlationId: 'corr-xyz',
      createdAt: fixedDate,
    });

    const dto = event.toDto();
    expect(dto).toEqual({
      id: 'testid-1234',
      userId: 'user-1',
      user: null,
      action: 'role:assign',
      entity: 'Role',
      entityId: 'role-admin',
      details: { assignedBy: 'supervisor' },
      ipAddress: '10.0.0.1',
      correlationId: 'corr-xyz',
      createdAt: '2026-09-25T12:00:00.000Z',
    });
  });
});

import { describe, it, expect } from 'vitest';
import { Session } from '../../src/modules/identity/domain/entities/session.entity';
import {
  InvalidSessionTokenException,
  SessionExpiredException,
  SessionRevokedException,
} from '../../src/modules/identity/domain/exceptions/identity.exceptions';

describe('Session (Domain Entity)', () => {
  const validUserId = '11111111-1111-1111-1111-111111111111';
  const validTokenHash = 'a'.repeat(64); // 64 caracteres hex válidos
  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24h
  const pastDate = new Date(Date.now() - 60 * 1000); // -1 minuto

  describe('Creación e invariantes', () => {
    it('debe crear una instancia válida de Session con datos correctos', () => {
      const session = Session.create({
        userId: validUserId,
        tokenHash: validTokenHash,
        expiresAt: futureDate,
      });

      expect(session.userId).toBe(validUserId);
      expect(session.tokenHash).toBe(validTokenHash);
      expect(session.expiresAt).toEqual(futureDate);
      expect(session.isExpired()).toBe(false);
      expect(session.isRevoked()).toBe(false);
      expect(session.isValid()).toBe(true);
      expect(session.lastUsedAt).toBeUndefined();
      expect(session.revokedAt).toBeUndefined();
    });

    it('debe rechazar la creación si el userId está vacío', () => {
      expect(() =>
        Session.create({
          userId: '',
          tokenHash: validTokenHash,
          expiresAt: futureDate,
        })
      ).toThrow('El identificador de usuario (userId) es obligatorio.');
    });

    it('debe rechazar la creación si el tokenHash no tiene formato hexadecimal SHA-256 de 64 caracteres', () => {
      // Menos de 64 caracteres
      expect(() =>
        Session.create({
          userId: validUserId,
          tokenHash: 'abc123',
          expiresAt: futureDate,
        })
      ).toThrow(InvalidSessionTokenException);

      // Caracteres no hexadecimales
      expect(() =>
        Session.create({
          userId: validUserId,
          tokenHash: 'z'.repeat(64),
          expiresAt: futureDate,
        })
      ).toThrow(InvalidSessionTokenException);
    });

    it('debe rechazar la creación si expiresAt no es una fecha válida', () => {
      expect(() =>
        Session.create({
          userId: validUserId,
          tokenHash: validTokenHash,
          expiresAt: new Date('fecha-invalida'),
        })
      ).toThrow('La fecha de expiración (expiresAt) es obligatoria y debe ser una fecha válida.');
    });
  });

  describe('Reglas de negocio del ciclo de vida (Expiración, Revocación y Uso)', () => {
    it('debe detectar correctamente una sesión expirada', () => {
      const expiredSession = Session.create({
        userId: validUserId,
        tokenHash: validTokenHash,
        expiresAt: pastDate,
      });

      expect(expiredSession.isExpired()).toBe(true);
      expect(expiredSession.isValid()).toBe(false);
    });

    it('permite revocar una sesión y reflejar su estado no válido', () => {
      const session = Session.create({
        userId: validUserId,
        tokenHash: validTokenHash,
        expiresAt: futureDate,
      });

      expect(session.isRevoked()).toBe(false);
      expect(session.isValid()).toBe(true);

      const revocationDate = new Date();
      session.revoke(revocationDate);

      expect(session.isRevoked()).toBe(true);
      expect(session.revokedAt).toEqual(revocationDate);
      expect(session.isValid()).toBe(false);
    });

    it('permite registrar el uso (recordUsage) en una sesión válida', () => {
      const session = Session.create({
        userId: validUserId,
        tokenHash: validTokenHash,
        expiresAt: futureDate,
      });

      const usageDate = new Date();
      session.recordUsage(usageDate);

      expect(session.lastUsedAt).toEqual(usageDate);
    });

    it('rechaza recordUsage si la sesión está expirada', () => {
      const expiredSession = Session.create({
        userId: validUserId,
        tokenHash: validTokenHash,
        expiresAt: pastDate,
      });

      expect(() => expiredSession.recordUsage()).toThrow(SessionExpiredException);
    });

    it('rechaza recordUsage si la sesión está revocada', () => {
      const session = Session.create({
        userId: validUserId,
        tokenHash: validTokenHash,
        expiresAt: futureDate,
      });

      session.revoke();
      expect(() => session.recordUsage()).toThrow(SessionRevokedException);
    });
  });

  describe('Reconstitución desde persistencia', () => {
    it('debe reconstruir fielmente la entidad con todas sus marcas de tiempo', () => {
      const createdAt = new Date('2026-09-24T12:00:00Z');
      const lastUsedAt = new Date('2026-09-24T14:30:00Z');
      const revokedAt = new Date('2026-09-24T15:00:00Z');

      const reconstituted = Session.reconstitute({
        id: '22222222-2222-2222-2222-222222222222',
        userId: validUserId,
        tokenHash: validTokenHash,
        expiresAt: futureDate,
        createdAt,
        lastUsedAt,
        revokedAt,
      });

      expect(reconstituted.id).toBe('22222222-2222-2222-2222-222222222222');
      expect(reconstituted.userId).toBe(validUserId);
      expect(reconstituted.tokenHash).toBe(validTokenHash);
      expect(reconstituted.createdAt).toEqual(createdAt);
      expect(reconstituted.lastUsedAt).toEqual(lastUsedAt);
      expect(reconstituted.revokedAt).toEqual(revokedAt);
      expect(reconstituted.isRevoked()).toBe(true);
      expect(reconstituted.isValid()).toBe(false);
    });
  });
});

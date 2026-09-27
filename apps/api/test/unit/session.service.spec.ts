import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SessionService,
  DEFAULT_SESSION_DURATION_MS,
} from '../../src/modules/identity/application/services/session.service';
import {
  SessionTokenPort,
  GeneratedSessionToken,
} from '../../src/modules/identity/application/ports/session-token.port';
import { SessionRepositoryPort } from '../../src/modules/identity/application/ports/session.repository.port';
import { Session } from '../../src/modules/identity/domain/entities/session.entity';
import { InvalidSessionDurationException } from '../../src/modules/identity/domain/exceptions/identity.exceptions';

describe('SessionService (Unit)', () => {
  let service: SessionService;
  let mockTokenPort: SessionTokenPort;
  let mockSessionRepository: SessionRepositoryPort;

  const sampleRawToken = '1'.repeat(64);
  const sampleTokenHash = '2'.repeat(64);
  const sampleUserId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    mockTokenPort = {
      generate: vi.fn((): GeneratedSessionToken => ({
        rawToken: sampleRawToken,
        tokenHash: sampleTokenHash,
      })),
      hash: vi.fn((rawToken: string) => {
        if (rawToken === sampleRawToken) return sampleTokenHash;
        return 'f'.repeat(64);
      }),
    };

    mockSessionRepository = {
      create: vi.fn(async (session: Session) => session),
      findByTokenHash: vi.fn(async () => null),
      findById: vi.fn(async () => null),
      update: vi.fn(async (session: Session) => session),
      delete: vi.fn(async () => {}),
      deleteByUserId: vi.fn(async () => 1),
    };

    service = new SessionService(mockTokenPort, mockSessionRepository);
  });

  describe('createSession', () => {
    it('debe generar el token, persistir únicamente el tokenHash y retornar rawToken al cliente', async () => {
      const result = await service.createSession(sampleUserId);

      expect(mockTokenPort.generate).toHaveBeenCalled();
      expect(result.rawToken).toBe(sampleRawToken);
      expect(result.session.userId).toBe(sampleUserId);
      expect(result.session.tokenHash).toBe(sampleTokenHash);

      // Comprobar que en el repositorio se persistió el tokenHash y NO el rawToken
      expect(mockSessionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: sampleUserId,
          tokenHash: sampleTokenHash,
        })
      );
    });

    it('debe configurar la expiración por defecto en 24 horas', async () => {
      const before = Date.now();
      const result = await service.createSession(sampleUserId);
      const after = Date.now();

      const expectedMinExpiresAt = before + DEFAULT_SESSION_DURATION_MS;
      const expectedMaxExpiresAt = after + DEFAULT_SESSION_DURATION_MS;

      expect(result.session.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinExpiresAt);
      expect(result.session.expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxExpiresAt);
    });

    it('permite configurar una duración de sesión personalizada', async () => {
      const customDuration = 3600 * 1000; // 1 hora
      const before = Date.now();
      const result = await service.createSession(sampleUserId, customDuration);

      expect(result.session.expiresAt.getTime()).toBeGreaterThanOrEqual(before + customDuration);
    });

    it('debe rechazar duraciones inválidas: cero, negativas, NaN, Infinity o fraccionarias (F-21)', async () => {
      // Duración cero
      await expect(service.createSession(sampleUserId, 0)).rejects.toThrow(
        InvalidSessionDurationException
      );

      // Duración negativa
      await expect(service.createSession(sampleUserId, -1000)).rejects.toThrow(
        InvalidSessionDurationException
      );

      // Duración NaN
      await expect(service.createSession(sampleUserId, NaN)).rejects.toThrow(
        InvalidSessionDurationException
      );

      // Duración Infinity
      await expect(service.createSession(sampleUserId, Infinity)).rejects.toThrow(
        InvalidSessionDurationException
      );

      // Duración fraccionaria (debe ser entero de milisegundos)
      await expect(service.createSession(sampleUserId, 1000.5)).rejects.toThrow(
        InvalidSessionDurationException
      );

      // Duración no numérica
      // @ts-expect-error test runtime
      await expect(service.createSession(sampleUserId, 'invalid')).rejects.toThrow(
        InvalidSessionDurationException
      );

      // Ninguna sesión debe haberse persistido en el repositorio
      expect(mockSessionRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('validateSession', () => {
    it('debe retornar la sesión y actualizar lastUsedAt si el token es válido y activo', async () => {
      const activeSession = Session.create({
        id: 'session-uuid-1',
        userId: sampleUserId,
        tokenHash: sampleTokenHash,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });

      vi.mocked(mockSessionRepository.findByTokenHash).mockResolvedValue(activeSession);

      const validated = await service.validateSession(sampleRawToken, true);

      expect(mockTokenPort.hash).toHaveBeenCalledWith(sampleRawToken);
      expect(mockSessionRepository.findByTokenHash).toHaveBeenCalledWith(sampleTokenHash);
      expect(validated).not.toBeNull();
      expect(validated!.id).toBe('session-uuid-1');
      expect(validated!.lastUsedAt).toBeInstanceOf(Date);
      expect(mockSessionRepository.update).toHaveBeenCalledWith(activeSession);
    });

    it('debe retornar null si el token recibido está vacío o es nulo (F-19)', async () => {
      expect(await service.validateSession('')).toBeNull();
      // @ts-expect-error test runtime
      expect(await service.validateSession(null)).toBeNull();
      expect(mockTokenPort.hash).not.toHaveBeenCalled();
    });

    it('debe rechazar tokens con longitud distinta a 64 sin calcular hash ni consultar BD (F-19)', async () => {
      // Menos de 64 caracteres
      expect(await service.validateSession('corto')).toBeNull();
      // Más de 64 caracteres
      expect(await service.validateSession('a'.repeat(65))).toBeNull();
      // Payload extremo (mitigación DoS)
      expect(await service.validateSession('a'.repeat(100000))).toBeNull();

      expect(mockTokenPort.hash).not.toHaveBeenCalled();
      expect(mockSessionRepository.findByTokenHash).not.toHaveBeenCalled();
    });

    it('debe rechazar tokens de 64 caracteres que contengan caracteres no hexadecimales (F-19)', async () => {
      const nonHexToken = 'z'.repeat(64);
      expect(await service.validateSession(nonHexToken)).toBeNull();
      expect(mockTokenPort.hash).not.toHaveBeenCalled();
      expect(mockSessionRepository.findByTokenHash).not.toHaveBeenCalled();
    });

    it('debe actualizar lastUsedAt en la primera consulta (lastUsedAt indefinido) (F-20)', async () => {
      const activeSession = Session.create({
        id: 'session-uuid-1',
        userId: sampleUserId,
        tokenHash: sampleTokenHash,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });

      vi.mocked(mockSessionRepository.findByTokenHash).mockResolvedValue(activeSession);

      const now = new Date();
      await service.validateSession(sampleRawToken, true, now);

      expect(activeSession.lastUsedAt).toEqual(now);
      expect(mockSessionRepository.update).toHaveBeenCalledWith(activeSession);
    });

    it('NO debe actualizar lastUsedAt si la consulta ocurre dentro del umbral de 5 minutos (F-20)', async () => {
      const t0 = new Date('2026-09-24T12:00:00Z');
      const activeSession = Session.reconstitute({
        id: 'session-uuid-1',
        userId: sampleUserId,
        tokenHash: sampleTokenHash,
        expiresAt: new Date('2026-09-25T12:00:00Z'),
        createdAt: new Date('2026-09-24T11:00:00Z'),
        lastUsedAt: t0, // Último uso hace 2 minutos
        revokedAt: null,
      });

      vi.mocked(mockSessionRepository.findByTokenHash).mockResolvedValue(activeSession);

      // Petición 2 minutos después (dentro del umbral de 5 min)
      const t1 = new Date('2026-09-24T12:02:00Z');
      const validated = await service.validateSession(sampleRawToken, true, t1);

      expect(validated).not.toBeNull();
      expect(activeSession.lastUsedAt).toEqual(t0); // No mutó
      expect(mockSessionRepository.update).not.toHaveBeenCalled(); // 0 escrituras a PostgreSQL
    });

    it('SÍ debe actualizar lastUsedAt si han transcurrido más de 5 minutos (F-20)', async () => {
      const t0 = new Date('2026-09-24T12:00:00Z');
      const activeSession = Session.reconstitute({
        id: 'session-uuid-1',
        userId: sampleUserId,
        tokenHash: sampleTokenHash,
        expiresAt: new Date('2026-09-25T12:00:00Z'),
        createdAt: new Date('2026-09-24T11:00:00Z'),
        lastUsedAt: t0,
        revokedAt: null,
      });

      vi.mocked(mockSessionRepository.findByTokenHash).mockResolvedValue(activeSession);

      // Petición 6 minutos después (supera el umbral de 5 min)
      const t2 = new Date('2026-09-24T12:06:00Z');
      const validated = await service.validateSession(sampleRawToken, true, t2);

      expect(validated).not.toBeNull();
      expect(activeSession.lastUsedAt).toEqual(t2); // Actualizado
      expect(mockSessionRepository.update).toHaveBeenCalledWith(activeSession);
    });

    it('debe retornar null si la sesión no existe en la base de datos', async () => {
      vi.mocked(mockSessionRepository.findByTokenHash).mockResolvedValue(null);

      const validLookingToken = 'a'.repeat(64);
      const validated = await service.validateSession(validLookingToken);
      expect(validated).toBeNull();
    });

    it('debe retornar null si la sesión existe pero está expirada', async () => {
      const expiredSession = Session.create({
        userId: sampleUserId,
        tokenHash: sampleTokenHash,
        expiresAt: new Date(Date.now() - 1000), // expirada
      });

      vi.mocked(mockSessionRepository.findByTokenHash).mockResolvedValue(expiredSession);

      const validated = await service.validateSession(sampleRawToken);
      expect(validated).toBeNull();
      expect(mockSessionRepository.update).not.toHaveBeenCalled();
    });

    it('debe retornar null si la sesión existe pero fue revocada', async () => {
      const revokedSession = Session.create({
        userId: sampleUserId,
        tokenHash: sampleTokenHash,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
      revokedSession.revoke();

      vi.mocked(mockSessionRepository.findByTokenHash).mockResolvedValue(revokedSession);

      const validated = await service.validateSession(sampleRawToken);
      expect(validated).toBeNull();
      expect(mockSessionRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('revokeSession', () => {
    it('debe revocar la sesión y actualizarla en el repositorio', async () => {
      const session = Session.create({
        userId: sampleUserId,
        tokenHash: sampleTokenHash,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });

      vi.mocked(mockSessionRepository.findByTokenHash).mockResolvedValue(session);

      const revoked = await service.revokeSession(sampleRawToken);

      expect(revoked).toBe(true);
      expect(session.isRevoked()).toBe(true);
      expect(mockSessionRepository.update).toHaveBeenCalledWith(session);
    });

    it('debe retornar false si la sesión a revocar no existe', async () => {
      vi.mocked(mockSessionRepository.findByTokenHash).mockResolvedValue(null);

      const revoked = await service.revokeSession('token_desconocido');
      expect(revoked).toBe(false);
    });
  });

  describe('revokeAllUserSessions', () => {
    it('debe delegar la eliminación de sesiones del usuario al repositorio', async () => {
      vi.mocked(mockSessionRepository.deleteByUserId).mockResolvedValue(3);

      const deletedCount = await service.revokeAllUserSessions(sampleUserId);

      expect(mockSessionRepository.deleteByUserId).toHaveBeenCalledWith(sampleUserId);
      expect(deletedCount).toBe(3);
    });
  });
});

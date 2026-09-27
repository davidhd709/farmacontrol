import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AuthService,
  DUMMY_ARGON2_HASH,
} from '../../src/modules/identity/application/services/auth.service';
import { UserRepositoryPort } from '../../src/modules/identity/application/ports/user.repository.port';
import { PasswordHasherPort } from '../../src/modules/identity/application/ports/password-hasher.port';
import { RbacRepositoryPort } from '../../src/modules/identity/application/ports/rbac.repository.port';
import { SessionService } from '../../src/modules/identity/application/services/session.service';
import { User } from '../../src/modules/identity/domain/entities/user.entity';
import { Username } from '../../src/modules/identity/domain/value-objects/username.vo';
import { InvalidCredentialsException } from '../../src/modules/identity/domain/exceptions/identity.exceptions';
import { Argon2PasswordHasherAdapter } from '../../src/modules/identity/infrastructure/adapters/argon2-password-hasher.adapter';

describe('AuthService (Unit)', () => {
  let authService: AuthService;
  let mockUserRepository: UserRepositoryPort;
  let mockPasswordHasher: PasswordHasherPort;
  let mockSessionService: SessionService;
  let mockRbacRepository: RbacRepositoryPort;

  const validUsername = 'cajero_principal';
  const validPassword = 'Password#2026!';
  const samplePasswordHash = '$argon2id$v=19$m=65536,t=3,p=4$realuserhash';
  const sampleUserId = '11111111-1111-1111-1111-111111111111';
  const sampleRawToken = 'a'.repeat(64);

  beforeEach(() => {
    mockUserRepository = {
      findById: vi.fn(),
      findByUsername: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    };

    mockPasswordHasher = {
      hash: vi.fn(),
      verify: vi.fn(),
    };

    mockSessionService = {
      createSession: vi.fn(),
      validateSession: vi.fn(),
      revokeSession: vi.fn(),
      revokeSessionById: vi.fn(),
      revokeAllUserSessions: vi.fn(),
    } as unknown as SessionService;

    mockRbacRepository = {
      getUserRbacContext: vi.fn().mockResolvedValue({
        roles: ['cajero'],
        permissions: ['sales:create', 'sales:read'],
      }),
    };

    authService = new AuthService(
      mockUserRepository,
      mockPasswordHasher,
      mockSessionService,
      mockRbacRepository
    );
  });

  describe('login', () => {
    it('debe iniciar sesión exitosamente con credenciales válidas', async () => {
      const activeUser = User.reconstitute({
        id: sampleUserId,
        username: validUsername,
        passwordHash: samplePasswordHash,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(mockUserRepository.findByUsername).mockResolvedValue(activeUser);
      vi.mocked(mockPasswordHasher.verify).mockResolvedValue(true);
      vi.mocked(mockSessionService.createSession).mockResolvedValue({
        session: {} as any,
        rawToken: sampleRawToken,
      });

      const result = await authService.login(validUsername, validPassword);

      expect(mockUserRepository.findByUsername).toHaveBeenCalled();
      expect(mockPasswordHasher.verify).toHaveBeenCalledWith(
        validPassword,
        samplePasswordHash
      );
      expect(mockSessionService.createSession).toHaveBeenCalledWith(sampleUserId);
      expect(result.user.id).toBe(sampleUserId);
      expect(result.rawToken).toBe(sampleRawToken);
      expect(result.roles).toEqual(['cajero']);
      expect(result.permissions).toEqual(['sales:create', 'sales:read']);
    });

    it('debe mitigar timing attacks ejecutando verify contra hash dummy si el usuario no existe', async () => {
      vi.mocked(mockUserRepository.findByUsername).mockResolvedValue(null);
      vi.mocked(mockPasswordHasher.verify).mockResolvedValue(false);

      await expect(
        authService.login('usuario_inexistente', validPassword)
      ).rejects.toThrow(InvalidCredentialsException);

      // Verificación de mitigación: verify fue invocado contra DUMMY_ARGON2_HASH
      expect(mockPasswordHasher.verify).toHaveBeenCalledWith(
        validPassword,
        DUMMY_ARGON2_HASH
      );
      expect(mockSessionService.createSession).not.toHaveBeenCalled();
    });

    it('debe comprobar que DUMMY_ARGON2_HASH es procesado realmente por Argon2id sin error de sintaxis PHC (F-24)', async () => {
      const realHasher = new Argon2PasswordHasherAdapter({
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });

      const start = Date.now();
      const isMatch = await realHasher.verify('AnyPassword#123', DUMMY_ARGON2_HASH);
      const elapsed = Date.now() - start;

      expect(isMatch).toBe(false);
      // Demuestra que no terminó inmediatamente (<1ms) por fallo de sintaxis de @phc/format
      expect(elapsed).toBeGreaterThanOrEqual(10);
    });

    it('debe rechazar el acceso y ejecutar verify dummy si el usuario está inactivo', async () => {
      const inactiveUser = User.reconstitute({
        id: sampleUserId,
        username: validUsername,
        passwordHash: samplePasswordHash,
        isActive: false, // Inactivo
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(mockUserRepository.findByUsername).mockResolvedValue(inactiveUser);
      vi.mocked(mockPasswordHasher.verify).mockResolvedValue(false);

      await expect(
        authService.login(validUsername, validPassword)
      ).rejects.toThrow(InvalidCredentialsException);

      expect(mockPasswordHasher.verify).toHaveBeenCalledWith(
        validPassword,
        DUMMY_ARGON2_HASH
      );
      expect(mockSessionService.createSession).not.toHaveBeenCalled();
    });

    it('debe rechazar el acceso si la contraseña es incorrecta', async () => {
      const activeUser = User.reconstitute({
        id: sampleUserId,
        username: validUsername,
        passwordHash: samplePasswordHash,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(mockUserRepository.findByUsername).mockResolvedValue(activeUser);
      vi.mocked(mockPasswordHasher.verify).mockResolvedValue(false); // Contraseña no coincide

      await expect(
        authService.login(validUsername, 'ContrasenaIncorrecta1#')
      ).rejects.toThrow(InvalidCredentialsException);

      expect(mockPasswordHasher.verify).toHaveBeenCalledWith(
        'ContrasenaIncorrecta1#',
        samplePasswordHash
      );
      expect(mockSessionService.createSession).not.toHaveBeenCalled();
    });

    it('debe ejecutar verify dummy ante formato de username inválido sin exponer el error', async () => {
      vi.mocked(mockPasswordHasher.verify).mockResolvedValue(false);

      await expect(
        authService.login('ab', validPassword) // username < 3 caracteres
      ).rejects.toThrow(InvalidCredentialsException);

      expect(mockPasswordHasher.verify).toHaveBeenCalledWith(
        validPassword,
        DUMMY_ARGON2_HASH
      );
    });

    it('debe rechazar entradas vacías sin procesar', async () => {
      await expect(authService.login('', validPassword)).rejects.toThrow(
        InvalidCredentialsException
      );
      await expect(authService.login(validUsername, '')).rejects.toThrow(
        InvalidCredentialsException
      );
    });
  });

  describe('logout', () => {
    it('debe revocar la sesión a través de SessionService si se provee rawToken', async () => {
      await authService.logout(sampleRawToken);
      expect(mockSessionService.revokeSession).toHaveBeenCalledWith(sampleRawToken);
    });

    it('debe ser idempotente y no fallar si no se provee rawToken', async () => {
      await expect(authService.logout(undefined)).resolves.not.toThrow();
      expect(mockSessionService.revokeSession).not.toHaveBeenCalled();
    });
  });
});

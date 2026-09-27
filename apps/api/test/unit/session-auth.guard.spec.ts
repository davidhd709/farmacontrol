import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SessionAuthGuard } from '../../src/modules/identity/presentation/guards/session-auth.guard';
import { SessionService } from '../../src/modules/identity/application/services/session.service';
import { UserRepositoryPort } from '../../src/modules/identity/application/ports/user.repository.port';
import { RbacRepositoryPort } from '../../src/modules/identity/application/ports/rbac.repository.port';
import { Session } from '../../src/modules/identity/domain/entities/session.entity';
import { User } from '../../src/modules/identity/domain/entities/user.entity';

describe('SessionAuthGuard (Unit)', () => {
  let guard: SessionAuthGuard;
  let mockSessionService: SessionService;
  let mockUserRepository: UserRepositoryPort;
  let mockRbacRepository: RbacRepositoryPort;

  const validRawToken = 'a'.repeat(64);
  const sampleUserId = '11111111-1111-1111-1111-111111111111';
  const sampleSessionId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    mockSessionService = {
      validateSession: vi.fn(),
    } as unknown as SessionService;

    mockUserRepository = {
      findById: vi.fn(),
    } as unknown as UserRepositoryPort;

    mockRbacRepository = {
      getUserRbacContext: vi.fn().mockResolvedValue({
        roles: ['farmaceutico'],
        permissions: ['inventory:read'],
      }),
    } as unknown as RbacRepositoryPort;

    guard = new SessionAuthGuard(
      mockSessionService,
      mockUserRepository,
      mockRbacRepository
    );
  });

  function createMockExecutionContext(cookieHeader?: string): {
    context: ExecutionContext;
    request: any;
  } {
    const request = {
      headers: {
        cookie: cookieHeader,
      },
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    return { context, request };
  }

  it('debe rechazar la petición con 401 si la cabecera cookie está ausente', async () => {
    const { context } = createMockExecutionContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('debe rechazar la petición con 401 si la cookie no contiene sid', async () => {
    const { context } = createMockExecutionContext('otra_cookie=valor; theme=dark');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('debe rechazar la petición con 401 si la sesión es inválida, expirada o revocada', async () => {
    const { context } = createMockExecutionContext(`sid=${validRawToken}`);
    vi.mocked(mockSessionService.validateSession).mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('debe rechazar la petición con 401 si el usuario asociado a la sesión no existe', async () => {
    const { context } = createMockExecutionContext(`sid=${validRawToken}`);
    const validSession = Session.reconstitute({
      id: sampleSessionId,
      userId: sampleUserId,
      tokenHash: 'b'.repeat(64),
      expiresAt: new Date(Date.now() + 3600 * 1000),
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    });

    vi.mocked(mockSessionService.validateSession).mockResolvedValue(validSession);
    vi.mocked(mockUserRepository.findById).mockResolvedValue(null); // Usuario eliminado

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('debe rechazar la petición con 401 si el usuario está desactivado', async () => {
    const { context } = createMockExecutionContext(`sid=${validRawToken}`);
    const validSession = Session.reconstitute({
      id: sampleSessionId,
      userId: sampleUserId,
      tokenHash: 'b'.repeat(64),
      expiresAt: new Date(Date.now() + 3600 * 1000),
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    });

    const inactiveUser = User.reconstitute({
      id: sampleUserId,
      username: 'usuario_inactivo',
      passwordHash: 'hash',
      isActive: false, // Desactivado
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(mockSessionService.validateSession).mockResolvedValue(validSession);
    vi.mocked(mockUserRepository.findById).mockResolvedValue(inactiveUser);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('debe autenticar exitosamente, adjuntar request.user y retornar true ante sesión y usuario activos', async () => {
    const { context, request } = createMockExecutionContext(`sid=${validRawToken}`);
    const validSession = Session.reconstitute({
      id: sampleSessionId,
      userId: sampleUserId,
      tokenHash: 'b'.repeat(64),
      expiresAt: new Date(Date.now() + 3600 * 1000),
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    });

    const activeUser = User.reconstitute({
      id: sampleUserId,
      username: 'farmaceutico_activo',
      passwordHash: 'hash_secreto',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(mockSessionService.validateSession).mockResolvedValue(validSession);
    vi.mocked(mockUserRepository.findById).mockResolvedValue(activeUser);

    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);
    // Verificar que el contexto adjuntado sea estrictamente seguro (sin hashes ni tokens) e incluya roles y permisos
    expect(request.user).toEqual({
      id: sampleUserId,
      username: 'farmaceutico_activo',
      sessionId: sampleSessionId,
      roles: ['farmaceutico'],
      permissions: ['inventory:read'],
    });
    expect(request.user.passwordHash).toBeUndefined();
    expect(request.user.tokenHash).toBeUndefined();
    expect(request.user.rawToken).toBeUndefined();
  });
});

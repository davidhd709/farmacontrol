import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { UserRepositoryPort } from '../../src/modules/identity/application/ports/user.repository.port';
import { PasswordService } from '../../src/modules/identity/application/services/password.service';
import { User } from '../../src/modules/identity/domain/entities/user.entity';
import { Username } from '../../src/modules/identity/domain/value-objects/username.vo';
import { UserAlreadyExistsException } from '../../src/modules/identity/domain/exceptions/identity.exceptions';

describe('UserProvisioningService (Unit)', () => {
  let inMemoryUsers: User[];
  let mockUserRepository: UserRepositoryPort;
  let mockPasswordService: PasswordService;
  let provisioningService: UserProvisioningService;

  beforeEach(() => {
    inMemoryUsers = [];

    mockUserRepository = {
      findById: vi.fn(async (id: string) => {
        return inMemoryUsers.find((u) => u.id === id) ?? null;
      }),
      findByUsername: vi.fn(async (un: Username | string) => {
        const val = un instanceof Username ? un.value : un.trim().toLowerCase();
        return inMemoryUsers.find((u) => u.username.value === val) ?? null;
      }),
      create: vi.fn(async (user: User) => {
        const created = User.reconstitute({
          id: user.id || 'mock-generated-uuid-1234',
          username: user.username.value,
          passwordHash: user.passwordHash,
          isActive: user.isActive,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        inMemoryUsers.push(created);
        return created;
      }),
      update: vi.fn(async (user: User) => {
        const index = inMemoryUsers.findIndex((u) => u.id === user.id);
        if (index !== -1) {
          inMemoryUsers[index] = user;
        }
        return user;
      }),
      count: vi.fn(async () => inMemoryUsers.length),
    };

    mockPasswordService = {
      hashPassword: vi.fn(async (p: string) => `$argon2id$mockhash_${p}`),
      verifyPassword: vi.fn(async () => true),
      validatePasswordStrength: vi.fn(),
    } as unknown as PasswordService;

    provisioningService = new UserProvisioningService(
      mockUserRepository,
      mockPasswordService
    );
  });

  describe('createUser', () => {
    it('debe crear exitosamente un usuario nuevo con contraseña hasheada y username normalizado', async () => {
      const user = await provisioningService.createUser({
        username: '  Cajero_Principal  ',
        password: 'PasswordSegura#1',
      });

      expect(user).toBeDefined();
      expect(user.username.value).toBe('cajero_principal');
      expect(user.passwordHash).toBe('$argon2id$mockhash_PasswordSegura#1');
      expect(user.isActive).toBe(true);
      expect(mockPasswordService.hashPassword).toHaveBeenCalledWith(
        'PasswordSegura#1'
      );
    });

    it('debe rechazar la creación si el usuario ya existe', async () => {
      await provisioningService.createUser({
        username: 'cajero_existente',
        password: 'PasswordSegura#1',
      });

      await expect(
        provisioningService.createUser({
          username: 'CAJERO_EXISTENTE',
          password: 'OtraPassword#2',
        })
      ).rejects.toThrow(UserAlreadyExistsException);
    });
  });

  describe('provisionInitialUser', () => {
    it('debe crear el usuario inicial cuando la base de datos está vacía (count = 0)', async () => {
      const admin = await provisioningService.provisionInitialUser({
        username: 'admin_farmacia',
        password: 'AdminPassword#2026',
      });

      expect(admin).toBeDefined();
      expect(admin.username.value).toBe('admin_farmacia');
      expect(inMemoryUsers.length).toBe(1);
    });

    it('debe rechazar el aprovisionamiento inicial si ya existen usuarios registrados', async () => {
      // Crear un primer usuario
      await provisioningService.provisionInitialUser({
        username: 'primer_admin',
        password: 'AdminPassword#2026',
      });

      // Intento de aprovisionamiento secundario debe ser rechazado
      await expect(
        provisioningService.provisionInitialUser({
          username: 'segundo_admin',
          password: 'AdminPassword#2026',
        })
      ).rejects.toThrow(
        /ya existen usuarios registrados en la base de datos/
      );
    });
  });
});

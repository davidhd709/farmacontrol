import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma, cleanTestDatabase } from '@farmacia/database';
import { Argon2PasswordHasherAdapter } from '../../src/modules/identity/infrastructure/adapters/argon2-password-hasher.adapter';
import { PrismaUserRepository } from '../../src/modules/identity/infrastructure/adapters/prisma-user.repository';
import { PasswordService } from '../../src/modules/identity/application/services/password.service';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';

describe('UserProvisioningService (Integration with PostgreSQL & Argon2id)', () => {
  // Parámetros rápidos para tests de integración
  const hasher = new Argon2PasswordHasherAdapter({
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const passwordService = new PasswordService(hasher);
  const userRepository = new PrismaUserRepository(prisma);
  const provisioningService = new UserProvisioningService(
    userRepository,
    passwordService
  );

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

  it('debe aprovisionar el usuario inicial en PostgreSQL y verificar su hash con Argon2id', async () => {
    const admin = await provisioningService.provisionInitialUser({
      username: '  Admin_Farmacia.Principal  ',
      password: 'ClaveSuperSegura#2026',
    });

    expect(admin.id).toBeDefined();
    expect(admin.username.value).toBe('admin_farmacia.principal');
    expect(admin.passwordHash.startsWith('$argon2id$v=19$')).toBe(true);

    // Verificar que el hash almacenado en la DB valida exitosamente la contraseña
    const isValid = await passwordService.verifyPassword(
      'ClaveSuperSegura#2026',
      admin.passwordHash
    );
    expect(isValid).toBe(true);

    // Comprobar rechazo con contraseña incorrecta
    const isInvalid = await passwordService.verifyPassword(
      'PasswordErronea#999',
      admin.passwordHash
    );
    expect(isInvalid).toBe(false);
  });

  it('debe bloquear un segundo intento de aprovisionamiento inicial', async () => {
    await provisioningService.provisionInitialUser({
      username: 'primer_admin',
      password: 'ClaveInicial#123',
    });

    await expect(
      provisioningService.provisionInitialUser({
        username: 'segundo_admin',
        password: 'OtraClave#456',
      })
    ).rejects.toThrow(/ya existen usuarios registrados en la base de datos/);
  });

  it('debe aprovisionar el administrador inicial y asignarle el rol admin y permisos en user_roles', async () => {
    process.env.INITIAL_ADMIN_USERNAME = 'super_administrador';
    process.env.INITIAL_ADMIN_PASSWORD = 'PasswordSegura#2026';

    const { runProvisionInitialUser } = await import(
      '../../src/modules/identity/infrastructure/cli/provision-initial-user'
    );

    await runProvisionInitialUser();

    // 1. Verificar usuario en BD
    const user = await prisma.user.findUnique({
      where: { username: 'super_administrador' },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(user).not.toBeNull();
    expect(user?.userRoles).toHaveLength(1);
    expect(user?.userRoles[0].role.name).toBe('admin');
    expect(user?.userRoles[0].role.rolePermissions.length).toBeGreaterThan(30);

    delete process.env.INITIAL_ADMIN_USERNAME;
    delete process.env.INITIAL_ADMIN_PASSWORD;
  });
});


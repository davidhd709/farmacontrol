import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as argon2 from 'argon2';
import { cleanTestDatabase, prisma, seedRbac } from '@farmacia/database';
import { resetAdminPassword } from '../../src/modules/identity/infrastructure/cli/reset-admin-password';

describe('recuperación de contraseña de admin (PostgreSQL)', () => {
  beforeAll(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);
  }, 30_000);

  afterAll(async () => {
    await cleanTestDatabase();
    await prisma.$disconnect();
  }, 30_000);

  it('cambia el hash, revoca sesiones y crea auditoría', async () => {
    const oldHash = await argon2.hash('ClaveAnterior#2026');
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    const user = await prisma.user.create({
      data: {
        username: 'admin',
        passwordHash: oldHash,
        userRoles: { create: { roleId: role.id } },
        sessions: {
          create: {
            tokenHash: 'test-session-token-hash',
            expiresAt: new Date(Date.now() + 60_000),
          },
        },
      },
    });

    await resetAdminPassword('NuevaClave#2026', prisma);

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { sessions: true },
    });
    expect(await argon2.verify(updated.passwordHash, 'NuevaClave#2026')).toBe(true);
    expect(await argon2.verify(updated.passwordHash, 'ClaveAnterior#2026')).toBe(false);
    expect(updated.sessions).toHaveLength(1);
    expect(updated.sessions[0]?.revokedAt).not.toBeNull();
    expect(
      await prisma.auditEvent.count({
        where: { userId: user.id, action: 'auth:admin_password_reset_cli' },
      }),
    ).toBe(1);
  });
});

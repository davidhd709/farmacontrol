import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@farmacia/database';
import { resetAdminPassword } from '../../src/modules/identity/infrastructure/cli/reset-admin-password';

vi.mock(
  '../../src/modules/identity/infrastructure/adapters/argon2-password-hasher.adapter',
  () => ({
    Argon2PasswordHasherAdapter: class {
      async hash(): Promise<string> {
        return 'new-argon2-hash';
      }
    },
  }),
);

const admin = {
  id: '11111111-1111-1111-1111-111111111111',
  isActive: true,
  userRoles: [{ role: { name: 'admin', isActive: true } }],
};

function makeClient(user: typeof admin | null = admin) {
  const tx = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue({}),
    },
    session: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const client = {
    $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<void>) => callback(tx)),
  } as unknown as PrismaClient;
  return { client, tx };
}

describe('restablecimiento local de contraseña de admin', () => {
  it('actualiza la contraseña, revoca sesiones y audita en una transacción', async () => {
    const { client, tx } = makeClient();

    await resetAdminPassword('NuevaClave#2026', client);

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: admin.id },
      data: { passwordHash: 'new-argon2-hash' },
    });
    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: { userId: admin.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: admin.id,
        action: 'auth:admin_password_reset_cli',
      }),
    });
  });

  it('rechaza cuentas sin rol de administrador activo', async () => {
    const { client, tx } = makeClient({
      ...admin,
      userRoles: [{ role: { name: 'admin', isActive: false } }],
    });

    await expect(resetAdminPassword('NuevaClave#2026', client)).rejects.toThrow(
      'No existe una cuenta activa con ese usuario y rol de administrador.',
    );
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.session.updateMany).not.toHaveBeenCalled();
  });

  it('permite recuperar un administrador con otro nombre de usuario', async () => {
    const { client, tx } = makeClient();

    await resetAdminPassword('NuevaClave#2026', client, 'admin_farmacia');

    expect(tx.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: 'admin_farmacia' } }),
    );
  });

  it('rechaza contraseñas débiles antes de escribir en la base', async () => {
    const { client, tx } = makeClient();

    await expect(resetAdminPassword('corta', client)).rejects.toThrow();
    expect(tx.user.findUnique).not.toHaveBeenCalled();
  });
});

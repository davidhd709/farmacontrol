import { prisma, type PrismaClient } from '@farmacia/database';
import { SYSTEM_ROLES } from '@farmacia/contracts';
import { PasswordService } from '../../application/services/password.service';
import { Username } from '../../domain/value-objects/username.vo';
import { Argon2PasswordHasherAdapter } from '../adapters/argon2-password-hasher.adapter';

export async function resetAdminPassword(
  newPassword: string,
  client: PrismaClient = prisma,
  username = 'admin',
): Promise<void> {
  const normalizedUsername = Username.create(username).value;
  const passwordService = new PasswordService(new Argon2PasswordHasherAdapter());
  const passwordHash = await passwordService.hashPassword(newPassword);

  await client.$transaction(async (tx) => {
    const admin = await tx.user.findUnique({
      where: { username: normalizedUsername },
      select: {
        id: true,
        isActive: true,
        userRoles: { select: { role: { select: { name: true, isActive: true } } } },
      },
    });

    if (
      !admin?.isActive ||
      !admin.userRoles.some(({ role }) => role.name === SYSTEM_ROLES.ADMIN && role.isActive)
    ) {
      throw new Error('No existe una cuenta activa con ese usuario y rol de administrador.');
    }

    await tx.user.update({
      where: { id: admin.id },
      data: { passwordHash },
    });
    await tx.session.updateMany({
      where: { userId: admin.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        userId: admin.id,
        action: 'auth:admin_password_reset_cli',
        entity: 'User',
        entityId: admin.id,
        details: { method: 'local_cli' },
      },
    });
  });
}

async function main(): Promise<void> {
  const password = process.env.RESET_ADMIN_PASSWORD;
  const username = process.env.RESET_ADMIN_USERNAME || 'admin';
  delete process.env.RESET_ADMIN_PASSWORD;
  if (!password) {
    throw new Error('Define RESET_ADMIN_PASSWORD mediante una lectura oculta en la terminal.');
  }

  try {
    await resetAdminPassword(password, prisma, username);
    console.log(
      `Contraseña de ${username} restablecida. Las sesiones anteriores fueron revocadas.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'No se pudo restablecer la contraseña.');
    process.exitCode = 1;
  });
}

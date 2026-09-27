import { prisma, seedRbac } from '@farmacia/database';
import { SYSTEM_ROLES } from '@farmacia/contracts';
import { Argon2PasswordHasherAdapter } from '../adapters/argon2-password-hasher.adapter';
import { PrismaUserRepository } from '../adapters/prisma-user.repository';
import { PasswordService } from '../../application/services/password.service';
import { UserProvisioningService } from '../../application/services/user-provisioning.service';

/**
 * Script de infraestructura para el aprovisionamiento seguro del usuario administrador inicial.
 * REGLA ESTRICTA DE SEGURIDAD (AGENTS.md):
 * - Prohibido quemar credenciales por defecto (admin/admin123, etc.).
 * - Requiere variables de entorno INITIAL_ADMIN_USERNAME e INITIAL_ADMIN_PASSWORD.
 * - Rechaza la operación si ya existen usuarios registrados en la base de datos.
 */
export async function runProvisionInitialUser(): Promise<void> {
  const username = process.env.INITIAL_ADMIN_USERNAME;
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!username || !password) {
    console.error(
      '[Aprovisionamiento] ERROR: Debe configurar las variables de entorno INITIAL_ADMIN_USERNAME e INITIAL_ADMIN_PASSWORD para crear el usuario inicial.'
    );
    console.error(
      '[Aprovisionamiento] Ejemplo: INITIAL_ADMIN_USERNAME=admin_farmacia INITIAL_ADMIN_PASSWORD="MiPasswordSuperSegura#2026" pnpm db:seed:admin'
    );
    process.exit(1);
  }

  const passwordHasher = new Argon2PasswordHasherAdapter();
  const passwordService = new PasswordService(passwordHasher);
  const userRepository = new PrismaUserRepository();
  const provisioningService = new UserProvisioningService(
    userRepository,
    passwordService
  );

  try {
    console.log(
      `[Aprovisionamiento] Iniciando creación controlada de usuario inicial: "${username.trim().toLowerCase()}"...`
    );

    // 1. Asegurar la existencia de roles y permisos base
    await seedRbac(prisma);

    // 2. Aprovisionar usuario
    const user = await provisioningService.provisionInitialUser({
      username,
      password,
    });

    if (!user.id) {
      throw new Error('El usuario aprovisionado no tiene un ID válido.');
    }

    // 3. Asignar rol de administrador
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { name: SYSTEM_ROLES.ADMIN },
    });

    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: adminRole.id,
      },
    });

    console.log(
      `[Aprovisionamiento] ✅ Usuario inicial creado exitosamente con ID: ${user.id}`
    );
    console.log(
      `[Aprovisionamiento] ✅ Rol de Super Administrador (${adminRole.name}) asignado con éxito`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Aprovisionamiento] ❌ Falló la operación: ${message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar si es invocado directamente vía CLI
if (require.main === module) {
  runProvisionInitialUser();
}

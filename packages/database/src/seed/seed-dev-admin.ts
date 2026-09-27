import { prisma } from '../index';
import * as argon2 from 'argon2';

async function main() {
  const username = 'admin';
  const password = 'AdminPassword123!';

  console.log(`[Seed Admin] Generando hash Argon2id para '${username}'...`);
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const user = await prisma.user.upsert({
    where: { username },
    update: {
      passwordHash,
      isActive: true,
    },
    create: {
      username,
      passwordHash,
      isActive: true,
    },
  });

  console.log(`[Seed Admin] Usuario '${username}' listo (ID: ${user.id}).`);

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'admin' },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      roleId: adminRole.id,
    },
  });

  console.log(`[Seed Admin] Rol 'admin' asignado correctamente a '${username}'.`);
}

main()
  .catch((err) => {
    console.error('[Seed Admin] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

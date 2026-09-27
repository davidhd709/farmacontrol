import { prisma, seedRbac } from '../index';

async function main() {
  console.log('[Seed] Iniciando siembra de roles y permisos base del sistema...');
  const result = await seedRbac(prisma);
  console.log(`[Seed] Siembra completada con éxito:`);
  console.log(`  - Permisos asegurados: ${result.permissionsCount}`);
  console.log(`  - Roles asegurados: ${result.rolesCount}`);
  console.log(`  - Asignaciones Rol-Permiso aseguradas: ${result.rolePermissionsCount}`);
}

main()
  .catch((error) => {
    console.error('[Seed] Error ejecutando la siembra RBAC:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma, cleanTestDatabase, seedRbac, BASE_PERMISSIONS, BASE_ROLES } from '../src';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from '@farmacia/contracts';

describe('RBAC — Integridad de Persistencia y Modelos Relacionales (Integration)', () => {
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

  describe('Modelo Role', () => {
    it('debe crear un rol válido con valores por defecto e id UUID', async () => {
      const role = await prisma.role.create({
        data: {
          name: 'cajero_noche',
          description: 'Cajero asignado al turno nocturno',
        },
      });

      expect(role.id).toBeDefined();
      expect(role.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(role.name).toBe('cajero_noche');
      expect(role.description).toBe('Cajero asignado al turno nocturno');
      expect(role.isActive).toBe(true);
      expect(role.createdAt).toBeInstanceOf(Date);
      expect(role.updatedAt).toBeInstanceOf(Date);
    });

    it('debe rechazar la creación de roles con nombre duplicado exacto', async () => {
      await prisma.role.create({
        data: {
          name: 'farmaceutico',
          description: 'Primer registro',
        },
      });

      await expect(
        prisma.role.create({
          data: {
            name: 'farmaceutico',
            description: 'Segundo registro duplicado',
          },
        })
      ).rejects.toThrow();
    });

    it('debe rechazar la creación de roles con nombre duplicado insensible a mayúsculas (LOWER)', async () => {
      await prisma.role.create({
        data: {
          name: 'auditor',
        },
      });

      await expect(
        prisma.role.create({
          data: {
            name: 'AUDITOR',
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Modelo Permission', () => {
    it('debe crear un permiso válido con valores por defecto e id UUID', async () => {
      const permission = await prisma.permission.create({
        data: {
          name: 'custom:read',
          description: 'Permiso de lectura personalizado',
        },
      });

      expect(permission.id).toBeDefined();
      expect(permission.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(permission.name).toBe('custom:read');
      expect(permission.description).toBe('Permiso de lectura personalizado');
      expect(permission.createdAt).toBeInstanceOf(Date);
    });

    it('debe rechazar la creación de permisos con nombre duplicado exacto', async () => {
      await prisma.permission.create({
        data: {
          name: 'reportes:financieros',
          description: 'Permiso original',
        },
      });

      await expect(
        prisma.permission.create({
          data: {
            name: 'reportes:financieros',
            description: 'Permiso duplicado',
          },
        })
      ).rejects.toThrow();
    });

    it('debe rechazar la creación de permisos con nombre duplicado insensible a mayúsculas (LOWER)', async () => {
      await prisma.permission.create({
        data: {
          name: 'almacen:ajuste',
        },
      });

      await expect(
        prisma.permission.create({
          data: {
            name: 'ALMACEN:AJUSTE',
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Relación UserRole (N:M users <-> roles)', () => {
    it('debe asignar un rol a un usuario y permitir consulta bidireccional', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'usuario_rbac_test',
          passwordHash: 'dummyhash1234567890',
        },
      });

      const role = await prisma.role.create({
        data: {
          name: 'supervisor_test',
        },
      });

      const userRole = await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
        },
      });

      expect(userRole.userId).toBe(user.id);
      expect(userRole.roleId).toBe(role.id);
      expect(userRole.assignedAt).toBeInstanceOf(Date);

      // Consulta desde User
      const userWithRoles = await prisma.user.findUnique({
        where: { id: user.id },
        include: { userRoles: { include: { role: true } } },
      });
      expect(userWithRoles?.userRoles).toHaveLength(1);
      expect(userWithRoles?.userRoles[0].role.name).toBe('supervisor_test');

      // Consulta desde Role
      const roleWithUsers = await prisma.role.findUnique({
        where: { id: role.id },
        include: { userRoles: { include: { user: true } } },
      });
      expect(roleWithUsers?.userRoles).toHaveLength(1);
      expect(roleWithUsers?.userRoles[0].user.username).toBe('usuario_rbac_test');
    });

    it('debe rechazar la asignación duplicada del mismo rol al mismo usuario (clave primaria compuesta)', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'usuario_duplicado_test',
          passwordHash: 'dummyhash1234567890',
        },
      });

      const role = await prisma.role.create({
        data: {
          name: 'cajero_test',
        },
      });

      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
        },
      });

      await expect(
        prisma.userRole.create({
          data: {
            userId: user.id,
            roleId: role.id,
          },
        })
      ).rejects.toThrow();
    });

    it('debe eliminar en cascada la asignación cuando se elimina el usuario, preservando el rol', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'usuario_a_eliminar',
          passwordHash: 'dummyhash1234567890',
        },
      });

      const role = await prisma.role.create({
        data: {
          name: 'rol_preservado',
        },
      });

      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
        },
      });

      // Eliminar usuario
      await prisma.user.delete({ where: { id: user.id } });

      // user_roles debe quedar vacío para ese usuario
      const assignments = await prisma.userRole.findMany({
        where: { userId: user.id },
      });
      expect(assignments).toHaveLength(0);

      // El rol debe seguir existiendo intacto
      const roleDb = await prisma.role.findUnique({ where: { id: role.id } });
      expect(roleDb).not.toBeNull();
    });

    it('debe eliminar en cascada la asignación cuando se elimina el rol, preservando el usuario', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'usuario_preservado',
          passwordHash: 'dummyhash1234567890',
        },
      });

      const role = await prisma.role.create({
        data: {
          name: 'rol_a_eliminar',
        },
      });

      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
        },
      });

      // Eliminar rol
      await prisma.role.delete({ where: { id: role.id } });

      // user_roles debe quedar vacío para ese rol
      const assignments = await prisma.userRole.findMany({
        where: { roleId: role.id },
      });
      expect(assignments).toHaveLength(0);

      // El usuario debe seguir existiendo intacto
      const userDb = await prisma.user.findUnique({ where: { id: user.id } });
      expect(userDb).not.toBeNull();
    });
  });

  describe('Relación RolePermission (N:M roles <-> permissions)', () => {
    it('debe asignar permisos a un rol y permitir consulta bidireccional', async () => {
      const role = await prisma.role.create({
        data: { name: 'operador_ventas' },
      });

      const perm = await prisma.permission.create({
        data: { name: 'sales:quick_create' },
      });

      const rolePerm = await prisma.rolePermission.create({
        data: {
          roleId: role.id,
          permissionId: perm.id,
        },
      });

      expect(rolePerm.roleId).toBe(role.id);
      expect(rolePerm.permissionId).toBe(perm.id);
      expect(rolePerm.assignedAt).toBeInstanceOf(Date);

      // Consulta de permisos desde Role
      const roleWithPerms = await prisma.role.findUnique({
        where: { id: role.id },
        include: { rolePermissions: { include: { permission: true } } },
      });
      expect(roleWithPerms?.rolePermissions).toHaveLength(1);
      expect(roleWithPerms?.rolePermissions[0].permission.name).toBe('sales:quick_create');
    });

    it('debe rechazar la asignación duplicada del mismo permiso al mismo rol (clave primaria compuesta)', async () => {
      const role = await prisma.role.create({
        data: { name: 'rol_perm_duplicado' },
      });

      const perm = await prisma.permission.create({
        data: { name: 'permiso_duplicado' },
      });

      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: perm.id },
      });

      await expect(
        prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: perm.id },
        })
      ).rejects.toThrow();
    });

    it('debe eliminar en cascada la asignación cuando se elimina el rol, preservando el permiso', async () => {
      const role = await prisma.role.create({
        data: { name: 'rol_con_perm_a_eliminar' },
      });

      const perm = await prisma.permission.create({
        data: { name: 'perm_preservado' },
      });

      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: perm.id },
      });

      await prisma.role.delete({ where: { id: role.id } });

      const assignments = await prisma.rolePermission.findMany({
        where: { roleId: role.id },
      });
      expect(assignments).toHaveLength(0);

      const permDb = await prisma.permission.findUnique({ where: { id: perm.id } });
      expect(permDb).not.toBeNull();
    });
  });

  describe('Siembra Idempotente seedRbac()', () => {
    it('debe sembrar todos los roles y permisos base definidos en contratos', async () => {
      const result = await seedRbac(prisma);

      expect(result.permissionsCount).toBe(BASE_PERMISSIONS.length);
      expect(result.rolesCount).toBe(BASE_ROLES.length);
      expect(result.rolePermissionsCount).toBeGreaterThan(0);

      // Verificar que todos los roles existen en PostgreSQL
      const dbRoles = await prisma.role.findMany();
      expect(dbRoles).toHaveLength(BASE_ROLES.length);

      const roleNames = dbRoles.map((r) => r.name);
      expect(roleNames).toContain(SYSTEM_ROLES.ADMIN);
      expect(roleNames).toContain(SYSTEM_ROLES.SUPERVISOR);
      expect(roleNames).toContain(SYSTEM_ROLES.CAJERO);
      expect(roleNames).toContain(SYSTEM_ROLES.INVENTARIO);
      expect(roleNames).toContain(SYSTEM_ROLES.COMPRAS);
      expect(roleNames).toContain(SYSTEM_ROLES.CARTERA);

      // Verificar que todos los permisos existen en PostgreSQL
      const dbPermissions = await prisma.permission.findMany();
      expect(dbPermissions).toHaveLength(BASE_PERMISSIONS.length);

      // Verificar que el rol 'admin' tiene TODOS los permisos asignados
      const adminRole = await prisma.role.findUnique({
        where: { name: SYSTEM_ROLES.ADMIN },
        include: { rolePermissions: { include: { permission: true } } },
      });

      expect(adminRole).not.toBeNull();
      expect(adminRole?.rolePermissions).toHaveLength(BASE_PERMISSIONS.length);
    });

    it('debe ser estrictamente idempotente: ejecutar seedRbac() múltiples veces produce el mismo resultado sin duplicaciones', async () => {
      const firstRun = await seedRbac(prisma);
      const secondRun = await seedRbac(prisma);

      expect(secondRun.permissionsCount).toBe(firstRun.permissionsCount);
      expect(secondRun.rolesCount).toBe(firstRun.rolesCount);

      const countRoles = await prisma.role.count();
      const countPermissions = await prisma.permission.count();
      const countRolePermissions = await prisma.rolePermission.count();

      expect(countRoles).toBe(BASE_ROLES.length);
      expect(countPermissions).toBe(BASE_PERMISSIONS.length);
      expect(countRolePermissions).toBe(firstRun.rolePermissionsCount);
    });
  });
});

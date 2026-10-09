import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../client';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from '@farmacia/contracts';

export interface PermissionDefinition {
  name: string;
  description: string;
}

export interface RoleDefinition {
  name: string;
  description: string;
  permissions: string[];
}

export const BASE_PERMISSIONS: PermissionDefinition[] = [
  // Usuarios y roles
  { name: SYSTEM_PERMISSIONS.USERS_READ, description: 'Consultar usuarios del sistema' },
  { name: SYSTEM_PERMISSIONS.USERS_CREATE, description: 'Crear nuevos usuarios en el sistema' },
  { name: SYSTEM_PERMISSIONS.USERS_UPDATE, description: 'Actualizar usuarios existentes' },
  { name: SYSTEM_PERMISSIONS.USERS_DELETE, description: 'Desactivar o eliminar usuarios' },
  { name: SYSTEM_PERMISSIONS.ROLES_READ, description: 'Consultar roles y permisos del sistema' },
  { name: SYSTEM_PERMISSIONS.ROLES_ASSIGN, description: 'Asignar roles a usuarios' },

  // Catálogo
  { name: SYSTEM_PERMISSIONS.CATEGORIES_READ, description: 'Consultar categorías de productos' },
  { name: SYSTEM_PERMISSIONS.CATEGORIES_MANAGE, description: 'Crear, editar e inactivar categorías' },
  { name: SYSTEM_PERMISSIONS.PRODUCTS_READ, description: 'Consultar catálogo de productos y presentaciones' },
  { name: SYSTEM_PERMISSIONS.PRODUCTS_MANAGE, description: 'Crear y editar productos y presentaciones' },

  // Inventario y lotes
  { name: SYSTEM_PERMISSIONS.INVENTORY_READ, description: 'Consultar existencias de inventario' },
  { name: SYSTEM_PERMISSIONS.INVENTORY_ADJUST, description: 'Registrar ajustes de inventario autorizados' },
  { name: SYSTEM_PERMISSIONS.INVENTORY_MOVEMENTS_READ, description: 'Consultar trazabilidad de movimientos de inventario' },
  { name: SYSTEM_PERMISSIONS.INVENTORY_LOTS_MANAGE, description: 'Gestionar lotes, estados y fechas de vencimiento' },

  // Ventas y POS
  { name: SYSTEM_PERMISSIONS.SALES_READ, description: 'Consultar historial y detalle de ventas' },
  { name: SYSTEM_PERMISSIONS.SALES_CREATE, description: 'Registrar ventas en punto de venta con asignación FEFO' },
  { name: SYSTEM_PERMISSIONS.SALES_CANCEL, description: 'Anular ventas y revertir lotes asignados' },
  { name: SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE, description: 'Emitir notas crédito por devoluciones de ventas' },

  // Caja
  { name: SYSTEM_PERMISSIONS.CASH_READ, description: 'Consultar estado y saldo de caja' },
  { name: SYSTEM_PERMISSIONS.CASH_OPEN, description: 'Realizar apertura de caja' },
  { name: SYSTEM_PERMISSIONS.CASH_CLOSE, description: 'Realizar cierre y arqueo de caja' },
  { name: SYSTEM_PERMISSIONS.CASH_MOVEMENTS, description: 'Registrar entradas y salidas de efectivo' },

  // Compras
  { name: SYSTEM_PERMISSIONS.PURCHASES_READ, description: 'Consultar historial de compras' },
  { name: SYSTEM_PERMISSIONS.PURCHASES_CREATE, description: 'Crear órdenes y compras a proveedores' },
  { name: SYSTEM_PERMISSIONS.PURCHASES_RECEIVE, description: 'Recepcionar compras y registrar lotes' },

  // Clientes y proveedores
  { name: SYSTEM_PERMISSIONS.CUSTOMERS_READ, description: 'Consultar directorio de clientes' },
  { name: SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE, description: 'Registrar y editar clientes' },
  { name: SYSTEM_PERMISSIONS.SUPPLIERS_READ, description: 'Consultar directorio de proveedores' },
  { name: SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE, description: 'Registrar y editar proveedores' },

  // Terceros unificados
  { name: SYSTEM_PERMISSIONS.THIRD_PARTIES_READ, description: 'Consultar directorio unificado de terceros (clientes, proveedores, empleados)' },
  { name: SYSTEM_PERMISSIONS.THIRD_PARTIES_MANAGE, description: 'Crear, editar, activar e inactivar terceros unificados' },

  // Cartera
  { name: SYSTEM_PERMISSIONS.RECEIVABLES_READ, description: 'Consultar cuentas por cobrar' },
  { name: SYSTEM_PERMISSIONS.RECEIVABLES_MANAGE, description: 'Registrar abonos y gestionar cartera de clientes' },
  { name: SYSTEM_PERMISSIONS.PAYABLES_READ, description: 'Consultar cuentas por pagar a proveedores' },
  { name: SYSTEM_PERMISSIONS.PAYABLES_MANAGE, description: 'Registrar pagos y gestionar cuentas por pagar' },

  // Reportes y auditoría
  { name: SYSTEM_PERMISSIONS.REPORTS_READ, description: 'Generar reportes operativos y financieros' },
  { name: SYSTEM_PERMISSIONS.AUDIT_READ, description: 'Consultar logs inmutables de auditoría' },

  // Alertas y procesos en segundo plano
  { name: SYSTEM_PERMISSIONS.ALERTS_READ, description: 'Consultar alertas operativas y de vencimiento' },
  { name: SYSTEM_PERMISSIONS.ALERTS_MANAGE, description: 'Gestionar y disparar procesos de evaluación de alertas' },

  // Resiliencia y administración
  { name: SYSTEM_PERMISSIONS.BACKUPS_MANAGE, description: 'Gestionar y ejecutar copias de seguridad' },
  { name: SYSTEM_PERMISSIONS.ACCOUNTING_READ, description: 'Consultar plan de cuentas y propósitos contables' },
  { name: SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE, description: 'Administrar cuentas, mapeos e importaciones contables' },

  // Tesorería y bancos
  { name: SYSTEM_PERMISSIONS.TREASURY_ACCOUNTS_SELECT, description: 'Seleccionar cuenta activa en cobros y pagos sin consultar saldos' },
  { name: SYSTEM_PERMISSIONS.TREASURY_READ, description: 'Consultar cuentas bancarias y movimientos de tesorería' },
  { name: SYSTEM_PERMISSIONS.TREASURY_MANAGE, description: 'Gestionar cuentas bancarias y registrar movimientos de tesorería' },

  // Gastos
  { name: SYSTEM_PERMISSIONS.EXPENSES_READ, description: 'Consultar categorías y registros de gastos operativos' },
  { name: SYSTEM_PERMISSIONS.EXPENSES_MANAGE, description: 'Registrar, pagar y anular gastos y categorías de gasto' },
];

export const BASE_ROLES: RoleDefinition[] = [
  {
    name: SYSTEM_ROLES.ADMIN,
    description: 'Administrador general del sistema con acceso completo a todos los módulos y operaciones.',
    permissions: BASE_PERMISSIONS.map((p) => p.name),
  },
  {
    name: SYSTEM_ROLES.SUPERVISOR,
    description: 'Supervisor operativo de farmacia con supervisión de ventas, caja, compras, inventario y reportes.',
    permissions: [
      SYSTEM_PERMISSIONS.USERS_READ,
      SYSTEM_PERMISSIONS.ROLES_READ,
      SYSTEM_PERMISSIONS.CATEGORIES_READ,
      SYSTEM_PERMISSIONS.CATEGORIES_MANAGE,
      SYSTEM_PERMISSIONS.PRODUCTS_READ,
      SYSTEM_PERMISSIONS.PRODUCTS_MANAGE,
      SYSTEM_PERMISSIONS.INVENTORY_READ,
      SYSTEM_PERMISSIONS.INVENTORY_ADJUST,
      SYSTEM_PERMISSIONS.INVENTORY_MOVEMENTS_READ,
      SYSTEM_PERMISSIONS.INVENTORY_LOTS_MANAGE,
      SYSTEM_PERMISSIONS.SALES_READ,
      SYSTEM_PERMISSIONS.SALES_CREATE,
      SYSTEM_PERMISSIONS.SALES_CANCEL,
      SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE,
      SYSTEM_PERMISSIONS.CASH_READ,
      SYSTEM_PERMISSIONS.CASH_OPEN,
      SYSTEM_PERMISSIONS.CASH_CLOSE,
      SYSTEM_PERMISSIONS.CASH_MOVEMENTS,
      SYSTEM_PERMISSIONS.PURCHASES_READ,
      SYSTEM_PERMISSIONS.PURCHASES_CREATE,
      SYSTEM_PERMISSIONS.PURCHASES_RECEIVE,
      SYSTEM_PERMISSIONS.CUSTOMERS_READ,
      SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE,
      SYSTEM_PERMISSIONS.SUPPLIERS_READ,
      SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE,
      SYSTEM_PERMISSIONS.THIRD_PARTIES_READ,
      SYSTEM_PERMISSIONS.THIRD_PARTIES_MANAGE,
      SYSTEM_PERMISSIONS.RECEIVABLES_READ,
      SYSTEM_PERMISSIONS.RECEIVABLES_MANAGE,
      SYSTEM_PERMISSIONS.PAYABLES_READ,
      SYSTEM_PERMISSIONS.PAYABLES_MANAGE,
      SYSTEM_PERMISSIONS.ALERTS_READ,
      SYSTEM_PERMISSIONS.ALERTS_MANAGE,
      SYSTEM_PERMISSIONS.REPORTS_READ,
      SYSTEM_PERMISSIONS.AUDIT_READ,
      SYSTEM_PERMISSIONS.TREASURY_READ,
      SYSTEM_PERMISSIONS.TREASURY_ACCOUNTS_SELECT,
      SYSTEM_PERMISSIONS.EXPENSES_READ,
      SYSTEM_PERMISSIONS.EXPENSES_MANAGE,
    ],
  },
  {
    name: SYSTEM_ROLES.CAJERO,
    description: 'Operador de caja y punto de venta para dispensación, facturación y arqueo de caja.',
    permissions: [
      SYSTEM_PERMISSIONS.SALES_READ,
      SYSTEM_PERMISSIONS.SALES_CREATE,
      SYSTEM_PERMISSIONS.PRODUCTS_READ,
      SYSTEM_PERMISSIONS.CATEGORIES_READ,
      SYSTEM_PERMISSIONS.INVENTORY_READ,
      SYSTEM_PERMISSIONS.CASH_READ,
      SYSTEM_PERMISSIONS.CASH_OPEN,
      SYSTEM_PERMISSIONS.CASH_CLOSE,
      SYSTEM_PERMISSIONS.CASH_MOVEMENTS,
      SYSTEM_PERMISSIONS.CUSTOMERS_READ,
      SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE,
      SYSTEM_PERMISSIONS.TREASURY_ACCOUNTS_SELECT,
    ],
  },
  {
    name: SYSTEM_ROLES.INVENTARIO,
    description: 'Responsable de recepción de compras, control de stock, lotes, vencimientos y ajustes autorizados.',
    permissions: [
      SYSTEM_PERMISSIONS.PRODUCTS_READ,
      SYSTEM_PERMISSIONS.CATEGORIES_READ,
      SYSTEM_PERMISSIONS.INVENTORY_READ,
      SYSTEM_PERMISSIONS.INVENTORY_ADJUST,
      SYSTEM_PERMISSIONS.INVENTORY_MOVEMENTS_READ,
      SYSTEM_PERMISSIONS.INVENTORY_LOTS_MANAGE,
      SYSTEM_PERMISSIONS.ALERTS_READ,
      SYSTEM_PERMISSIONS.ALERTS_MANAGE,
      SYSTEM_PERMISSIONS.PURCHASES_READ,
      SYSTEM_PERMISSIONS.PURCHASES_RECEIVE,
      SYSTEM_PERMISSIONS.SUPPLIERS_READ,
    ],
  },
  {
    name: SYSTEM_ROLES.COMPRAS,
    description: 'Responsable de relación con proveedores, órdenes de compra y control de cuentas por pagar.',
    permissions: [
      SYSTEM_PERMISSIONS.PURCHASES_READ,
      SYSTEM_PERMISSIONS.PURCHASES_CREATE,
      SYSTEM_PERMISSIONS.PURCHASES_RECEIVE,
      SYSTEM_PERMISSIONS.SUPPLIERS_READ,
      SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE,
      SYSTEM_PERMISSIONS.PAYABLES_READ,
      SYSTEM_PERMISSIONS.PAYABLES_MANAGE,
      SYSTEM_PERMISSIONS.TREASURY_ACCOUNTS_SELECT,
      SYSTEM_PERMISSIONS.PRODUCTS_READ,
      SYSTEM_PERMISSIONS.CATEGORIES_READ,
      SYSTEM_PERMISSIONS.INVENTORY_READ,
    ],
  },
  {
    name: SYSTEM_ROLES.CARTERA,
    description: 'Responsable de control de crédito a clientes, cuentas por cobrar y registro de abonos.',
    permissions: [
      SYSTEM_PERMISSIONS.CUSTOMERS_READ,
      SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE,
      SYSTEM_PERMISSIONS.RECEIVABLES_READ,
      SYSTEM_PERMISSIONS.RECEIVABLES_MANAGE,
      SYSTEM_PERMISSIONS.TREASURY_ACCOUNTS_SELECT,
      SYSTEM_PERMISSIONS.SALES_READ,
    ],
  },
];

export interface SeedRbacResult {
  permissionsCount: number;
  rolesCount: number;
  rolePermissionsCount: number;
}

/**
 * Aplica de forma 100% idempotente la siembra de permisos y roles base del sistema.
 * Seguro para ejecutar en despliegues, pruebas automatizadas y arranques de aplicación.
 */
export async function seedRbac(client: PrismaClient = defaultPrisma): Promise<SeedRbacResult> {
  // 1. Sembrar Permisos
  for (const perm of BASE_PERMISSIONS) {
    await client.permission.upsert({
      where: { name: perm.name },
      create: {
        name: perm.name,
        description: perm.description,
      },
      update: {
        description: perm.description,
      },
    });
  }

  // 2. Sembrar Roles y Mapear Permisos
  let rolePermissionsCreatedOrUpdated = 0;
  for (const roleDef of BASE_ROLES) {
    const role = await client.role.upsert({
      where: { name: roleDef.name },
      create: {
        name: roleDef.name,
        description: roleDef.description,
        isActive: true,
      },
      update: {
        description: roleDef.description,
      },
    });

    // Mapear permisos asociados a cada rol
    for (const permissionName of roleDef.permissions) {
      const permission = await client.permission.findUnique({
        where: { name: permissionName },
      });

      if (permission) {
        await client.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          create: {
            roleId: role.id,
            permissionId: permission.id,
          },
          update: {},
        });
        rolePermissionsCreatedOrUpdated++;
      }
    }
  }

  return {
    permissionsCount: BASE_PERMISSIONS.length,
    rolesCount: BASE_ROLES.length,
    rolePermissionsCount: rolePermissionsCreatedOrUpdated,
  };
}

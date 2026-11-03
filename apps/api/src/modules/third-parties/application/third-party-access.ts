import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';

export type ScopedThirdPartyRole = 'CUSTOMER' | 'SUPPLIER';

/**
 * Qué terceros puede ver o modificar un usuario (correcciones del cliente, 2026-11-03).
 * `third_parties:read|manage` dan acceso a todos los tipos. Sin ellos, `customers:manage` lo
 * limita a clientes (cartera) y `suppliers:manage` a proveedores (compras). Se aplica en el
 * servicio: cambiar el filtro en la petición no amplía el alcance.
 */
export interface ThirdPartyAccess {
  all: boolean;
  roles: ScopedThirdPartyRole[];
  /** Desactivar o reactivar (incluido `isActive` en una edición): solo `third_parties:deactivate`. */
  canChangeActive: boolean;
}

export function thirdPartyAccess(
  permissions: readonly string[],
  mode: 'read' | 'write',
): ThirdPartyAccess {
  const has = (permission: string) => permissions.includes(permission);
  const all = has(
    mode === 'read' ? SYSTEM_PERMISSIONS.THIRD_PARTIES_READ : SYSTEM_PERMISSIONS.THIRD_PARTIES_MANAGE,
  );
  const roles: ScopedThirdPartyRole[] = [];
  if (has(SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE)) roles.push('CUSTOMER');
  if (has(SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE)) roles.push('SUPPLIER');
  return { all, roles, canChangeActive: has(SYSTEM_PERMISSIONS.THIRD_PARTIES_DEACTIVATE) };
}

/** Un tercero está al alcance si tiene alguno de los tipos permitidos. */
export function canReachThirdParty(
  access: ThirdPartyAccess,
  thirdParty: { isCustomer: boolean; isSupplier: boolean },
): boolean {
  if (access.all) return true;
  return (
    (access.roles.includes('CUSTOMER') && thirdParty.isCustomer) ||
    (access.roles.includes('SUPPLIER') && thirdParty.isSupplier)
  );
}

type RoleFlags = { isCustomer?: boolean; isSupplier?: boolean; isEmployee?: boolean; isOther?: boolean };

/**
 * Tipos que un usuario con alcance limitado no puede asignar ni quitar. Devuelve el mensaje del
 * rechazo, o null si los tipos pedidos están dentro de su alcance. `current` es el tercero antes
 * de la edición (ausente al crear).
 */
export function roleChangeOutsideScope(
  access: ThirdPartyAccess,
  requested: RoleFlags,
  current?: Required<RoleFlags>,
): string | null {
  if (access.all) return null;
  const before = current ?? { isCustomer: false, isSupplier: false, isEmployee: false, isOther: false };
  const after = {
    isCustomer: requested.isCustomer ?? before.isCustomer,
    isSupplier: requested.isSupplier ?? before.isSupplier,
    isEmployee: requested.isEmployee ?? before.isEmployee,
    isOther: requested.isOther ?? before.isOther,
  };
  const own = { isCustomer: access.roles.includes('CUSTOMER'), isSupplier: access.roles.includes('SUPPLIER') };
  // Debe conservar (o recibir, al crear) al menos uno de sus tipos
  if (!((own.isCustomer && after.isCustomer) || (own.isSupplier && after.isSupplier))) {
    return own.isCustomer && !own.isSupplier
      ? 'Solo puede registrar y editar clientes.'
      : own.isSupplier && !own.isCustomer
        ? 'Solo puede registrar y editar proveedores.'
        : 'Solo puede registrar y editar clientes o proveedores.';
  }
  // Los tipos fuera de su alcance quedan como estaban
  const outside: Array<keyof RoleFlags> = ['isEmployee', 'isOther'];
  if (!own.isCustomer) outside.push('isCustomer');
  if (!own.isSupplier) outside.push('isSupplier');
  const changed = outside.filter((flag) => after[flag] !== before[flag]);
  return changed.length ? 'No puede cambiar tipos de tercero fuera de su alcance.' : null;
}

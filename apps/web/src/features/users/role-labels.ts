import { SYSTEM_ROLES } from '@farmacia/contracts';

/** Nombre visible de cada rol del sistema; un rol creado aparte se muestra con su código */
const ROLE_LABELS: Record<string, string> = {
  [SYSTEM_ROLES.ADMIN]: 'Administrador',
  [SYSTEM_ROLES.SUPERVISOR]: 'Supervisor',
  [SYSTEM_ROLES.CAJERO]: 'Cajero',
  [SYSTEM_ROLES.INVENTARIO]: 'Inventario',
  [SYSTEM_ROLES.COMPRAS]: 'Compras',
  [SYSTEM_ROLES.CARTERA]: 'Cartera',
  [SYSTEM_ROLES.TESORERIA]: 'Tesorería',
};

export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;

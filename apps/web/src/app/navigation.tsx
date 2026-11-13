import type React from 'react';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import StorefrontIcon from '@mui/icons-material/Storefront';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import MedicationIcon from '@mui/icons-material/Medication';
import CategoryIcon from '@mui/icons-material/Category';
import StraightenIcon from '@mui/icons-material/Straighten';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PaymentsIcon from '@mui/icons-material/Payments';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import RequestPageIcon from '@mui/icons-material/RequestPage';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import RuleIcon from '@mui/icons-material/Rule';
import BalanceIcon from '@mui/icons-material/Balance';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SummarizeIcon from '@mui/icons-material/Summarize';
import DateRangeIcon from '@mui/icons-material/DateRange';
import CalculateIcon from '@mui/icons-material/Calculate';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SettingsIcon from '@mui/icons-material/Settings';
import BusinessIcon from '@mui/icons-material/Business';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import HistoryIcon from '@mui/icons-material/History';
import ChecklistIcon from '@mui/icons-material/Checklist';
import GavelIcon from '@mui/icons-material/Gavel';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import TuneIcon from '@mui/icons-material/Tune';
import UploadFileIcon from '@mui/icons-material/UploadFile';

export interface MenuItemConfig {
  title: string;
  path: string;
  icon: React.ReactNode;
  /** Permiso requerido; con una lista basta cualquiera de ellos. */
  permission: string | string[];
}

/** Permisos que habilitan una entrada (cualquiera de ellos). */
export function entryPermissions(entry: { permission: string | string[] }): string[] {
  return Array.isArray(entry.permission) ? entry.permission : [entry.permission];
}

// Cartera ve el directorio filtrado a clientes y compras a proveedores (2026-11-03)
const THIRD_PARTY_DIRECTORY = [
  SYSTEM_PERMISSIONS.THIRD_PARTIES_READ,
  SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE,
  SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE,
];

export interface MenuGroupConfig {
  /** Identificador estable: guarda qué grupos dejó abiertos el usuario */
  id: string;
  category: string;
  icon: React.ReactNode;
  items: MenuItemConfig[];
}

/**
 * Menú agrupado por tarea (rediseño 2026-11-12, fase 1). Cada entrada conserva la ruta y el
 * permiso que ya tenía: el menú y la guarda de rutas (`RequirePermission`) leen esta misma
 * tabla, y el API valida cada endpoint por su cuenta.
 */
export const menuGroups: MenuGroupConfig[] = [
  {
    id: 'ventas',
    category: 'Ventas',
    icon: <StorefrontIcon fontSize="small" />,
    items: [
      {
        title: 'Punto de venta',
        path: '/pos',
        icon: <PointOfSaleIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.SALES_CREATE,
      },
      {
        title: 'Historial de ventas',
        path: '/sales',
        icon: <ReceiptLongIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.SALES_READ,
      },
      {
        title: 'Notas crédito',
        path: '/credit-notes',
        icon: <AssignmentReturnIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.SALES_READ,
      },
    ],
  },
  {
    id: 'compras',
    category: 'Compras',
    icon: <LocalShippingIcon fontSize="small" />,
    items: [
      {
        title: 'Recepción de compras',
        path: '/purchases/receive',
        icon: <LocalShippingIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.PURCHASES_RECEIVE,
      },
      {
        title: 'Historial y devoluciones',
        path: '/purchases',
        icon: <ShoppingBagIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.PURCHASES_READ,
      },
    ],
  },
  {
    id: 'inventario',
    category: 'Inventario',
    icon: <Inventory2Icon fontSize="small" />,
    items: [
      {
        title: 'Stock y lotes',
        path: '/inventory/lots',
        icon: <Inventory2Icon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.INVENTORY_READ,
      },
      {
        title: 'Kardex',
        path: '/inventory/movements',
        icon: <SwapVertIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.INVENTORY_READ,
      },
      {
        title: 'Vencimientos',
        path: '/alerts',
        icon: <EventBusyIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.INVENTORY_READ,
      },
      {
        title: 'Productos',
        path: '/products',
        icon: <MedicationIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.PRODUCTS_READ,
      },
      {
        title: 'Categorías',
        path: '/categories',
        icon: <CategoryIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.CATEGORIES_READ,
      },
      {
        title: 'Unidades de medida',
        path: '/units-of-measure',
        icon: <StraightenIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.CATEGORIES_READ,
      },
    ],
  },
  {
    id: 'terceros',
    category: 'Terceros',
    icon: <PeopleAltIcon fontSize="small" />,
    items: [
      {
        title: 'Clientes, proveedores y otros',
        path: '/third-parties',
        icon: <PeopleAltIcon fontSize="small" />,
        permission: THIRD_PARTY_DIRECTORY,
      },
    ],
  },
  {
    id: 'tesoreria',
    category: 'Tesorería',
    icon: <AccountBalanceWalletIcon fontSize="small" />,
    items: [
      {
        title: 'Caja',
        path: '/cash',
        icon: <AccountBalanceWalletIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.CASH_READ,
      },
      {
        title: 'Bancos',
        path: '/treasury/bank-accounts',
        icon: <AccountBalanceIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.TREASURY_READ,
      },
      {
        title: 'Recibos de caja',
        path: '/treasury/receipts',
        icon: <ReceiptIcon fontSize="small" />,
        // Tesorería los consulta y registra sin el permiso contable (2026-11-03)
        permission: [SYSTEM_PERMISSIONS.ACCOUNTING_READ, SYSTEM_PERMISSIONS.CASH_RECEIPTS_MANUAL],
      },
      {
        title: 'Comprobantes de egreso',
        path: '/treasury/disbursements',
        icon: <PaymentsIcon fontSize="small" />,
        permission: [SYSTEM_PERMISSIONS.ACCOUNTING_READ, SYSTEM_PERMISSIONS.DISBURSEMENTS_CREATE],
      },
      {
        title: 'Cuentas por cobrar',
        path: '/receivables',
        icon: <MonetizationOnIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.RECEIVABLES_READ,
      },
      {
        title: 'Cuentas por pagar',
        path: '/payables',
        icon: <RequestPageIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.PAYABLES_READ,
      },
    ],
  },
  {
    id: 'contabilidad',
    category: 'Contabilidad',
    icon: <MenuBookIcon fontSize="small" />,
    items: [
      {
        title: 'Gastos',
        path: '/expenses',
        icon: <RequestQuoteIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.EXPENSES_READ,
      },
      {
        title: 'Libro diario',
        path: '/accounting/journal',
        icon: <MenuBookIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Libros oficiales',
        path: '/accounting/books',
        icon: <LibraryBooksIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Conciliación',
        path: '/accounting/reconciliation',
        icon: <CompareArrowsIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Auditoría contable',
        path: '/accounting/audit',
        icon: <RuleIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Balance de comprobación',
        path: '/accounting/trial-balance',
        icon: <BalanceIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Estado de resultados',
        path: '/accounting/income-statement',
        icon: <TrendingUpIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Balance general',
        path: '/accounting/balance-sheet',
        icon: <SummarizeIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Períodos y cierre',
        path: '/accounting/periods',
        icon: <DateRangeIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Borradores tributarios',
        path: '/tax-reports',
        icon: <CalculateIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
    ],
  },
  {
    id: 'reportes',
    category: 'Reportes',
    icon: <AssessmentIcon fontSize="small" />,
    items: [
      {
        title: 'Reportes y exportación',
        path: '/reports',
        icon: <AssessmentIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.REPORTS_READ,
      },
    ],
  },
  {
    id: 'configuracion',
    category: 'Configuración',
    icon: <SettingsIcon fontSize="small" />,
    items: [
      {
        title: 'Empresa y políticas',
        path: '/company',
        icon: <BusinessIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.COMPANY_READ,
      },
      {
        title: 'Usuarios',
        path: '/users',
        icon: <ManageAccountsIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.USERS_READ,
      },
      {
        title: 'Copias de seguridad',
        path: '/backups',
        icon: <CloudSyncIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.BACKUPS_MANAGE,
      },
      {
        title: 'Auditoría del sistema',
        path: '/audit',
        icon: <HistoryIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.AUDIT_READ,
      },
      {
        title: 'Asistente contable',
        path: '/accounting/setup',
        icon: <ChecklistIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Catálogo tributario',
        path: '/tax-catalog',
        icon: <GavelIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.PRODUCTS_READ,
      },
      {
        title: 'Plan de cuentas',
        path: '/accounting/accounts',
        icon: <AccountTreeIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Propósitos contables',
        path: '/accounting/purposes',
        icon: <TuneIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Importar plan de cuentas',
        path: '/accounting/import',
        icon: <UploadFileIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE,
      },
    ],
  },
];

export const routeNavigation = [
  ...menuGroups.flatMap((group) => group.items),
  {
    title: 'Clientes',
    path: '/customers',
    permission: [SYSTEM_PERMISSIONS.THIRD_PARTIES_READ, SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE],
  },
  {
    title: 'Proveedores',
    path: '/suppliers',
    permission: [SYSTEM_PERMISSIONS.THIRD_PARTIES_READ, SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE],
  },
  {
    title: 'Cuentas y Terceros',
    path: '/accounting/lookup',
    permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
  },
];

/** La entrada que protege una ruta: la de prefijo más largo (p. ej. /purchases/receive). */
export function navigationForPath(pathname: string) {
  return routeNavigation
    .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

/** Grupo del menú al que pertenece la ruta actual (el de la entrada que la protege). */
export function menuGroupForPath(pathname: string): MenuGroupConfig | undefined {
  const entry = navigationForPath(pathname);
  if (!entry) return undefined;
  return menuGroups.find((group) => group.items.some((item) => item.path === entry.path));
}

import type React from 'react';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import BusinessIcon from '@mui/icons-material/Business';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import MedicationIcon from '@mui/icons-material/Medication';
import CategoryIcon from '@mui/icons-material/Category';
import StraightenIcon from '@mui/icons-material/Straighten';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import PaymentsIcon from '@mui/icons-material/Payments';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import RuleIcon from '@mui/icons-material/Rule';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import BalanceIcon from '@mui/icons-material/Balance';
import DateRangeIcon from '@mui/icons-material/DateRange';
import HistoryIcon from '@mui/icons-material/History';
import GavelIcon from '@mui/icons-material/Gavel';
interface MenuItemConfig {
  title: string;
  path: string;
  icon: React.ReactNode;
  permission: string;
}

interface MenuGroupConfig {
  category: string;
  items: MenuItemConfig[];
}

export const menuGroups: MenuGroupConfig[] = [
  {
    category: 'VENTAS',
    items: [
      {
        title: 'Punto de Venta (POS)',
        path: '/pos',
        icon: <PointOfSaleIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.SALES_CREATE,
      },
      {
        title: 'Historial de Ventas',
        path: '/sales',
        icon: <ReceiptLongIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.SALES_READ,
      },
    ],
  },
  {
    category: 'INVENTARIO',
    items: [
      {
        title: 'Lotes y Stock',
        path: '/inventory/lots',
        icon: <Inventory2Icon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.INVENTORY_READ,
      },
      {
        title: 'Movimientos (Kardex)',
        path: '/inventory/movements',
        icon: <CompareArrowsIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.INVENTORY_READ,
      },
      {
        title: 'Catálogo de Productos',
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
        title: 'Unidades de Medida',
        path: '/units-of-measure',
        icon: <StraightenIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.CATEGORIES_READ,
      },
      {
        title: 'Recepción de Compras',
        path: '/purchases/receive',
        icon: <LocalShippingIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.PURCHASES_RECEIVE,
      },
      {
        title: 'Historial de Compras',
        path: '/purchases',
        icon: <ShoppingBagIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.PURCHASES_READ,
      },
      {
        title: 'Alertas de Vencimiento',
        path: '/alerts',
        icon: <WarningAmberIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.INVENTORY_READ,
      },
    ],
  },
  {
    category: 'TERCEROS',
    items: [
      {
        title: 'Directorio de Terceros',
        path: '/third-parties',
        icon: <PeopleAltIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.THIRD_PARTIES_READ,
      },
    ],
  },
  {
    category: 'CONTABILIDAD Y FINANZAS',
    items: [
      {
        title: 'Control de Caja',
        path: '/cash',
        icon: <AccountBalanceWalletIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.CASH_READ,
      },
      {
        title: 'Tesorería y Bancos',
        path: '/treasury/bank-accounts',
        icon: <AccountBalanceIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.TREASURY_READ,
      },
      {
        title: 'Recibos de Caja',
        path: '/treasury/receipts',
        icon: <ReceiptLongIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Comprobantes de Egreso',
        path: '/treasury/disbursements',
        icon: <PaymentsIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Cuentas por Cobrar',
        path: '/receivables',
        icon: <MonetizationOnIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.RECEIVABLES_READ,
      },
      {
        title: 'Cuentas por Pagar',
        path: '/payables',
        icon: <PaymentsIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.PAYABLES_READ,
      },
      {
        title: 'Causación de Gastos',
        path: '/expenses',
        icon: <ReceiptLongIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.EXPENSES_READ,
      },
      {
        title: 'Libro Diario',
        path: '/accounting/journal',
        icon: <MenuBookIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Balance de Comprobación',
        path: '/accounting/trial-balance',
        icon: <BalanceIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Estado de Resultados (PyG)',
        path: '/accounting/income-statement',
        icon: <AssessmentIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Balance General',
        path: '/accounting/balance-sheet',
        icon: <AccountBalanceIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Auxiliar de Terceros',
        path: '/accounting/third-parties',
        icon: <PeopleAltIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Períodos y Cierre Fiscal',
        path: '/accounting/periods',
        icon: <DateRangeIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
    ],
  },
  {
    category: 'REPORTES',
    items: [
      {
        title: 'Reportes y Exportación',
        path: '/reports',
        icon: <AssessmentIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.REPORTS_READ,
      },
    ],
  },
  {
    category: 'CONFIGURACIÓN',
    items: [
      {
        title: 'Gestión de Usuarios',
        path: '/users',
        icon: <ManageAccountsIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.USERS_READ,
      },
      {
        title: 'Copias de Seguridad',
        path: '/backups',
        icon: <CloudSyncIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.BACKUPS_MANAGE,
      },
      {
        title: 'Auditoría y Trazabilidad',
        path: '/audit',
        icon: <HistoryIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.AUDIT_READ,
      },
    ],
  },
  {
    category: 'CONFIGURACIÓN CONTABLE',
    items: [
      {
        title: 'Empresa y Política Contable',
        path: '/company',
        icon: <BusinessIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.COMPANY_READ,
      },
      {
        title: 'Catálogo Normativo Tributario',
        path: '/tax-catalog',
        icon: <GavelIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.PRODUCTS_READ,
      },
      {
        title: 'Plan de Cuentas',
        path: '/accounting/accounts',
        icon: <AccountTreeIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Propósitos Contables',
        path: '/accounting/purposes',
        icon: <RuleIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      },
      {
        title: 'Importar Plan de Cuentas',
        path: '/accounting/import',
        icon: <UploadFileIcon fontSize="small" />,
        permission: SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE,
      },
    ],
  },
];

export const routeNavigation = [
  ...menuGroups.flatMap((group) => group.items),
  { title: 'Clientes', path: '/customers', permission: SYSTEM_PERMISSIONS.THIRD_PARTIES_READ },
  { title: 'Proveedores', path: '/suppliers', permission: SYSTEM_PERMISSIONS.THIRD_PARTIES_READ },
];

export function navigationForPath(pathname: string) {
  return routeNavigation
    .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

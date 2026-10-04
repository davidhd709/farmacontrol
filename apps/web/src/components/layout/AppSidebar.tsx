import React from 'react';
import {
  Box,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import MedicationIcon from '@mui/icons-material/Medication';
import CategoryIcon from '@mui/icons-material/Category';
import StraightenIcon from '@mui/icons-material/Straighten';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import StorefrontIcon from '@mui/icons-material/Storefront';
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
import { usePermissions } from '../../features/auth/hooks/usePermissions';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';

export const SIDEBAR_WIDTH = 260;

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
}

interface MenuItemConfig {
  title: string;
  path: string;
  icon: React.ReactNode;
  permission?: string;
  anyPermissions?: string[];
}

interface MenuGroupConfig {
  category: string;
  items: MenuItemConfig[];
}

export const AppSidebar: React.FC<AppSidebarProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();

  const menuGroups: MenuGroupConfig[] = [
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
        {
          title: 'Clientes',
          path: '/customers',
          icon: <PeopleAltIcon fontSize="small" />,
          permission: SYSTEM_PERMISSIONS.CUSTOMERS_READ,
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
          title: 'Proveedores',
          path: '/suppliers',
          icon: <StorefrontIcon fontSize="small" />,
          permission: SYSTEM_PERMISSIONS.SUPPLIERS_READ,
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
          title: 'Gastos Operativos',
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

  const handleNavigate = (path: string) => {
    navigate(path);
    if (isMobile) {
      onClose();
    }
  };

  const drawerContent = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#FFFFFF',
        color: 'text.primary',
      }}
    >
      {/* Botón Principal: Inicio / Dashboard */}
      <Box sx={{ p: 2, pb: 1 }}>
        <ListItemButton
          onClick={() => handleNavigate('/')}
          selected={location.pathname === '/'}
          sx={{
            borderRadius: 2,
            py: 1.25,
            px: 2,
            bgcolor: location.pathname === '/' ? 'primary.main' : 'background.paper',
            color: location.pathname === '/' ? '#FFFFFF' : 'text.primary',
            boxShadow: location.pathname === '/' ? '0 3px 8px rgba(15, 118, 110, 0.3)' : 'none',
            '&:hover': {
              bgcolor: location.pathname === '/' ? 'primary.dark' : 'action.hover',
            },
            '&.Mui-selected': {
              bgcolor: 'primary.main',
              color: '#FFFFFF',
              '&:hover': {
                bgcolor: 'primary.dark',
              },
            },
          }}
        >
          <ListItemIcon
            sx={{
              minWidth: 36,
              color: location.pathname === '/' ? '#FFFFFF' : 'primary.main',
            }}
          >
            <DashboardIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={
              <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>Panel Principal</Typography>
            }
          />
        </ListItemButton>
      </Box>

      <Divider sx={{ mx: 2, my: 1 }} />

      {/* Lista de Grupos */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, pb: 4 }}>
        {menuGroups.map((group) => {
          // Filtrar items según permisos del usuario
          const visibleItems = group.items.filter((item) => {
            if (item.permission) return hasPermission(item.permission);
            if (item.anyPermissions) return item.anyPermissions.some(hasPermission);
            return true;
          });

          if (visibleItems.length === 0) return null;

          return (
            <List
              key={group.category}
              disablePadding
              subheader={
                <ListSubheader
                  disableSticky
                  sx={{
                    bgcolor: 'transparent',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    color: 'text.secondary',
                    lineHeight: '32px',
                    px: 1.5,
                  }}
                >
                  {group.category}
                </ListSubheader>
              }
            >
              {visibleItems.map((item) => {
                const isActive =
                  location.pathname === item.path ||
                  (item.path !== '/' && location.pathname.startsWith(item.path + '/'));

                return (
                  <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
                    <ListItemButton
                      onClick={() => handleNavigate(item.path)}
                      selected={isActive}
                      sx={{
                        borderRadius: 2,
                        py: 0.9,
                        px: 1.5,
                        transition: 'background-color 0.15s ease, color 0.15s ease',
                        '&.Mui-selected': {
                          bgcolor: 'rgba(15, 118, 110, 0.10)',
                          color: 'primary.main',
                          fontWeight: 700,
                          '&:hover': {
                            bgcolor: 'rgba(15, 118, 110, 0.15)',
                          },
                        },
                        '&:hover': {
                          bgcolor: 'action.hover',
                        },
                      }}
                    >
                      <ListItemIcon
                        sx={{
                          minWidth: 34,
                          color: isActive ? 'primary.main' : 'text.secondary',
                        }}
                      >
                        {item.icon}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography
                            sx={{
                              fontSize: '0.86rem',
                              fontWeight: isActive ? 700 : 500,
                              color: isActive ? 'primary.main' : 'text.primary',
                            }}
                          >
                            {item.title}
                          </Typography>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          );
        })}
      </Box>

      {/* Pie del Sidebar: Versión e info técnica */}
      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: '#FAFAFA' }}>
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}
        >
          FarmaControl v1.0 • Producción
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
          Sistema con motor FEFO & Kardex
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box
      component="nav"
      sx={{
        width: { md: open ? SIDEBAR_WIDTH : 0 },
        flexShrink: { md: 0 },
      }}
    >
      {/* Móvil / Tablet: Drawer temporal */}
      {isMobile ? (
        <Drawer
          variant="temporary"
          open={open}
          onClose={onClose}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: SIDEBAR_WIDTH,
              borderRight: 1,
              borderColor: 'divider',
            },
          }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        /* Escritorio: Drawer persistente */
        <Drawer
          variant="persistent"
          open={open}
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: SIDEBAR_WIDTH,
              borderRight: 1,
              borderColor: 'divider',
              top: 64, // Justo debajo de la AppNavbar
              height: 'calc(100% - 64px)',
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}
    </Box>
  );
};

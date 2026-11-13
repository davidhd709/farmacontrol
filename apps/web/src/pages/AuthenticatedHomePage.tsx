import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Link as MuiLink,
  List,
  ListItem,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../features/auth/hooks/useAuth';
import { usePermissions } from '../features/auth/hooks/usePermissions';
import { fetchAlertsSummary } from '../features/alerts/api/alerts.api';
import { fetchCashBalance } from '../features/cash/api/cash.api';
import { fetchReceivablesAgingSummary } from '../features/receivables/api/receivables.api';
import { getBankAccountSummary } from '../features/treasury/api/treasury.api';
import { fetchSalesReport } from '../features/reports/api/reports.api';
import { businessToday } from '../utils/business-date';
import { formatCop } from '../utils/money';
import { formatDate } from '../utils/date-format';

type QueryState = { isPending: boolean; isError: boolean; refetch: () => unknown };

/** Indicador compacto: nombre, valor, detalle y un enlace a la pantalla donde se actúa. */
function Kpi({
  title,
  detail,
  query,
  children,
  to,
  action,
}: {
  title: string;
  detail: string;
  query: QueryState;
  children: ReactNode;
  to: string;
  action: string;
}) {
  return (
    <Card variant="outlined" component="section" aria-label={title}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Typography component="h2" variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Box sx={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>
          {query.isError ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography role="status">No disponible</Typography>
              <Button size="small" onClick={() => void query.refetch()}>
                Reintentar {title}
              </Button>
            </Stack>
          ) : query.isPending ? (
            <Skeleton aria-label={`Cargando ${title}`} width="70%" height={36} />
          ) : (
            children
          )}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {detail}
        </Typography>
        <MuiLink
          component={Link}
          to={to}
          variant="body2"
          underline="hover"
          sx={{ display: 'inline-flex', alignItems: 'center', mt: 1, fontWeight: 700 }}
        >
          {action}
          <ChevronRightIcon fontSize="small" aria-hidden />
        </MuiLink>
      </CardContent>
    </Card>
  );
}

const kpiValueSx = {
  fontSize: '1.5rem',
  fontWeight: 800,
  fontVariantNumeric: 'tabular-nums',
} as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Pending {
  key: string;
  severity: 'error' | 'warning';
  text: string;
  to: string;
  action: string;
}

export function AuthenticatedHomePage() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const today = businessToday();

  const canReadAlerts =
    hasPermission(SYSTEM_PERMISSIONS.INVENTORY_READ) &&
    hasPermission(SYSTEM_PERMISSIONS.ALERTS_READ);
  const canReadCash = hasPermission(SYSTEM_PERMISSIONS.CASH_READ);
  const canReadBanks = hasPermission(SYSTEM_PERMISSIONS.TREASURY_READ);
  const canReadReceivables = hasPermission(SYSTEM_PERMISSIONS.RECEIVABLES_READ);
  const canReadSales = hasPermission(SYSTEM_PERMISSIONS.REPORTS_READ);

  const alertsQuery = useQuery({
    queryKey: ['dashboard', 'alerts-summary'],
    queryFn: fetchAlertsSummary,
    enabled: canReadAlerts,
    refetchInterval: 30000,
  });
  const cashQuery = useQuery({
    queryKey: ['dashboard', 'cash-balance'],
    queryFn: fetchCashBalance,
    enabled: canReadCash,
    refetchInterval: 30000,
  });
  const banksQuery = useQuery({
    queryKey: ['dashboard', 'banks-summary'],
    queryFn: getBankAccountSummary,
    enabled: canReadBanks,
    refetchInterval: 30000,
  });
  const receivablesQuery = useQuery({
    queryKey: ['dashboard', 'receivables-summary'],
    queryFn: fetchReceivablesAgingSummary,
    enabled: canReadReceivables,
    refetchInterval: 30000,
  });
  const salesQuery = useQuery({
    queryKey: ['dashboard', 'sales', today],
    queryFn: () => fetchSalesReport({ fromDate: today, toDate: today }),
    enabled: canReadSales,
    refetchInterval: 30000,
  });

  const quickActions = [
    {
      to: '/pos',
      label: 'Nueva venta',
      icon: <AddShoppingCartIcon />,
      allowed: hasPermission(SYSTEM_PERMISSIONS.SALES_CREATE),
    },
    {
      to: '/purchases/receive',
      label: 'Recibir compra',
      icon: <LocalShippingIcon />,
      allowed: hasPermission(SYSTEM_PERMISSIONS.PURCHASES_RECEIVE),
    },
    {
      to: '/inventory/lots',
      label: 'Stock y lotes',
      icon: <Inventory2Icon />,
      allowed: hasPermission(SYSTEM_PERMISSIONS.INVENTORY_READ),
    },
    {
      to: '/cash',
      label: 'Caja',
      icon: <AccountBalanceWalletIcon />,
      allowed: canReadCash,
    },
    {
      to: '/sales',
      label: 'Historial de ventas',
      icon: <ReceiptLongIcon />,
      allowed: hasPermission(SYSTEM_PERMISSIONS.SALES_READ),
    },
  ].filter((action) => action.allowed);

  // Pendientes que llevan a una acción concreta; solo con datos ya cargados
  const pending: Pending[] = [];
  const alerts = alertsQuery.data;
  if (alerts?.vencidos) {
    pending.push({
      key: 'vencidos',
      severity: 'error',
      text: `${plural(alerts.vencidos, 'lote vencido', 'lotes vencidos')} con existencias: retírelos de la venta.`,
      to: '/alerts?severity=VENCIDO',
      action: 'Revisar vencidos',
    });
  }
  if (alerts?.criticos) {
    pending.push({
      key: 'criticos',
      severity: 'warning',
      text: `${plural(alerts.criticos, 'lote vence', 'lotes vencen')} en 30 días o menos.`,
      to: '/alerts?severity=CRITICO',
      action: 'Revisar críticos',
    });
  }
  const aging = receivablesQuery.data;
  const overdueCount = aging ? aging.days61To90.count + aging.daysOver90.count : 0;
  if (overdueCount > 0) {
    pending.push({
      key: 'cartera',
      severity: 'warning',
      text: `${plural(overdueCount, 'cuenta por cobrar', 'cuentas por cobrar')} con más de 60 días.`,
      to: '/receivables',
      action: 'Ver cartera',
    });
  }
  const pendingSources = [
    canReadAlerts && alertsQuery,
    canReadReceivables && receivablesQuery,
  ].filter(Boolean) as QueryState[];
  const pendingLoaded = pendingSources.length > 0 && pendingSources.every((q) => !q.isPending);

  const hasKpis =
    canReadSales || canReadCash || canReadAlerts || canReadBanks || canReadReceivables;

  return (
    <Stack spacing={3} sx={{ maxWidth: 1200 }}>
      <Box>
        <Typography component="h1" variant="h4">
          Inicio
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Hola, {user?.username} · Hoy {formatDate(today)}
        </Typography>
      </Box>

      {quickActions.length > 0 && (
        <Box
          component="section"
          aria-label="Accesos frecuentes"
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}
        >
          {quickActions.map((action, index) => (
            <Button
              key={action.to}
              component={Link}
              to={action.to}
              variant={index === 0 ? 'contained' : 'outlined'}
              startIcon={action.icon}
            >
              {action.label}
            </Button>
          ))}
        </Box>
      )}

      {hasKpis && (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              sm: 'repeat(2, minmax(0, 1fr))',
              lg: 'repeat(auto-fit, minmax(200px, 1fr))',
            },
          }}
        >
          {canReadSales && (
            <Kpi
              title="Ventas de hoy"
              detail={`${formatDate(today)} · hora de Bogotá`}
              query={salesQuery}
              to={`/reports?tab=sales&fromDate=${today}&toDate=${today}`}
              action="Ver ventas de hoy"
            >
              <Box>
                <Typography sx={kpiValueSx}>
                  {salesQuery.data && formatCop(salesQuery.data.totalAmount)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {salesQuery.data && plural(salesQuery.data.totalSales, 'venta', 'ventas')}
                </Typography>
              </Box>
            </Kpi>
          )}
          {canReadCash && (
            <Kpi
              title="Efectivo en caja"
              detail="Saldo actual"
              query={cashQuery}
              to="/cash"
              action="Ver caja"
            >
              <Typography sx={kpiValueSx}>
                {cashQuery.data && formatCop(cashQuery.data.currentBalance)}
              </Typography>
            </Kpi>
          )}
          {canReadAlerts && (
            <Kpi
              title="Vencimientos"
              detail="Lotes activos con existencias"
              query={alertsQuery}
              to="/alerts"
              action="Ver vencimientos"
            >
              <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {(
                  [
                    ['VENCIDO', 'Vencidos', alertsQuery.data?.vencidos],
                    ['CRITICO', 'Críticos', alertsQuery.data?.criticos],
                    ['ALERTA', 'En alerta', alertsQuery.data?.alertas],
                  ] as const
                ).map(([severity, label, count]) => (
                  <MuiLink
                    key={severity}
                    component={Link}
                    to={`/alerts?severity=${severity}`}
                    underline="hover"
                    color={severity === 'VENCIDO' && count ? 'error' : 'inherit'}
                    sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {label}: {count}
                  </MuiLink>
                ))}
              </Stack>
            </Kpi>
          )}
          {canReadBanks && (
            <Kpi
              title="Bancos"
              detail={
                banksQuery.data
                  ? `${plural(banksQuery.data.activeAccountsCount, 'cuenta activa', 'cuentas activas')}`
                  : 'Saldo actual'
              }
              query={banksQuery}
              to="/treasury/bank-accounts"
              action="Ver bancos"
            >
              <Typography sx={kpiValueSx}>
                {banksQuery.data && formatCop(banksQuery.data.totalBalance)}
              </Typography>
            </Kpi>
          )}
          {canReadReceivables && (
            <Kpi
              title="Cartera de clientes"
              detail={
                receivablesQuery.data
                  ? `Saldo pendiente · ${plural(receivablesQuery.data.totalCount, 'cuenta', 'cuentas')}`
                  : 'Saldo pendiente'
              }
              query={receivablesQuery}
              to="/receivables"
              action="Ver cartera"
            >
              <Typography sx={kpiValueSx}>
                {receivablesQuery.data && formatCop(receivablesQuery.data.totalPending)}
              </Typography>
            </Kpi>
          )}
        </Box>
      )}

      {pendingSources.length > 0 && (
        <Box component="section" aria-labelledby="home-pending-title">
          <Typography
            id="home-pending-title"
            component="h2"
            variant="h6"
            sx={{ fontWeight: 700, mb: 1 }}
          >
            Pendientes
          </Typography>
          {!pendingLoaded ? (
            <Skeleton aria-label="Cargando pendientes" height={48} />
          ) : pending.length === 0 ? (
            <Typography variant="body2" color="text.secondary" role="status">
              No hay pendientes que requieran acción.
            </Typography>
          ) : (
            <List disablePadding sx={{ display: 'grid', gap: 1 }}>
              {pending.map((item) => (
                <ListItem key={item.key} disablePadding>
                  <Alert
                    severity={item.severity}
                    sx={{ width: '100%' }}
                    action={
                      <Button component={Link} to={item.to} color="inherit" size="small">
                        {item.action}
                      </Button>
                    }
                  >
                    {item.text}
                  </Alert>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      )}
    </Stack>
  );
}

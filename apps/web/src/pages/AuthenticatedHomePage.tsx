import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Paper,
  Stack,
  Typography,
  Skeleton,
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { useAuth } from '../features/auth/hooks/useAuth';
import { usePermissions } from '../features/auth/hooks/usePermissions';
import { useQuery } from '@tanstack/react-query';
import { fetchAlertsSummary } from '../features/alerts/api/alerts.api';
import { fetchCashBalance } from '../features/cash/api/cash.api';
import { fetchReceivablesAgingSummary } from '../features/receivables/api/receivables.api';
import { getBankAccountSummary } from '../features/treasury/api/treasury.api';
import { fetchSalesReport } from '../features/reports/api/reports.api';
import { businessToday } from '../utils/business-date';

const currency = (value: number | string) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
  }).format(typeof value === 'string' ? Number(value) : value);

function MetricCard({
  title,
  period,
  query,
  children,
  to,
  action,
}: {
  title: string;
  period: string;
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  children: ReactNode;
  to: string;
  action: string;
}) {
  return (
    <Card variant="outlined" component="section" aria-label={title} sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Typography component="h2" variant="subtitle2">
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {period}
          </Typography>
          {query.isError ? (
            <Stack spacing={1}>
              <Typography role="status">No disponible</Typography>
              <Button
                onClick={() => {
                  query.refetch();
                }}
              >
                Reintentar {title}
              </Button>
            </Stack>
          ) : query.isPending ? (
            <Skeleton aria-label={`Cargando ${title}`} height={40} />
          ) : (
            children
          )}
          <Button component={Link} to={to} variant="outlined">
            {action}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function AuthenticatedHomePage() {
  const { user } = useAuth();
  const { roles, permissions, hasPermission } = usePermissions();
  const today = businessToday();
  const canReadAlerts =
    hasPermission(SYSTEM_PERMISSIONS.INVENTORY_READ) &&
    hasPermission(SYSTEM_PERMISSIONS.ALERTS_READ);
  const alertsQuery = useQuery({
    queryKey: ['dashboard', 'alerts-summary'],
    queryFn: fetchAlertsSummary,
    enabled: canReadAlerts,
    refetchInterval: 30000,
  });
  const cashQuery = useQuery({
    queryKey: ['dashboard', 'cash-balance'],
    queryFn: fetchCashBalance,
    enabled: hasPermission(SYSTEM_PERMISSIONS.CASH_READ),
    refetchInterval: 30000,
  });
  const banksQuery = useQuery({
    queryKey: ['dashboard', 'banks-summary'],
    queryFn: getBankAccountSummary,
    enabled: hasPermission(SYSTEM_PERMISSIONS.TREASURY_READ),
    refetchInterval: 30000,
  });
  const receivablesQuery = useQuery({
    queryKey: ['dashboard', 'receivables-summary'],
    queryFn: fetchReceivablesAgingSummary,
    enabled: hasPermission(SYSTEM_PERMISSIONS.RECEIVABLES_READ),
    refetchInterval: 30000,
  });
  const salesQuery = useQuery({
    queryKey: ['dashboard', 'sales', today],
    queryFn: () => fetchSalesReport({ fromDate: today, toDate: today }),
    enabled: hasPermission(SYSTEM_PERMISSIONS.REPORTS_READ),
    refetchInterval: 30000,
  });

  const todayFormatted = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <Box sx={{ minHeight: '100%', py: { xs: 1, sm: 2 } }}>
      <Container maxWidth="lg" disableGutters>
        <Stack spacing={3}>
          {/* Banner de Bienvenida y Estado del Operador (Boss Ultimate Style) */}
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2.5, md: 3 },
              borderRadius: 3,
              border: 1,
              borderColor: 'divider',
              bgcolor: '#FFFFFF',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'flex-start', sm: 'center' },
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar
                  sx={{
                    width: 54,
                    height: 54,
                    bgcolor: 'primary.main',
                    fontWeight: 800,
                    fontSize: '1.25rem',
                    boxShadow: '0 2px 8px rgba(15, 118, 110, 0.25)',
                  }}
                >
                  {user?.username?.substring(0, 2).toUpperCase() || 'U'}
                </Avatar>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary' }}>
                    ¡Bienvenido, {user?.username}!
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.2 }}>
                    Tu sesión está activa con {permissions.length} permisos habilitados en la
                    plataforma.
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.disabled', textTransform: 'capitalize' }}
                  >
                    📅 {todayFormatted}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: 'text.secondary', mr: 0.5 }}
                >
                  ROLES:
                </Typography>
                {roles.length > 0 ? (
                  roles.map((role) => (
                    <Chip
                      key={role}
                      label={role}
                      color={role === 'admin' ? 'primary' : 'default'}
                      size="small"
                      sx={{ fontWeight: 700, textTransform: 'capitalize', borderRadius: 1.5 }}
                    />
                  ))
                ) : (
                  <Chip label="Sin rol" size="small" variant="outlined" />
                )}
              </Box>
            </Box>
          </Paper>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
              gap: 2,
            }}
          >
            {hasPermission(SYSTEM_PERMISSIONS.CASH_READ) && (
              <MetricCard
                title="Efectivo en Caja"
                period="Saldo actual"
                query={cashQuery}
                to="/cash"
                action="Arqueo y Movimientos"
              >
                <Typography variant="h5">
                  {cashQuery.data && currency(cashQuery.data.currentBalance)}
                </Typography>
              </MetricCard>
            )}
            {hasPermission(SYSTEM_PERMISSIONS.TREASURY_READ) && (
              <MetricCard
                title="Bancos"
                period="Saldo actual"
                query={banksQuery}
                to="/treasury/bank-accounts"
                action="Ver cuentas bancarias"
              >
                <Typography variant="h5">
                  {banksQuery.data && currency(banksQuery.data.totalBalance)}
                </Typography>
              </MetricCard>
            )}
            {hasPermission(SYSTEM_PERMISSIONS.RECEIVABLES_READ) && (
              <MetricCard
                title="Cartera de Clientes"
                period="Saldo pendiente actual · todas las cuentas"
                query={receivablesQuery}
                to="/receivables"
                action="Ver Cuentas por Cobrar"
              >
                <Typography variant="h5">
                  {receivablesQuery.data && currency(receivablesQuery.data.totalPending)}
                </Typography>
              </MetricCard>
            )}
            {hasPermission(SYSTEM_PERMISSIONS.REPORTS_READ) && (
              <MetricCard
                title="Ventas de hoy"
                period={`Hoy: ${today} · Bogotá`}
                query={salesQuery}
                to={`/reports?tab=sales&fromDate=${today}&toDate=${today}`}
                action="Ver ventas de hoy"
              >
                <Box>
                  <Typography variant="h5">
                    {salesQuery.data && currency(salesQuery.data.totalAmount)}
                  </Typography>
                  <Typography>{salesQuery.data?.totalSales} ventas</Typography>
                </Box>
              </MetricCard>
            )}
            {canReadAlerts && (
              <MetricCard
                title="Alertas de vencimiento"
                period="Lotes activos con stock · estado actual"
                query={alertsQuery}
                to="/alerts"
                action="Revisar Alertas"
              >
                <Stack spacing={1}>
                  {(
                    [
                      ['VENCIDO', 'Vencidos', alertsQuery.data?.vencidos],
                      ['CRITICO', 'Críticos', alertsQuery.data?.criticos],
                      ['ALERTA', 'En alerta', alertsQuery.data?.alertas],
                      ['PROXIMO', 'Próximos', alertsQuery.data?.proximos],
                    ] as const
                  ).map(([severity, label, count]) => (
                    <Button
                      key={severity}
                      component={Link}
                      to={`/alerts?severity=${severity}`}
                      sx={{ justifyContent: 'flex-start' }}
                    >
                      {label}: {count}
                    </Button>
                  ))}
                </Stack>
              </MetricCard>
            )}
          </Box>

          {/* Panel de Resumen Rápido y Notificaciones de Seguridad */}
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              borderRadius: 3,
              bgcolor: '#FFFFFF',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <NotificationsActiveIcon color="primary" />
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Avisos Operativos y Reglas Críticas del Sistema
              </Typography>
            </Box>
            <Stack spacing={1.5}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: '#F8FAFC',
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  🎯 Motor de Dispensación FEFO Activo:
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Toda venta reserva automáticamente los lotes con fecha de vencimiento más próxima
                  de forma inmutable, garantizando cero pérdidas de producto vencido.
                </Typography>
              </Box>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: '#F8FAFC',
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  🛡️ Navegación Centralizada:
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Utiliza el menú lateral izquierdo para acceder rápidamente a Ventas, Inventario,
                  Contabilidad, Reportes y Configuración de acuerdo a tus roles asignados.
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}

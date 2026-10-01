import { useNavigate } from 'react-router-dom';
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
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { useAuth } from '../features/auth/hooks/useAuth';
import { usePermissions } from '../features/auth/hooks/usePermissions';
import { PermissionGate } from '../features/auth/components/PermissionGate';
import { useQuery } from '@tanstack/react-query';
import { fetchAlertsSummary } from '../features/alerts/api/alerts.api';
import { fetchCashBalance } from '../features/cash/api/cash.api';
import { fetchReceivables } from '../features/receivables/api/receivables.api';

export function AuthenticatedHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roles, permissions } = usePermissions();

  // 1. Resumen de alertas de vencimiento
  const alertsQuery = useQuery({
    queryKey: ['dashboard', 'alerts-summary'],
    queryFn: fetchAlertsSummary,
    refetchInterval: 30000,
  });

  // 2. Saldo de caja actual
  const cashQuery = useQuery({
    queryKey: ['dashboard', 'cash-balance'],
    queryFn: fetchCashBalance,
    refetchInterval: 30000,
  });

  // 3. Saldo pendiente en cuentas por cobrar
  const receivablesQuery = useQuery({
    queryKey: ['dashboard', 'receivables-summary'],
    queryFn: () => fetchReceivables({ page: 1, pageSize: 50 }),
    refetchInterval: 30000,
  });

  const alerts = alertsQuery.data;
  const criticalCount = (alerts?.vencidos ?? 0) + (alerts?.criticos ?? 0);
  const cashBalance = cashQuery.data?.currentBalance ?? 0;

  const totalReceivablesBalance = (receivablesQuery.data?.items ?? []).reduce(
    (acc, curr) => acc + (curr.status === 'PENDIENTE' ? Number(curr.balance) : 0),
    0,
  );

  const todayFormatted = new Intl.DateTimeFormat('es-CO', {
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

          {/* Tarjetas de Métricas en Tiempo Real (KPIs del Negocio) */}
          <Box>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 800, color: 'text.secondary', mb: 1.5, letterSpacing: '0.05em' }}
            >
              MÉTRICAS Y ESTADO OPERATIVO EN TIEMPO REAL
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
                gap: 2,
              }}
            >
              {/* KPI 1: Facturación y Punto de Venta */}
              <PermissionGate
                anyOf={[SYSTEM_PERMISSIONS.SALES_CREATE, SYSTEM_PERMISSIONS.SALES_READ]}
              >
                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 3,
                    bgcolor: '#FFFFFF',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      boxShadow: '0 4px 12px rgba(15, 118, 110, 0.1)',
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        mb: 1.5,
                      }}
                    >
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            color: 'text.secondary',
                            textTransform: 'uppercase',
                          }}
                        >
                          Punto de Venta (POS)
                        </Typography>
                        <Typography
                          variant="h6"
                          sx={{ fontWeight: 800, mt: 0.5, color: 'text.primary' }}
                        >
                          Dispensación FEFO
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          width: 42,
                          height: 42,
                          borderRadius: 2.5,
                          bgcolor: 'rgba(15, 118, 110, 0.1)',
                          color: 'primary.main',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <PointOfSaleIcon />
                      </Box>
                    </Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontSize: '0.8rem', mb: 2 }}
                    >
                      Facturación ágil con salida atómica e inmutable en inventario.
                    </Typography>
                    <PermissionGate permission={SYSTEM_PERMISSIONS.SALES_CREATE}>
                      <Button
                        variant="contained"
                        size="small"
                        color="primary"
                        fullWidth
                        onClick={() => navigate('/pos')}
                        data-testid="pos-nav-btn"
                        sx={{ fontWeight: 700, textTransform: 'none' }}
                      >
                        Nueva Venta
                      </Button>
                    </PermissionGate>
                  </CardContent>
                </Card>
              </PermissionGate>

              {/* KPI 2: Control de Caja en Efectivo */}
              <PermissionGate permission={SYSTEM_PERMISSIONS.CASH_READ}>
                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 3,
                    bgcolor: '#FFFFFF',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.12)',
                      borderColor: 'success.main',
                    },
                  }}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        mb: 1.5,
                      }}
                    >
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            color: 'text.secondary',
                            textTransform: 'uppercase',
                          }}
                        >
                          Efectivo en Caja
                        </Typography>
                        {cashQuery.isLoading ? (
                          <Skeleton width={100} height={32} />
                        ) : (
                          <Typography
                            variant="h5"
                            sx={{ fontWeight: 800, mt: 0.5, color: 'success.dark' }}
                          >
                            ${cashBalance.toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                          </Typography>
                        )}
                      </Box>
                      <Box
                        sx={{
                          width: 42,
                          height: 42,
                          borderRadius: 2.5,
                          bgcolor: 'rgba(16, 185, 129, 0.1)',
                          color: '#10B981',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <AccountBalanceWalletIcon />
                      </Box>
                    </Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontSize: '0.8rem', mb: 2 }}
                    >
                      Saldo en caja disponible para operaciones y devoluciones.
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      color="inherit"
                      fullWidth
                      onClick={() => navigate('/cash')}
                      sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                      Arqueo y Movimientos
                    </Button>
                  </CardContent>
                </Card>
              </PermissionGate>

              {/* KPI 3: Alertas de Vencimiento de Lotes */}
              <PermissionGate permission={SYSTEM_PERMISSIONS.INVENTORY_READ}>
                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 3,
                    bgcolor: '#FFFFFF',
                    borderColor: criticalCount > 0 ? 'error.light' : 'divider',
                    transition: 'all 0.2s ease',
                    '&:hover': { boxShadow: '0 4px 12px rgba(239, 68, 68, 0.12)' },
                  }}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        mb: 1.5,
                      }}
                    >
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            color: 'text.secondary',
                            textTransform: 'uppercase',
                          }}
                        >
                          Lotes en Riesgo
                        </Typography>
                        {alertsQuery.isLoading ? (
                          <Skeleton width={80} height={32} />
                        ) : (
                          <Typography
                            variant="h5"
                            sx={{
                              fontWeight: 800,
                              mt: 0.5,
                              color: criticalCount > 0 ? 'error.main' : 'text.primary',
                            }}
                          >
                            {criticalCount}{' '}
                            <Typography
                              component="span"
                              variant="caption"
                              sx={{ color: 'text.secondary', fontWeight: 600 }}
                            >
                              lotes
                            </Typography>
                          </Typography>
                        )}
                      </Box>
                      <Box
                        sx={{
                          width: 42,
                          height: 42,
                          borderRadius: 2.5,
                          bgcolor:
                            criticalCount > 0
                              ? 'rgba(239, 68, 68, 0.1)'
                              : 'rgba(245, 158, 11, 0.1)',
                          color: criticalCount > 0 ? 'error.main' : '#F59E0B',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <WarningAmberIcon />
                      </Box>
                    </Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontSize: '0.8rem', mb: 2 }}
                    >
                      {alerts?.vencidos ?? 0} vencidos • {alerts?.criticos ?? 0} críticos (&lt;30d).
                    </Typography>
                    <Button
                      variant={criticalCount > 0 ? 'contained' : 'outlined'}
                      color={criticalCount > 0 ? 'error' : 'inherit'}
                      size="small"
                      fullWidth
                      onClick={() => navigate('/alerts')}
                      sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                      Revisar Alertas
                    </Button>
                  </CardContent>
                </Card>
              </PermissionGate>

              {/* KPI 4: Cartera Pendiente por Cobrar */}
              <PermissionGate permission={SYSTEM_PERMISSIONS.RECEIVABLES_READ}>
                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 3,
                    bgcolor: '#FFFFFF',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      boxShadow: '0 4px 12px rgba(14, 165, 233, 0.12)',
                      borderColor: 'info.main',
                    },
                  }}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        mb: 1.5,
                      }}
                    >
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            color: 'text.secondary',
                            textTransform: 'uppercase',
                          }}
                        >
                          Cartera de Clientes
                        </Typography>
                        {receivablesQuery.isLoading ? (
                          <Skeleton width={100} height={32} />
                        ) : (
                          <Typography
                            variant="h5"
                            sx={{ fontWeight: 800, mt: 0.5, color: 'text.primary' }}
                          >
                            $
                            {totalReceivablesBalance.toLocaleString('es-CO', {
                              minimumFractionDigits: 2,
                            })}
                          </Typography>
                        )}
                      </Box>
                      <Box
                        sx={{
                          width: 42,
                          height: 42,
                          borderRadius: 2.5,
                          bgcolor: 'rgba(14, 165, 233, 0.1)',
                          color: '#0EA5E9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MonetizationOnIcon />
                      </Box>
                    </Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontSize: '0.8rem', mb: 2 }}
                    >
                      Créditos comerciales pendientes de recaudo y abonos.
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      color="inherit"
                      fullWidth
                      onClick={() => navigate('/receivables')}
                      sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                      Ver Cuentas por Cobrar
                    </Button>
                  </CardContent>
                </Card>
              </PermissionGate>
            </Box>
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

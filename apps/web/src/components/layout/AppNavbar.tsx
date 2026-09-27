import React from 'react';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  IconButton,
  Toolbar,
  Typography,
  Tooltip,
  Badge,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import LogoutIcon from '@mui/icons-material/Logout';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { usePermissions } from '../../features/auth/hooks/usePermissions';
import { fetchAlertsSummary } from '../../features/alerts/api/alerts.api';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';

interface AppNavbarProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
}

export const AppNavbar: React.FC<AppNavbarProps> = ({ onToggleSidebar }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { roles, hasPermission } = usePermissions();

  // Consulta en tiempo real de alertas de vencimiento para el badge superior
  const alertsSummary = useQuery({
    queryKey: ['alerts', 'summary'],
    queryFn: fetchAlertsSummary,
    refetchInterval: 30000,
  });

  const criticalCount = (alertsSummary.data?.vencidos ?? 0) + (alertsSummary.data?.criticos ?? 0);
  const canCreateSale = hasPermission(SYSTEM_PERMISSIONS.SALES_CREATE);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
  };

  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{
        bgcolor: '#FFFFFF',
        borderBottom: 1,
        borderColor: 'divider',
        zIndex: (theme) => theme.zIndex.drawer + 1,
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 3 }, minHeight: 64 }}>
        {/* Izquierda: Botón Hamburguesa y Marca */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton
            edge="start"
            color="inherit"
            aria-label="Alternar menú de navegación"
            onClick={onToggleSidebar}
            sx={{ mr: 0.5 }}
          >
            <MenuIcon />
          </IconButton>

          <Box
            onClick={() => navigate('/')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                bgcolor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                boxShadow: '0 2px 6px rgba(15, 118, 110, 0.25)',
              }}
            >
              <LocalPharmacyIcon sx={{ fontSize: '1.35rem' }} />
            </Box>
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.1, color: 'text.primary' }}>
                Farmacia Central
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Sistema Operativo
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Derecha: Acciones directas, Alertas, Usuario y Logout */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
          {/* Botón rápido POS */}
          {canCreateSale && (
            <Button
              variant="contained"
              size="small"
              color="primary"
              startIcon={<AddShoppingCartIcon />}
              onClick={() => navigate('/pos')}
              sx={{
                fontWeight: 700,
                display: { xs: 'none', sm: 'inline-flex' },
                boxShadow: 'none',
                '&:hover': { boxShadow: '0 2px 6px rgba(15, 118, 110, 0.3)' },
              }}
            >
              Nueva Venta
            </Button>
          )}

          {/* Botón Alertas de Vencimiento */}
          <Tooltip title="Alertas de Vencimiento">
            <Button
              variant="outlined"
              size="small"
              color={criticalCount > 0 ? 'error' : 'inherit'}
              onClick={() => navigate('/alerts')}
              data-testid="topbar-alerts-btn"
              startIcon={
                <Badge badgeContent={criticalCount} color="error" max={99}>
                  <NotificationsActiveIcon fontSize="small" />
                </Badge>
              }
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
                borderColor: criticalCount > 0 ? 'error.main' : 'divider',
              }}
            >
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                Alertas
              </Box>
            </Button>
          </Tooltip>

          {/* Usuario / Rol */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar
              sx={{
                width: 34,
                height: 34,
                bgcolor: 'primary.dark',
                fontSize: '0.85rem',
                fontWeight: 700,
              }}
            >
              {user?.username?.substring(0, 2).toUpperCase() || 'U'}
            </Avatar>
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {user?.username}
              </Typography>
              {roles.length > 0 && (
                <Chip
                  label={roles[0]}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                />
              )}
            </Box>
          </Box>

          {/* Botón Cerrar Sesión */}
          <Tooltip title="Cerrar Sesión">
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              onClick={handleLogout}
              startIcon={<LogoutIcon fontSize="small" />}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderColor: 'divider',
              }}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                Cerrar Sesión
              </Box>
            </Button>
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

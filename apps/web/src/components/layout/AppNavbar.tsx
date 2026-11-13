import React, { useState } from 'react';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import LogoutIcon from '@mui/icons-material/Logout';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { usePermissions } from '../../features/auth/hooks/usePermissions';
import { fetchAlertsSummary } from '../../features/alerts/api/alerts.api';
import { ChangePasswordDialog } from '../../features/auth/components/ChangePasswordDialog';
import type { AppEnvironmentInfo } from '../../app/useAppEnvironment';

interface AppNavbarProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  /** Ambiente informado por el API; sin él no se muestra etiqueta */
  environment?: AppEnvironmentInfo;
}

/**
 * Barra superior: marca, ambiente cuando no es producción, Nueva venta y Alertas (según el perfil)
 * y el menú del usuario con el cambio de contraseña y el cierre de sesión.
 */
export const AppNavbar: React.FC<AppNavbarProps> = ({
  onToggleSidebar,
  isSidebarOpen,
  environment: env,
}) => {
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState<HTMLElement | null>(null);
  const { user, logout } = useAuth();
  const { roles, hasPermission } = usePermissions();
  const environmentLabel = env?.label ?? null;
  const environment = env?.environment ?? null;

  const canCreateSale = hasPermission(SYSTEM_PERMISSIONS.SALES_CREATE);
  // Mismo criterio que el API (GET /alerts/summary) y que la pantalla de inicio
  const canReadAlerts =
    hasPermission(SYSTEM_PERMISSIONS.INVENTORY_READ) &&
    hasPermission(SYSTEM_PERMISSIONS.ALERTS_READ);

  const alertsSummary = useQuery({
    queryKey: ['alerts', 'summary'],
    queryFn: fetchAlertsSummary,
    enabled: canReadAlerts,
    refetchInterval: 30000,
  });
  const criticalCount = (alertsSummary.data?.vencidos ?? 0) + (alertsSummary.data?.criticos ?? 0);

  const initials = user?.username?.substring(0, 2).toUpperCase() || 'U';
  const roleLabel = roles[0];

  const handleLogout = async () => {
    setUserMenuAnchor(null);
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
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        zIndex: (theme) => theme.zIndex.drawer + 1,
      }}
    >
      <Toolbar
        sx={{ justifyContent: 'space-between', gap: 1, px: { xs: 1.5, md: 3 }, minHeight: 64 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <IconButton
            edge="start"
            color="inherit"
            aria-label={isSidebarOpen ? 'Ocultar menú de navegación' : 'Mostrar menú de navegación'}
            aria-expanded={isSidebarOpen}
            onClick={onToggleSidebar}
          >
            <MenuIcon />
          </IconButton>

          <Box
            component={RouterLink}
            to="/"
            aria-label="FarmaControl, ir a Inicio"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              color: 'inherit',
              textDecoration: 'none',
              borderRadius: 2,
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: 'primary.main',
                outlineOffset: 2,
              },
            }}
          >
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: 2,
                bgcolor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'primary.contrastText',
                flexShrink: 0,
              }}
            >
              <LocalPharmacyIcon sx={{ fontSize: '1.3rem' }} />
            </Box>
            <Typography
              component="span"
              variant="subtitle1"
              sx={{ fontWeight: 800, lineHeight: 1.1, display: { xs: 'none', sm: 'block' } }}
            >
              FarmaControl
            </Typography>
          </Box>

          {environmentLabel && environment !== 'produccion' && (
            <Chip
              label={environmentLabel}
              size="small"
              color="warning"
              variant="outlined"
              data-testid="navbar-environment"
              sx={{ fontWeight: 800, ml: 0.5 }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.75, sm: 1.5 } }}>
          {canCreateSale && (
            <Button
              component={RouterLink}
              to="/pos"
              variant="contained"
              size="small"
              startIcon={<AddShoppingCartIcon />}
              aria-label="Nueva venta"
              sx={{ minWidth: 0, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } } }}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                Nueva venta
              </Box>
            </Button>
          )}

          {canReadAlerts && (
            <Button
              component={RouterLink}
              to="/alerts"
              variant="outlined"
              size="small"
              color={criticalCount > 0 ? 'error' : 'inherit'}
              data-testid="topbar-alerts-btn"
              aria-label={
                criticalCount > 0
                  ? `Alertas de vencimiento: ${criticalCount} vencidos o críticos`
                  : 'Alertas de vencimiento'
              }
              startIcon={
                <Badge badgeContent={criticalCount} color="error" max={99}>
                  <NotificationsActiveIcon fontSize="small" />
                </Badge>
              }
              sx={{
                minWidth: 0,
                borderColor: criticalCount > 0 ? 'error.main' : 'divider',
                '& .MuiButton-startIcon': { mr: { xs: 0, md: 1 } },
              }}
            >
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                Alertas
              </Box>
            </Button>
          )}

          <Button
            color="inherit"
            onClick={(event) => setUserMenuAnchor(event.currentTarget)}
            aria-haspopup="menu"
            aria-expanded={Boolean(userMenuAnchor)}
            aria-controls={userMenuAnchor ? 'user-menu' : undefined}
            aria-label={`Menú de ${user?.username ?? 'usuario'}`}
            endIcon={<ExpandMoreIcon sx={{ display: { xs: 'none', md: 'block' } }} />}
            sx={{ px: 1, minWidth: 0, gap: 1 }}
          >
            <Avatar
              sx={{
                width: 32,
                height: 32,
                bgcolor: 'primary.dark',
                fontSize: '0.8rem',
                fontWeight: 700,
              }}
            >
              {initials}
            </Avatar>
            <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'left' }}>
              <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {user?.username}
              </Typography>
              {roleLabel && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: 'capitalize' }}
                >
                  {roleLabel}
                </Typography>
              )}
            </Box>
          </Button>
          <Menu
            id="user-menu"
            anchorEl={userMenuAnchor}
            open={Boolean(userMenuAnchor)}
            onClose={() => setUserMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { minWidth: 220, mt: 0.5 } } }}
          >
            <Box sx={{ px: 2, py: 1 }} aria-hidden>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {user?.username}
              </Typography>
              {roles.length > 0 && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: 'capitalize' }}
                >
                  {roles.join(', ')}
                </Typography>
              )}
            </Box>
            <Divider />
            <MenuItem
              onClick={() => {
                setUserMenuAnchor(null);
                setPasswordDialogOpen(true);
              }}
            >
              <ListItemIcon>
                <LockOutlinedIcon fontSize="small" />
              </ListItemIcon>
              Cambiar contraseña
            </MenuItem>
            <MenuItem onClick={() => void handleLogout()}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Cerrar sesión
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
      <ChangePasswordDialog
        open={passwordDialogOpen}
        onClose={() => setPasswordDialogOpen(false)}
      />
    </AppBar>
  );
};

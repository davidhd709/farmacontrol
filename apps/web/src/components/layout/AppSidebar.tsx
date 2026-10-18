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
import { menuGroups } from '../../app/navigation';
import { usePermissions } from '../../features/auth/hooks/usePermissions';

export const SIDEBAR_WIDTH = 260;

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();

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

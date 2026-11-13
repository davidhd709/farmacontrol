import React, { useEffect, useState } from 'react';
import {
  Box,
  Collapse,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  entryPermissions,
  menuGroupForPath,
  menuGroups,
  navigationForPath,
} from '../../app/navigation';
import type { AppEnvironmentInfo } from '../../app/useAppEnvironment';
import { usePermissions } from '../../features/auth/hooks/usePermissions';

export const SIDEBAR_WIDTH = 260;

const OPEN_GROUPS_KEY = 'farmacontrol.sidebar.openGroups';
/** Con pocos accesos (p. ej. un cajero) todos los grupos empiezan abiertos */
const FEW_ITEMS = 8;

function readOpenGroups(): string[] | null {
  try {
    const raw = window.localStorage.getItem(OPEN_GROUPS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : null;
  } catch {
    return null;
  }
}

function writeOpenGroups(ids: string[]) {
  try {
    window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(ids));
  } catch {
    // Sin almacenamiento (ventana privada): el menú funciona igual, solo no recuerda
  }
}

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
  /** Ambiente informado por el API; sin él no se muestra etiqueta */
  environment?: AppEnvironmentInfo;
}

const itemSx = {
  borderRadius: 2,
  py: 0.75,
  px: 1.5,
  '&.Mui-selected': {
    bgcolor: 'rgba(15, 118, 110, 0.10)',
    color: 'primary.dark',
    '&:hover': { bgcolor: 'rgba(15, 118, 110, 0.15)' },
  },
  '&.Mui-focusVisible': {
    outline: '2px solid',
    outlineColor: 'primary.main',
    outlineOffset: -2,
  },
} as const;

/**
 * Menú lateral agrupado por tarea. Cada grupo se pliega; el grupo de la pantalla actual se abre
 * solo y se marca con texto en negrita y una barra, no únicamente con color. Las entradas son
 * enlaces reales: se navegan con Tab/Enter, se abren en otra pestaña y conservan las URL.
 */
export const AppSidebar: React.FC<AppSidebarProps> = ({ open, onClose, environment: env }) => {
  const theme = useTheme();
  // Móvil y tablet (hasta 1199 px): menú temporal que se abre con el botón y se cierra al navegar
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'), { noSsr: true });
  const { pathname } = useLocation();
  const { hasAnyPermission } = usePermissions();
  const environmentLabel = env?.label ?? null;
  const environment = env?.environment ?? null;

  const visibleGroups = menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasAnyPermission(entryPermissions(item))),
    }))
    .filter((group) => group.items.length > 0);
  const totalItems = visibleGroups.reduce((sum, g) => sum + g.items.length, 0);
  const activeGroupId = menuGroupForPath(pathname)?.id;
  const activePath = navigationForPath(pathname)?.path;

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const stored = readOpenGroups();
    if (stored) return new Set(stored);
    // Sin preferencia guardada: con pocos accesos todo abierto; si no, el primer grupo del perfil
    // (Ventas para caja), así la tarea frecuente se ve sin abrir nada
    if (totalItems <= FEW_ITEMS) return new Set(visibleGroups.map((g) => g.id));
    return new Set(visibleGroups.slice(0, 1).map((g) => g.id));
  });

  // Al llegar a una pantalla (también por URL directa) su grupo queda visible
  useEffect(() => {
    if (!activeGroupId) return;
    setOpenGroups((current) =>
      current.has(activeGroupId) ? current : new Set([...current, activeGroupId]),
    );
  }, [activeGroupId]);

  const toggleGroup = (id: string) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeOpenGroups([...next]);
      return next;
    });
  };

  const closeOnMobile = () => {
    if (isMobile) onClose();
  };

  const drawerContent = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        color: 'text.primary',
      }}
    >
      <Box
        component="nav"
        aria-label="Menú principal"
        sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1.5 }}
      >
        <ListItemButton
          component={RouterLink}
          to="/"
          onClick={closeOnMobile}
          selected={pathname === '/'}
          aria-current={pathname === '/' ? 'page' : undefined}
          sx={{ ...itemSx, mb: 1 }}
        >
          <ListItemIcon
            sx={{ minWidth: 34, color: pathname === '/' ? 'primary.main' : 'text.secondary' }}
          >
            <HomeOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Inicio"
            slotProps={{
              primary: { sx: { fontSize: '0.9rem', fontWeight: pathname === '/' ? 700 : 600 } },
            }}
          />
        </ListItemButton>

        {visibleGroups.map((group) => {
          const isOpen = openGroups.has(group.id);
          const isActiveGroup = group.id === activeGroupId;
          const listId = `menu-group-${group.id}`;
          return (
            <Box key={group.id} sx={{ mb: 0.5 }}>
              <ListItemButton
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
                aria-controls={listId}
                sx={{
                  ...itemSx,
                  position: 'relative',
                  '&::before': isActiveGroup
                    ? {
                        content: '""',
                        position: 'absolute',
                        left: 0,
                        top: 8,
                        bottom: 8,
                        width: 3,
                        borderRadius: 2,
                        bgcolor: 'primary.main',
                      }
                    : undefined,
                }}
              >
                <ListItemIcon
                  sx={{ minWidth: 34, color: isActiveGroup ? 'primary.main' : 'text.secondary' }}
                >
                  {group.icon}
                </ListItemIcon>
                <ListItemText
                  primary={group.category}
                  slotProps={{
                    primary: {
                      sx: {
                        fontSize: '0.88rem',
                        fontWeight: isActiveGroup ? 800 : 600,
                        color: isActiveGroup ? 'primary.dark' : 'text.primary',
                      },
                    },
                  }}
                />
                <ExpandMoreIcon
                  fontSize="small"
                  aria-hidden
                  sx={{
                    color: 'text.secondary',
                    transition: 'transform 0.15s ease',
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                  }}
                />
              </ListItemButton>
              <Collapse in={isOpen} timeout="auto" unmountOnExit={false}>
                <List
                  id={listId}
                  disablePadding
                  aria-label={group.category}
                  sx={{ pl: 1.5, pt: 0.25 }}
                >
                  {group.items.map((item) => {
                    const isActive = item.path === activePath;
                    return (
                      <ListItemButton
                        key={item.path}
                        component={RouterLink}
                        to={item.path}
                        onClick={closeOnMobile}
                        selected={isActive}
                        aria-current={isActive ? 'page' : undefined}
                        tabIndex={isOpen ? 0 : -1}
                        sx={{ ...itemSx, mb: 0.25 }}
                      >
                        <ListItemIcon
                          sx={{ minWidth: 30, color: isActive ? 'primary.main' : 'text.secondary' }}
                        >
                          {item.icon}
                        </ListItemIcon>
                        <ListItemText
                          primary={item.title}
                          slotProps={{
                            primary: {
                              sx: { fontSize: '0.85rem', fontWeight: isActive ? 700 : 500 },
                            },
                          }}
                        />
                      </ListItemButton>
                    );
                  })}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}
        >
          FarmaControl v1.0
          {environmentLabel && (
            <>
              {' · '}
              <Box
                component="span"
                data-testid="sidebar-environment"
                sx={{
                  color: environment === 'produccion' ? 'text.secondary' : 'warning.main',
                  fontWeight: 800,
                }}
              >
                {environmentLabel}
              </Box>
            </>
          )}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box
      sx={{
        width: { lg: open ? SIDEBAR_WIDTH : 0 },
        flexShrink: { lg: 0 },
      }}
    >
      {isMobile ? (
        <Drawer
          variant="temporary"
          open={open}
          onClose={onClose}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', lg: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: SIDEBAR_WIDTH,
              maxWidth: '85vw',
              borderRight: 1,
              borderColor: 'divider',
              // La barra superior queda encima del menú temporal: el menú empieza debajo de ella
              top: 64,
              height: 'calc(100% - 64px)',
            },
          }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          variant="persistent"
          open={open}
          sx={{
            display: { xs: 'none', lg: 'block' },
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

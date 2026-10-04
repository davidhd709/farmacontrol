import React, { useState } from 'react';
import { Box, CircularProgress, useMediaQuery, useTheme } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { AppNavbar } from './AppNavbar';
import { AppSidebar, SIDEBAR_WIDTH } from './AppSidebar';

export const AppLayout: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(!isMobile);

  const handleToggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  const handleCloseSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: '#F8FAFC' }}>
      {/* Barra de Navegación Superior Fija */}
      <AppNavbar onToggleSidebar={handleToggleSidebar} isSidebarOpen={sidebarOpen} />

      {/* Contenedor con Sidebar + Área de Contenido */}
      <Box sx={{ display: 'flex', flex: 1, position: 'relative' }}>
        {/* Menú Lateral Profesional */}
        <AppSidebar open={sidebarOpen} onClose={handleCloseSidebar} />

        {/* Contenido Principal con Ancho Adaptativo */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            minWidth: 0,
            width: {
              xs: '100%',
              md: sidebarOpen ? `calc(100% - ${SIDEBAR_WIDTH}px)` : '100%',
            },
            p: { xs: 2, sm: 3 },
            maxWidth: '100%',
            overflowX: 'hidden',
          }}
        >
          <React.Suspense
            fallback={
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
                <CircularProgress size={32} />
              </Box>
            }
          >
            <Outlet />
          </React.Suspense>
        </Box>
      </Box>
    </Box>
  );
};

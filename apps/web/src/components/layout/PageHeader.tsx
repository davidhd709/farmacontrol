import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { HomeBackButton } from '../HomeBackButton';

/**
 * Encabezado de página común: título (h1, mismo tamaño en toda la app), descripción y acciones.
 * En móvil las acciones bajan debajo del título y ocupan el ancho; nunca se cortan.
 */
export function PageHeader({
  title,
  description,
  actions,
  backButton = true,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  backButton?: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        gap: 2,
        mb: 3,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0, flex: '1 1 320px' }}>
        {backButton && <HomeBackButton />}
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" variant="h4">
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
          )}
        </Box>
      </Box>
      {actions && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            width: { xs: '100%', sm: 'auto' },
            '& > *': { flex: { xs: '1 1 auto', sm: '0 0 auto' } },
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
}

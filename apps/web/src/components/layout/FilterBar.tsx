import type { FormEvent, ReactNode } from 'react';
import { Box, Paper, type SxProps, type Theme } from '@mui/material';

/**
 * Barra de filtros común (revisión responsive, 2026-11-02). Los campos van en una grilla que
 * se acomoda en varias filas: una columna en móvil, dos en tablet y columnas de 200 a 280 px
 * en escritorio, así un campo de fecha nunca ocupa todo el ancho. Las acciones (Consultar,
 * Filtrar, Limpiar) quedan juntas, alineadas a la derecha y separadas de los campos.
 */
export function FilterBar({
  children,
  actions,
  footer,
  onSubmit,
  sx,
}: {
  children: ReactNode;
  actions?: ReactNode;
  /** Contenido debajo de la grilla, p. ej. los atajos de fecha o un aviso */
  footer?: ReactNode;
  /** Con onSubmit la barra es un formulario: Enter en un campo consulta */
  onSubmit?: () => void;
  /** Margen respecto al contenido vecino (dentro de un Stack no hace falta) */
  sx?: SxProps<Theme>;
}) {
  const form = onSubmit
    ? {
        component: 'form' as const,
        noValidate: true,
        onSubmit: (event: FormEvent) => {
          event.preventDefault();
          onSubmit();
        },
      }
    : {};
  return (
    <Paper
      variant="outlined"
      sx={[{ p: 2, borderRadius: 2 }, ...(Array.isArray(sx) ? sx : [sx])]}
      {...form}
    >
      <Box
        role="search"
        sx={{
          display: 'grid',
          gap: 2,
          alignItems: 'center',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            sm: 'repeat(2, minmax(0, 1fr))',
            md: 'repeat(auto-fill, minmax(200px, 280px))',
          },
        }}
      >
        {children}
        {actions && (
          <Box
            sx={{
              gridColumn: '1 / -1',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              justifyContent: { xs: 'stretch', sm: 'flex-end' },
              '& > *': { flex: { xs: '1 1 auto', sm: '0 0 auto' } },
            }}
          >
            {actions}
          </Box>
        )}
      </Box>
      {footer && <Box sx={{ mt: 1.5 }}>{footer}</Box>}
    </Paper>
  );
}

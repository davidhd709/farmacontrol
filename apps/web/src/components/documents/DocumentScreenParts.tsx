import React from 'react';
import {
  Box,
  Chip,
  Table,
  TableBody,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

/*
 * Piezas de la vista en pantalla de los documentos (no se imprimen): campos con etiqueta,
 * tablas y totales con el estilo del sistema. La hoja formal de cada documento va aparte,
 * dentro de un contenedor `print-only`.
 */

export const ScreenField: React.FC<{
  label: string;
  testId?: string;
  wide?: boolean;
  children: React.ReactNode;
}> = ({ label, testId, wide, children }) => (
  <Box data-testid={testId} sx={wide ? { gridColumn: { sm: '1 / -1' } } : undefined}>
    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
      {label}
    </Typography>
    <Typography component="div" variant="body2" sx={{ fontWeight: 600, mt: 0.25 }}>
      {children}
    </Typography>
  </Box>
);

export const ScreenFields: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
      gap: 2,
      mb: 2.5,
    }}
  >
    {children}
  </Box>
);

export const ScreenTable: React.FC<{
  title: string;
  head: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ title, head, children, footer }) => (
  <Box sx={{ mb: 2.5 }}>
    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
      {title}
    </Typography>
    <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Table size="small">
        <TableHead>
          <TableRow>{head}</TableRow>
        </TableHead>
        <TableBody>{children}</TableBody>
        {footer}
      </Table>
    </TableContainer>
  </Box>
);

export interface ScreenTotalRow {
  label: string;
  value: string;
  strong?: boolean;
}

export const ScreenTotals: React.FC<{ rows: ScreenTotalRow[] }> = ({ rows }) => (
  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
    <Box component="dl" sx={{ m: 0, minWidth: { xs: '100%', sm: 320 } }}>
      {rows.map((row) => (
        <Box
          key={row.label}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 2,
            py: 0.5,
            ...(row.strong && { borderTop: 1, borderColor: 'divider', mt: 0.5, pt: 1 }),
          }}
        >
          <Typography
            component="dt"
            variant="body2"
            sx={{ color: row.strong ? 'text.primary' : 'text.secondary', fontWeight: 600 }}
          >
            {row.label}
          </Typography>
          <Typography
            component="dd"
            variant={row.strong ? 'subtitle1' : 'body2'}
            sx={{ m: 0, fontWeight: row.strong ? 700 : 600 }}
          >
            {row.value}
          </Typography>
        </Box>
      ))}
    </Box>
  </Box>
);

/** Estado de un abono o pago aplicado: el texto lo dice, el color solo lo acompaña. */
export const AppliedChip: React.FC<{ reversed: boolean; appliedLabel?: string }> = ({
  reversed,
  appliedLabel = 'Aplicado',
}) => (
  <Chip
    size="small"
    variant="outlined"
    color={reversed ? 'error' : 'success'}
    label={reversed ? 'Revertido' : appliedLabel}
  />
);

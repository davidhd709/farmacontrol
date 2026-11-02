import type React from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import type { DocumentMovementDto } from '@farmacia/contracts';
import { DocumentMovementsTable } from './DocumentMovementsTable';

/** Estado de una factura (cartera o cuentas por pagar): resumen y todos sus movimientos. */
export function DocumentMovementsDialog({
  title,
  loading,
  error,
  summary,
  movements,
  creditLabel,
  onReverse,
  footer,
  onClose,
}: {
  title: string;
  loading: boolean;
  error: Error | null;
  summary: Array<{ label: string; value: React.ReactNode }>;
  movements: DocumentMovementDto[] | undefined;
  creditLabel?: string;
  onReverse?: (movement: DocumentMovementDto) => void;
  footer?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth aria-labelledby="document-movements-title">
      <DialogTitle id="document-movements-title" sx={{ fontWeight: 700 }}>
        {title}
      </DialogTitle>
      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {error && <Alert severity="error">{error.message}</Alert>}
        {movements && (
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {summary.map((item) => (
                <Box key={item.label}>
                  <Typography variant="caption" color="text.secondary">
                    {item.label}
                  </Typography>
                  <Typography sx={{ fontWeight: 600 }}>{item.value}</Typography>
                </Box>
              ))}
            </Stack>
            <DocumentMovementsTable movements={movements} creditLabel={creditLabel} onReverse={onReverse} />
            {footer}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

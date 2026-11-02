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
import { useQuery } from '@tanstack/react-query';
import { fetchReceivableMovements } from '../api/receivables.api';
import { DocumentMovementsTable, formatMoney } from '../../../components/DocumentMovementsTable';
import { getStatusDisplay } from '../utils/status';

/** "Ver abonos": todos los movimientos de una factura a crédito, de solo lectura. */
export function ReceivableMovementsDialog({
  receivableId,
  onClose,
}: {
  receivableId: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['receivable-movements', receivableId],
    queryFn: () => fetchReceivableMovements(receivableId),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="md"
      fullWidth
      aria-labelledby="receivable-movements-title"
    >
      <DialogTitle id="receivable-movements-title" sx={{ fontWeight: 700 }}>
        Abonos de la factura {data?.invoiceNumber ?? ''}
      </DialogTitle>
      <DialogContent dividers>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {isError && <Alert severity="error">{(error as Error).message}</Alert>}
        {data && (
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Cliente
                </Typography>
                <Typography sx={{ fontWeight: 600 }}>{data.customerName ?? '—'}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Vence
                </Typography>
                <Typography sx={{ fontWeight: 600 }}>{data.dueDate}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Estado
                </Typography>
                <Typography sx={{ fontWeight: 600 }}>
                  {getStatusDisplay(data.status).label}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Abonado
                </Typography>
                <Typography sx={{ fontWeight: 600 }}>{formatMoney(data.amountPaid)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Saldo
                </Typography>
                <Typography sx={{ fontWeight: 800 }}>{formatMoney(data.balance)}</Typography>
              </Box>
            </Stack>
            <DocumentMovementsTable movements={data.movements} />
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

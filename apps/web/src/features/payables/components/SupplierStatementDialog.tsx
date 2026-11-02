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
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { fetchPayableStatement } from '../api/payables.api';
import { AgingSummaryCards, PayableStatementTable } from './PayableStatementTable';

/** "Estado de cuenta" del proveedor: todas sus facturas y causaciones, saldadas o no. */
export function SupplierStatementDialog({
  supplierId,
  supplierName,
  onClose,
}: {
  supplierId: string;
  supplierName: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['payables-statement', supplierId, 'all'],
    queryFn: () => fetchPayableStatement({ supplierId, includePaid: true }),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      aria-labelledby="supplier-statement-title"
    >
      <DialogTitle id="supplier-statement-title" sx={{ fontWeight: 700 }}>
        Estado de cuenta — {supplierName}
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
            <AgingSummaryCards aging={data.aging} />
            <PayableStatementTable items={data.items} />
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

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type {
  PayableStatementFilters,
  PayableStatementItemDto,
  ThirdPartyDto,
} from '@farmacia/contracts';
import { fetchPayableStatement } from '../api/payables.api';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { AgingSummaryCards } from '../../../components/AgingSummaryCards';
import { ThirdPartyAutocomplete } from '../../third-parties/components/ThirdPartyAutocomplete';
import { PayableStatementTable } from '../components/PayableStatementTable';
import { PayableMovementsDialog } from '../components/PayableMovementsDialog';
import { ExpenseMovementsDialog } from '../../expenses/components/ExpenseMovementsDialog';

/**
 * Cuentas por pagar: facturas de compra y causaciones de gasto. No muestra nada hasta que se
 * consulta por proveedor o por rango de fechas; clasifica los saldos por edad con los mismos
 * rangos que la cartera de clientes. Los pagos se registran con comprobantes de egreso.
 */
export function PayablesPage() {
  const [supplier, setSupplier] = useState<ThirdPartyDto | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [includePaid, setIncludePaid] = useState(false);
  const [query, setQuery] = useState<PayableStatementFilters | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PayableStatementItemDto | null>(null);

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['payables-statement', query],
    queryFn: () => fetchPayableStatement(query!),
    enabled: query !== null,
  });

  const consult = () => {
    if (supplier && !supplier.supplierId) {
      setFormError('El tercero elegido no está registrado como proveedor.');
      return;
    }
    if (!supplier && !fromDate && !toDate) {
      setFormError('Elige un proveedor o un rango de fechas para consultar.');
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      setFormError('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }
    setFormError(null);
    setQuery({
      supplierId: supplier?.supplierId ?? undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      includePaid: includePaid || undefined,
    });
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <HomeBackButton />
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Cuentas por Pagar
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Facturas de compra y causaciones de gasto por proveedor. Los pagos se registran con un
            comprobante de egreso.
          </Typography>
        </Box>
      </Box>

      <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Stack
          component="form"
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { md: 'flex-start' } }}
          onSubmit={(e) => {
            e.preventDefault();
            consult();
          }}
        >
          <Box sx={{ flex: 2, minWidth: 260 }}>
            <ThirdPartyAutocomplete
              value={supplier}
              onChange={setSupplier}
              role="SUPPLIER"
              label="Proveedor"
              showQuickCreate={false}
            />
          </Box>
          <TextField
            label="Fecha desde"
            type="date"
            size="small"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Fecha hasta"
            type="date"
            size="small"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <FormControlLabel
            control={
              <Checkbox checked={includePaid} onChange={(e) => setIncludePaid(e.target.checked)} />
            }
            label="Incluir saldadas"
            sx={{ whiteSpace: 'nowrap' }}
          />
          <Button type="submit" variant="contained" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
            Consultar
          </Button>
        </Stack>
        {formError && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {formError}
          </Alert>
        )}
      </Paper>

      {query === null ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <Typography color="text.secondary">
            Consulta por proveedor o por fecha desde / hasta para ver sus cuentas por pagar.
          </Typography>
        </Paper>
      ) : isFetching && !data ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : isError ? (
        <Alert severity="error">{(error as Error).message}</Alert>
      ) : (
        data && (
          <Stack spacing={2}>
            <AgingSummaryCards aging={data.aging} />
            <Paper variant="outlined" sx={{ borderRadius: 2 }}>
              <PayableStatementTable
                items={data.items}
                showSupplier={!query.supplierId}
                actions={(item) => (
                  <Button size="small" variant="outlined" onClick={() => setDetail(item)}>
                    Detalle
                  </Button>
                )}
              />
            </Paper>
          </Stack>
        )
      )}

      {detail?.documentType === 'FACTURA_COMPRA' && (
        <PayableMovementsDialog payableId={detail.documentId} onClose={() => setDetail(null)} />
      )}
      {detail?.documentType === 'CAUSACION_GASTO' && (
        <ExpenseMovementsDialog expenseId={detail.documentId} onClose={() => setDetail(null)} />
      )}
    </Box>
  );
}

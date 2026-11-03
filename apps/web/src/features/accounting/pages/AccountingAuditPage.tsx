import { useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { AccountingAuditView } from '@farmacia/contracts';
import { fetchAccountingAudit } from '../api/accounting.api';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { QuickDateRange } from '../../../components/QuickDateRange';
import { formatDate } from '../../../utils/date-format';
import { DateField } from '../../../components/DateField';

/** Tipo de documento de origen de un asiento, en español. */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  SALE: 'Venta',
  SALE_CANCEL: 'Anulación de venta',
  CREDIT_NOTE: 'Nota crédito',
  DEBIT_NOTE: 'Nota débito',
  PURCHASE: 'Compra',
  RECEIVABLE_PAYMENT: 'Abono de cartera (recibo de caja)',
  PAYABLE_PAYMENT: 'Pago a proveedor (egreso)',
  EXPENSE: 'Causación de gasto',
  EXPENSE_PAYMENT: 'Pago de causación (egreso)',
  CASH_MOVEMENT: 'Recibo / egreso manual de caja',
  BANK_MOVEMENT: 'Recibo / egreso manual de bancos',
  TREASURY_DOCUMENT: 'Recibo de caja / comprobante de egreso',
  INVENTORY_ADJUSTMENT: 'Ajuste de inventario',
  MANUAL_NOTE: 'Nota contable',
  REVERSAL: 'Reversión',
};

const typeLabel = (type: string) => DOCUMENT_TYPE_LABELS[type] ?? type;
const money = (value: string) =>
  `$${Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Auditoría contable: documentos descuadrados (débitos ≠ créditos, o recibos y egresos cuyo
 * valor no coincide con lo aplicado a facturas) y documentos anulados, por fecha y tipo.
 */
export function AccountingAuditPage() {
  const [view, setView] = useState<AccountingAuditView>('DESCUADRADOS');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [documentType, setDocumentType] = useState('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['accounting-audit', view, fromDate, toDate, documentType],
    queryFn: () =>
      fetchAccountingAudit({
        view,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        documentType: documentType || undefined,
      }),
  });
  const documentTypes = [...new Set([...(data?.documentTypes ?? []), 'TREASURY_DOCUMENT'])];
  const unbalanced = view === 'DESCUADRADOS';

  return (
    <Box sx={{ py: { xs: 1, md: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <HomeBackButton />
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Auditoría Contable
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Documentos descuadrados y documentos anulados o revertidos.
          </Typography>
        </Box>
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 2, mb: 3 }}>
        <Tabs
          value={view}
          onChange={(_, value: AccountingAuditView) => setView(value)}
          aria-label="Vista de auditoría"
          sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="DESCUADRADOS" label="Descuadrados" />
          <Tab value="ANULADOS" label="Anulados" />
        </Tabs>
        <Box sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <DateField
              label="Desde"
              size="small"
              value={fromDate}
              onChange={(value) => setFromDate(value)}
            />
            <DateField
              label="Hasta"
              size="small"
              value={toDate}
              onChange={(value) => setToDate(value)}
            />
            <TextField
              select
              label="Tipo de documento"
              size="small"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              sx={{ minWidth: 260 }}
            >
              <MenuItem value="">Todos</MenuItem>
              {documentTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {typeLabel(type)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Box sx={{ mt: 1.5 }}>
            <QuickDateRange
              onSelect={({ from, to }) => {
                setFromDate(from);
                setToDate(to);
              }}
            />
          </Box>
        </Box>
      </Paper>

      {isError && <Alert severity="error">{(error as Error).message}</Alert>}
      {data?.truncated && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Se muestran los primeros {data.maxRows} documentos: hay más. Acota el rango de fechas o el
          tipo de documento para verlos todos.
        </Alert>
      )}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        data &&
        (data.items.length === 0 ? (
          <Alert severity={unbalanced ? 'success' : 'info'} variant="outlined">
            {unbalanced
              ? 'No hay documentos descuadrados para los filtros seleccionados: débitos y créditos coinciden.'
              : 'No hay documentos anulados para los filtros seleccionados.'}
          </Alert>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table
              size="small"
              aria-label={unbalanced ? 'Documentos descuadrados' : 'Documentos anulados'}
            >
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Fecha</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Tipo de documento</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Descripción</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    {unbalanced ? 'Débitos / valor' : 'Valor'}
                  </TableCell>
                  {unbalanced && (
                    <>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        Créditos / aplicado
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        Diferencia
                      </TableCell>
                    </>
                  )}
                  {!unbalanced && (
                    <>
                      <TableCell sx={{ fontWeight: 700 }}>Anulado el</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Motivo</TableCell>
                    </>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow
                    key={`${item.documentType}-${item.documentId}-${item.reversalEntryId ?? ''}`}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(item.date)}</TableCell>
                    <TableCell>
                      {typeLabel(item.documentType)}
                      {item.documentNumber && (
                        <Typography
                          variant="caption"
                          sx={{ display: 'block', fontFamily: 'monospace' }}
                        >
                          {item.documentNumber}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell align="right">{money(item.totalDebit)}</TableCell>
                    {unbalanced ? (
                      <>
                        <TableCell align="right">{money(item.totalCredit)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main' }}>
                          {money(item.difference)}
                          {item.lineCount < 2 && item.journalEntryId && (
                            <Typography variant="caption" sx={{ display: 'block' }}>
                              Sin contrapartida
                            </Typography>
                          )}
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {item.reversalDate ?? '—'}
                        </TableCell>
                        <TableCell>{item.reversalReason ?? '—'}</TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ))
      )}
    </Box>
  );
}

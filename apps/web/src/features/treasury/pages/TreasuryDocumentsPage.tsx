import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { TreasuryDocumentDto, TreasuryDocumentType } from '@farmacia/contracts';
import { getTreasuryDocuments } from '../api/treasury.api';

const LABELS: Record<TreasuryDocumentType, { title: string; singular: string; description: string }> = {
  RECIBO_CAJA: {
    title: 'Recibos de Caja',
    singular: 'Recibo de caja',
    description: 'Un recibo por cada ingreso de dinero a caja o bancos: ventas, abonos de cartera e ingresos manuales.',
  },
  COMPROBANTE_EGRESO: {
    title: 'Comprobantes de Egreso',
    singular: 'Comprobante de egreso',
    description: 'Un comprobante por cada salida de dinero: pagos a proveedores, gastos, devoluciones y comisiones.',
  },
};

const money = (value: string) =>
  `$${Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Apartados independientes de recibos de caja y comprobantes de egreso (acuerdo del 4 de
 * octubre). Cada documento se genera con el movimiento de caja o banco que respalda.
 */
export function TreasuryDocumentsPage({ type }: { type: TreasuryDocumentType }) {
  const labels = LABELS[type];
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<TreasuryDocumentDto | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['treasury-documents', type, fromDate, toDate, search, page, pageSize],
    queryFn: () =>
      getTreasuryDocuments({
        type,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search: search || undefined,
        page: page + 1,
        pageSize,
      }),
  });

  return (
    <Container component="main" maxWidth="xl" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
            {labels.title}
          </Typography>
          <Typography color="text.secondary">{labels.description}</Typography>
        </Box>

        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Desde"
              type="date"
              size="small"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(0);
              }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Hasta"
              type="date"
              size="small"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(0);
              }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Buscar número, concepto o documento"
              size="small"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              sx={{ flexGrow: 1 }}
            />
          </Stack>
        </Paper>

        {isError && <Alert severity="error">{(error as Error).message}</Alert>}

        <TableContainer component={Paper}>
          <Table size="small" aria-label={labels.title}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Número</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Fecha</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Tercero</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Concepto</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Auxiliar</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Documento origen</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Valor
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : !data?.items.length ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    No hay documentos para los filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((doc) => (
                  <TableRow key={doc.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelected(doc)}>
                    <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                      <Button size="small" onClick={() => setSelected(doc)} sx={{ p: 0, minWidth: 0 }}>
                        {doc.documentNumber}
                      </Button>
                    </TableCell>
                    <TableCell>{doc.documentDate}</TableCell>
                    <TableCell>{doc.thirdPartyName ?? '—'}</TableCell>
                    <TableCell>{doc.concept}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={doc.source === 'CAJA' ? 'Caja' : (doc.bankAccountName ?? 'Banco')}
                      />
                    </TableCell>
                    <TableCell>
                      {doc.referenceDocumentType
                        ? `${doc.referenceDocumentType} ${doc.referenceDocumentId ?? ''}`
                        : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {money(doc.amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={data?.total ?? 0}
            page={page}
            onPageChange={(_, next) => setPage(next)}
            rowsPerPage={pageSize}
            onRowsPerPageChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            rowsPerPageOptions={[25, 50, 100]}
            labelRowsPerPage="Filas por página"
          />
        </TableContainer>
      </Stack>

      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="sm" fullWidth>
        {selected && (
          <>
            <DialogTitle sx={{ fontWeight: 700 }}>
              {labels.singular} {selected.documentNumber}
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={1}>
                <Typography>
                  <strong>Fecha:</strong> {selected.documentDate}
                </Typography>
                <Typography>
                  <strong>{type === 'RECIBO_CAJA' ? 'Recibido de' : 'Pagado a'}:</strong>{' '}
                  {selected.thirdPartyName ?? '—'}
                </Typography>
                <Typography>
                  <strong>Concepto:</strong> {selected.concept}
                </Typography>
                <Typography>
                  <strong>Valor:</strong> {money(selected.amount)}
                </Typography>
                <Typography>
                  <strong>Medio:</strong>{' '}
                  {selected.source === 'CAJA' ? `Caja (${selected.paymentMethod})` : selected.bankAccountName}
                </Typography>
                <Typography>
                  <strong>Documento origen:</strong>{' '}
                  {selected.referenceDocumentType
                    ? `${selected.referenceDocumentType} ${selected.referenceDocumentId ?? ''}`
                    : '—'}
                </Typography>
                <Typography>
                  <strong>Elaborado por:</strong> {selected.createdByName ?? '—'}
                </Typography>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => window.print()}>Imprimir</Button>
              <Button variant="contained" onClick={() => setSelected(null)}>
                Cerrar
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Container>
  );
}

export const CashReceiptsPage = () => <TreasuryDocumentsPage type="RECIBO_CAJA" />;
export const DisbursementVouchersPage = () => <TreasuryDocumentsPage type="COMPROBANTE_EGRESO" />;

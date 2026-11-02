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
import type {
  TreasuryDocumentApplicationDto,
  TreasuryDocumentDto,
  TreasuryDocumentType,
} from '@farmacia/contracts';
import { getTreasuryDocuments } from '../api/treasury.api';
import { QuickDateRange } from '../../../components/QuickDateRange';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { SweetModal } from '../../../components/SweetModal';
import { VoucherFormDialog } from '../components/VoucherFormDialog';

const LABELS: Record<
  TreasuryDocumentType,
  { title: string; singular: string; description: string; create: string }
> = {
  RECIBO_CAJA: {
    title: 'Recibos de Caja',
    singular: 'Recibo de caja',
    description:
      'Único registro de ingresos manuales de dinero, en efectivo o transferencia: abonos de clientes a sus facturas a crédito e ingresos de contado.',
    create: 'Nuevo recibo de caja',
  },
  COMPROBANTE_EGRESO: {
    title: 'Comprobantes de Egreso',
    singular: 'Comprobante de egreso',
    description:
      'Único registro de egresos de dinero, en efectivo o transferencia: pagos de facturas de compra y causaciones de gasto, y egresos manuales.',
    create: 'Nuevo comprobante de egreso',
  },
};

const ORIGIN_LABELS: Record<TreasuryDocumentDto['origin'], string> = {
  AUTOMATICO: 'Automático',
  MANUAL: 'Manual',
  CARTERA: 'Abono a cartera',
  PROVEEDOR: 'Pago a proveedor',
};

const REFERENCE_LABELS: Record<string, string> = {
  SALE: 'Venta',
  SALE_CANCEL: 'Anulación de venta',
  CREDIT_NOTE: 'Nota crédito',
  RECEIVABLE: 'Cartera',
  RECEIVABLE_PAYMENT: 'Abono de cartera',
  RECEIVABLE_PAYMENT_REVERSAL: 'Reversión de abono',
  PAYABLE: 'Cuenta por pagar',
  PAYABLE_PAYMENT: 'Pago a proveedor',
  PAYABLE_PAYMENT_REVERSAL: 'Reversión de pago',
  EXPENSE: 'Gasto',
  EXPENSE_CANCEL: 'Anulación de gasto',
  EXPENSE_PAYMENT: 'Pago de gasto',
  EXPENSE_PAYMENT_REVERSAL: 'Reversión de pago de gasto',
};

const APPLICATION_LABELS: Record<TreasuryDocumentApplicationDto['documentType'], string> = {
  FACTURA_VENTA: 'Factura de venta',
  FACTURA_COMPRA: 'Factura de compra',
  CAUSACION_GASTO: 'Causación de gasto',
};

const originOf = (doc: TreasuryDocumentDto) => {
  if (doc.applications.length) {
    return doc.applications
      .map((a) => a.documentNumber ?? APPLICATION_LABELS[a.documentType])
      .join(', ');
  }
  if (doc.referenceDocumentType && doc.referenceDocumentType !== 'TREASURY_DOCUMENT') {
    return `${REFERENCE_LABELS[doc.referenceDocumentType] ?? doc.referenceDocumentType} ${doc.referenceDocumentId ?? ''}`;
  }
  return ORIGIN_LABELS[doc.origin];
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
  const [formOpen, setFormOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <HomeBackButton />
            <Box>
              <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
                {labels.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {labels.description}
              </Typography>
            </Box>
          </Box>
          <Button
            variant="contained"
            onClick={() => setFormOpen(true)}
            sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            {labels.create}
          </Button>
        </Stack>

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
          <Box sx={{ mt: 1.5 }}>
            <QuickDateRange
              onSelect={({ from, to }) => {
                setFromDate(from);
                setToDate(to);
                setPage(0);
              }}
            />
          </Box>
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
                <TableCell sx={{ fontWeight: 700 }}>Origen / facturas</TableCell>
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
                  <TableRow
                    key={doc.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setSelected(doc)}
                  >
                    <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                      <Button
                        size="small"
                        onClick={() => setSelected(doc)}
                        sx={{ p: 0, minWidth: 0 }}
                      >
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
                    <TableCell>{originOf(doc)}</TableCell>
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

      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { className: 'print-document' } }}
      >
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
                  {selected.source === 'CAJA'
                    ? `Caja (${selected.paymentMethod})`
                    : selected.bankAccountName}
                </Typography>
                <Typography>
                  <strong>Origen:</strong> {ORIGIN_LABELS[selected.origin]}
                </Typography>
                {selected.counterpartAccount && (
                  <Typography>
                    <strong>Contrapartida:</strong> {selected.counterpartAccount}
                  </Typography>
                )}
                {selected.applications.length > 0 ? (
                  <Table size="small" aria-label="Facturas aplicadas">
                    <TableHead>
                      <TableRow>
                        <TableCell>Documento</TableCell>
                        <TableCell align="right">Valor</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selected.applications.map((a) => (
                        <TableRow key={`${a.documentType}-${a.documentId}`}>
                          <TableCell>
                            {APPLICATION_LABELS[a.documentType]} {a.documentNumber ?? ''}
                            {a.isReversed ? ' (revertido)' : ''}
                          </TableCell>
                          <TableCell align="right">{money(a.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Typography>
                    <strong>Documento origen:</strong> {originOf(selected)}
                  </Typography>
                )}
                <Typography>
                  <strong>Elaborado por:</strong> {selected.createdByName ?? '—'}
                </Typography>
              </Stack>
            </DialogContent>
            <DialogActions className="no-print">
              <Button onClick={() => window.print()}>Imprimir</Button>
              <Button variant="contained" onClick={() => setSelected(null)}>
                Cerrar
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <VoucherFormDialog
        type={type}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={(document) => {
          setFormOpen(false);
          setToast(
            `${labels.singular} ${document.documentNumber} registrado por ${money(document.amount)}.`,
          );
          setSelected(document);
        }}
      />

      <SweetModal
        open={Boolean(toast)}
        type="success"
        title="¡Buen trabajo!"
        text={toast ?? ''}
        confirmText="OK"
        onConfirm={() => setToast(null)}
        onClose={() => setToast(null)}
      />
    </Container>
  );
}

export const CashReceiptsPage = () => <TreasuryDocumentsPage type="RECIBO_CAJA" />;
export const DisbursementVouchersPage = () => <TreasuryDocumentsPage type="COMPROBANTE_EGRESO" />;

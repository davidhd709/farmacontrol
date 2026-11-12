import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Link,
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SYSTEM_PERMISSIONS,
  type TreasuryDocumentApplicationDto,
  type TreasuryDocumentDto,
  type TreasuryDocumentType,
} from '@farmacia/contracts';
import { cancelTreasuryDocument, getTreasuryDocuments } from '../api/treasury.api';
import { QuickDateRange } from '../../../components/QuickDateRange';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { SweetModal } from '../../../components/SweetModal';
import { VoucherFormDialog } from '../components/VoucherFormDialog';
import { usePermissions } from '../../auth/hooks/usePermissions';
import { formatDate } from '../../../utils/date-format';
import { DateField } from '../../../components/DateField';
import { TreasuryDocumentPrintDialog } from '../../../components/documents/TreasuryDocumentPrintDialog';
import { TreasuryDocumentCorrectionDialog } from '../components/TreasuryDocumentCorrectionDialog';

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
  const [correctionDoc, setCorrectionDoc] = useState<TreasuryDocumentDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [annulReason, setAnnulReason] = useState('');
  const [annulOpen, setAnnulOpen] = useState(false);
  const [annulError, setAnnulError] = useState<string | null>(null);
  const [annulling, setAnnulling] = useState(false);
  const queryClient = useQueryClient();
  const { hasPermission, hasAnyPermission } = usePermissions();
  // El recibo se registra con abono a cartera o manual; el egreso con su permiso
  const canCreate =
    type === 'RECIBO_CAJA'
      ? hasAnyPermission([
          SYSTEM_PERMISSIONS.CASH_RECEIPTS_COLLECT,
          SYSTEM_PERMISSIONS.CASH_RECEIPTS_MANUAL,
        ])
      : hasPermission(SYSTEM_PERMISSIONS.DISBURSEMENTS_CREATE);

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

  // Anular exige su propio permiso (el manual, además el contable); los automáticos, desde su documento
  const canAnnul = (doc: TreasuryDocumentDto) =>
    doc.status === 'VIGENTE' &&
    doc.origin !== 'AUTOMATICO' &&
    hasPermission(
      doc.documentType === 'COMPROBANTE_EGRESO'
        ? SYSTEM_PERMISSIONS.DISBURSEMENTS_ANNUL
        : SYSTEM_PERMISSIONS.CASH_RECEIPTS_ANNUL,
    ) &&
    (doc.origin !== 'MANUAL' || hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_READ));

  const annul = async () => {
    if (!selected) return;
    setAnnulling(true);
    setAnnulError(null);
    try {
      const updated = await cancelTreasuryDocument(selected, annulReason.trim());
      setSelected(updated);
      setAnnulOpen(false);
      setAnnulReason('');
      setToast(`${labels.singular} ${updated.documentNumber} anulado.`);
      for (const key of [
        'treasury-documents',
        'receivables',
        'payables-statement',
        'expenses',
        'cash',
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    } catch (e) {
      setAnnulError(e instanceof Error ? e.message : 'No se pudo anular el documento.');
    } finally {
      setAnnulling(false);
    }
  };

  return (
    <Container component="main" maxWidth="xl" sx={{ py: { xs: 1, md: 2 } }}>
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
          {canCreate && (
            <Button
              variant="contained"
              onClick={() => setFormOpen(true)}
              sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              {labels.create}
            </Button>
          )}
        </Stack>

        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <DateField
              label="Desde"
              size="small"
              value={fromDate}
              onChange={(value) => {
                setFromDate(value);
                setPage(0);
              }}
            />
            <DateField
              label="Hasta"
              size="small"
              value={toDate}
              onChange={(value) => {
                setToDate(value);
                setPage(0);
              }}
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
                      <Link
                        component="button"
                        type="button"
                        underline="hover"
                        onClick={() => setSelected(doc)}
                        sx={{ fontWeight: 700, fontFamily: 'monospace' }}
                      >
                        {doc.documentNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(doc.documentDate)}</TableCell>
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
                      {originOf(doc)}
                      {doc.status === 'ANULADO' && (
                        <Chip size="small" variant="outlined" label="Anulado" sx={{ ml: 1 }} />
                      )}
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
          />
        </TableContainer>
      </Stack>

      {/* Modal Imprimible de Recibos y Comprobantes (REQ-010) */}
      <TreasuryDocumentPrintDialog
        open={!!selected}
        document={selected}
        onClose={() => {
          setSelected(null);
          setAnnulOpen(false);
          setAnnulError(null);
          setAnnulReason('');
        }}
        actions={
          selected && canAnnul(selected) ? (
            annulOpen ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                {annulError && (
                  <Alert severity="error" sx={{ py: 0, px: 1 }}>
                    {annulError}
                  </Alert>
                )}
                <TextField
                  size="small"
                  label="Motivo de la anulación *"
                  value={annulReason}
                  onChange={(e) => setAnnulReason(e.target.value)}
                  placeholder="Mínimo 3 caracteres…"
                  disabled={annulling}
                  sx={{ width: 220 }}
                />
                <Button
                  color="error"
                  variant="contained"
                  disabled={annulling || annulReason.trim().length < 3}
                  onClick={() => void annul()}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  {annulling ? 'Anulando…' : 'Confirmar anulación'}
                </Button>
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={() => setAnnulOpen(false)}
                  disabled={annulling}
                  sx={{ textTransform: 'none' }}
                >
                  Cancelar
                </Button>
              </Stack>
            ) : (
              <Stack direction="row" spacing={1}>
                <Button
                  color="warning"
                  variant="outlined"
                  onClick={() => {
                    const toCorrect = selected;
                    setSelected(null);
                    setCorrectionDoc(toCorrect);
                  }}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Corregir Documento
                </Button>
                <Button
                  color="error"
                  variant="outlined"
                  onClick={() => setAnnulOpen(true)}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Anular Documento
                </Button>
              </Stack>
            )
          ) : undefined
        }
      />

      <TreasuryDocumentCorrectionDialog
        open={!!correctionDoc}
        document={correctionDoc}
        onClose={() => setCorrectionDoc(null)}
        onSuccess={(newDocument) => {
          setCorrectionDoc(null);
          setToast(
            `${labels.singular} corregido exitosamente. Se emitió el reemplazo ${newDocument.documentNumber}.`,
          );
          for (const key of [
            'treasury-documents',
            'receivables',
            'payables-statement',
            'expenses',
            'cash',
          ]) {
            void queryClient.invalidateQueries({ queryKey: [key] });
          }
          setSelected(newDocument);
        }}
      />

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

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Link,
  MenuItem,
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
  type TreasuryDocumentStatus,
  type TreasuryDocumentType,
} from '@farmacia/contracts';
import {
  cancelTreasuryDocument,
  exportTreasuryDocuments,
  getTreasuryDocuments,
} from '../api/treasury.api';
import { QuickDateRange } from '../../../components/QuickDateRange';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { SweetModal } from '../../../components/SweetModal';
import { VoucherFormDialog } from '../components/VoucherFormDialog';
import { usePermissions } from '../../auth/hooks/usePermissions';
import { formatDate } from '../../../utils/date-format';
import { DateField } from '../../../components/DateField';
import { TreasuryDocumentPrintDialog } from '../../../components/documents/TreasuryDocumentPrintDialog';
import { TreasuryDocumentCorrectionDialog } from '../components/TreasuryDocumentCorrectionDialog';
import { treasuryDocumentActions } from '../treasury-document-actions';
import { StatusChip } from '../../../components/StatusChip';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';

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
  if (doc.referenceDocumentType === 'TREASURY_DOCUMENT_CANCEL') {
    return 'Devolución por anulación';
  }
  if (doc.referenceDocumentType && doc.referenceDocumentType !== 'TREASURY_DOCUMENT') {
    return `${REFERENCE_LABELS[doc.referenceDocumentType] ?? doc.referenceDocumentType} ${doc.referenceDocumentId ?? ''}`;
  }
  return ORIGIN_LABELS[doc.origin];
};

/** Efectos de anular según el origen (mismas reglas de treasury-vouchers.service) */
function annulEffects(doc: TreasuryDocumentDto): string[] {
  const receipt = doc.documentType === 'RECIBO_CAJA';
  const where = doc.source === 'BANCO' ? (doc.bankAccountName ?? 'el banco') : 'caja';
  const active = doc.applications.filter((a) => !a.isReversed);
  const invoices = active.map((a) => a.documentNumber ?? a.documentId).join(', ');
  const effects: string[] = [];
  if (doc.origin === 'CARTERA' && active.length) {
    effects.push(`Las facturas abonadas recuperan su saldo: ${invoices}.`);
  }
  if (doc.origin === 'PROVEEDOR' && active.length) {
    effects.push(`Las facturas y causaciones pagadas recuperan su saldo: ${invoices}.`);
  }
  effects.push(
    receipt
      ? `Sale de ${where} el dinero que el recibo seguía aplicando.`
      : `Vuelve a ${where} el dinero que el egreso seguía aplicando.`,
  );
  effects.push('Se registra el asiento que reversa el documento.');
  effects.push('El documento queda anulado con su motivo; no se puede deshacer.');
  return effects;
}

const money = (value: string) =>
  `$${Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Apartados independientes de recibos de caja y comprobantes de egreso (acuerdo del 4 de
 * octubre). Cada documento se genera con el movimiento de caja o banco que respalda.
 */
export function TreasuryDocumentsPage({ type }: { type: TreasuryDocumentType }) {
  const labels = LABELS[type];
  // Filtros en la URL (rediseño, fase 4): se conservan al volver, recargar o compartir el enlace
  const [searchParams, setSearchParams] = useSearchParams();
  const fromDate = searchParams.get('desde') ?? '';
  const toDate = searchParams.get('hasta') ?? '';
  const search = searchParams.get('q') ?? '';
  const statusParam = searchParams.get('estado');
  const status: TreasuryDocumentStatus | '' =
    statusParam === 'VIGENTE' || statusParam === 'ANULADO' ? statusParam : '';
  const setFilters = (changes: Record<string, string>) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  const setFromDate = (value: string) => setFilters({ desde: value });
  const setToDate = (value: string) => setFilters({ hasta: value });
  const setSearch = (value: string) => setFilters({ q: value });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<TreasuryDocumentDto | null>(null);
  const [correctionDoc, setCorrectionDoc] = useState<TreasuryDocumentDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [annulOpen, setAnnulOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
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
    queryKey: ['treasury-documents', type, status, fromDate, toDate, search, page, pageSize],
    queryFn: () =>
      getTreasuryDocuments({
        type,
        status: status || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search: search || undefined,
        page: page + 1,
        pageSize,
      }),
  });

  // Exporta exactamente lo filtrado: mismo tipo, estado, fechas y búsqueda
  const exportExcel = async () => {
    setExporting(true);
    setExportError(null);
    const base = type === 'RECIBO_CAJA' ? 'recibos_caja' : 'comprobantes_egreso';
    const range = fromDate || toDate ? `_${fromDate || 'inicio'}_${toDate || 'hoy'}` : '';
    try {
      await exportTreasuryDocuments(
        {
          type,
          status: status || undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          search: search || undefined,
        },
        `${base}${range}.xlsx`,
      );
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'No se pudo exportar.');
    } finally {
      setExporting(false);
    }
  };

  // Qué se puede hacer con el documento abierto y, si algo no, por qué (mismas reglas del servidor)
  const actions = selected ? treasuryDocumentActions(selected, hasPermission) : null;

  // Anulación con el componente común: nombra el documento, sus efectos y exige motivo; un
  // error se queda en el diálogo con el documento intacto
  const annul = async (reason?: string) => {
    if (!selected) return;
    const updated = await cancelTreasuryDocument(selected, (reason ?? '').trim());
    setSelected(updated);
    setAnnulOpen(false);
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
              select
              label="Estado"
              size="small"
              value={status}
              onChange={(e) => {
                setFilters({ estado: e.target.value });
                setPage(0);
              }}
              sx={{ minWidth: 150 }}
              slotProps={{
                select: { displayEmpty: true },
                inputLabel: { shrink: true },
                htmlInput: { 'data-testid': 'treasury-status-filter' },
              }}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="VIGENTE">Vigentes</MenuItem>
              <MenuItem value="ANULADO">Anulados</MenuItem>
            </TextField>
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
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            sx={{ mt: 1.5, justifyContent: 'space-between', alignItems: { sm: 'center' } }}
          >
            <QuickDateRange
              onSelect={({ from, to }) => {
                setFilters({ desde: from, hasta: to });
                setPage(0);
              }}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={() => void exportExcel()}
              disabled={exporting || !data?.total}
              startIcon={exporting ? <CircularProgress size={16} /> : undefined}
              sx={{ whiteSpace: 'nowrap', alignSelf: { xs: 'flex-start', sm: 'center' } }}
            >
              {exporting ? 'Exportando…' : `Exportar a Excel (${data?.total ?? 0})`}
            </Button>
          </Stack>
        </Paper>

        {isError && <Alert severity="error">{(error as Error).message}</Alert>}
        {exportError && (
          <Alert severity="error" onClose={() => setExportError(null)}>
            {exportError}
          </Alert>
        )}

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
                <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Valor
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : !data?.items.length ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 5, color: 'text.secondary' }}>
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
                    <TableCell>{originOf(doc)}</TableCell>
                    <TableCell>
                      <StatusChip
                        label={doc.status === 'ANULADO' ? 'Anulado' : 'Vigente'}
                        tone={doc.status === 'ANULADO' ? 'error' : 'success'}
                      />
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
        }}
        notice={
          actions?.restriction ? (
            <Alert
              severity="info"
              data-testid="treasury-actions-restriction"
              action={
                actions.source ? (
                  <Button
                    component={RouterLink}
                    to={actions.source.to}
                    color="inherit"
                    size="small"
                  >
                    {actions.source.label}
                  </Button>
                ) : undefined
              }
            >
              {actions.restriction}
            </Alert>
          ) : undefined
        }
        actions={
          selected && actions?.canAnnul ? (
            <Stack direction="row" spacing={1}>
              {actions.canCorrect && (
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
              )}
              <Button
                color="error"
                variant="outlined"
                onClick={() => setAnnulOpen(true)}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Anular Documento
              </Button>
            </Stack>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={annulOpen && Boolean(selected)}
        operationType="annul"
        title={`¿Anular el ${labels.singular.toLowerCase()} ${selected?.documentNumber ?? ''}?`}
        subject={
          selected
            ? `${selected.documentNumber} · ${money(selected.amount)}${selected.thirdPartyName ? ` · ${selected.thirdPartyName}` : ''}`
            : null
        }
        effects={selected ? annulEffects(selected) : []}
        reason={{ label: 'Motivo de la anulación', minLength: 3, maxLength: 500 }}
        confirmText={`Anular ${selected?.documentNumber ?? ''}`.trim()}
        onConfirm={annul}
        onCancel={() => setAnnulOpen(false)}
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

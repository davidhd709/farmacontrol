import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Link as MuiLink,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import HistoryIcon from '@mui/icons-material/History';
import BlockIcon from '@mui/icons-material/Block';
import { SYSTEM_PERMISSIONS, type CreditNoteDto, type SaleDto } from '@farmacia/contracts';
import { fetchSaleById, fetchSaleCreditNotes } from '../api/sales.api';
import { usePermissions } from '../../auth/hooks/usePermissions';
import { StatusChip } from '../../../components/StatusChip';
import { formatCop } from '../../../utils/money';
import { formatDate, formatDateTime } from '../../../utils/date-format';
import { SALE_STATUS_LABELS, paymentMethodLabel } from '../sale-labels';
import { SaleReceiptDialog } from '../components/SaleReceiptDialog';
import { CreditNoteDialog } from '../components/CreditNoteDialog';
import { SaleActionHistoryDialog } from '../components/SaleActionHistoryDialog';
import { CancelSaleDialog } from '../components/CancelSaleDialog';
import { SweetModal } from '../../../components/SweetModal';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" component="dt" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        component="dd"
        sx={{ m: 0, fontWeight: 600, overflowWrap: 'anywhere' }}
      >
        {children}
      </Typography>
    </Box>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
      <Typography variant={strong ? 'subtitle1' : 'body2'} sx={{ fontWeight: strong ? 800 : 500 }}>
        {label}
      </Typography>
      <Typography
        variant={strong ? 'subtitle1' : 'body2'}
        sx={{ fontWeight: strong ? 800 : 600, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Typography>
    </Box>
  );
}

/** Unidades base devueltas por línea de venta, solo con notas crédito confirmadas. */
function returnedBaseUnits(notes: CreditNoteDto[]): Map<string, number> {
  const returned = new Map<string, number>();
  for (const note of notes) {
    if (note.status !== 'CONFIRMADA') continue;
    for (const line of note.lines) {
      returned.set(line.saleLineId, (returned.get(line.saleLineId) ?? 0) + line.quantityBaseUnits);
    }
  }
  return returned;
}

/**
 * Detalle de una venta (rediseño 2026-11-12). Reúne los datos, el detalle por lote, las
 * devoluciones y las acciones que permiten el estado y el perfil. Cada acción la valida además el
 * API (`sales:credit_note`, `sales:cancel` y las reglas de estado).
 */
export function SaleDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const saleQuery = useQuery({
    queryKey: ['sale', id],
    queryFn: () => fetchSaleById(id),
    enabled: Boolean(id),
  });
  const notesQuery = useQuery({
    queryKey: ['sale', id, 'credit-notes'],
    queryFn: () => fetchSaleCreditNotes(id),
    enabled: Boolean(id),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['sale', id] });
  };

  if (saleQuery.isPending) {
    return (
      <Stack spacing={2} aria-busy="true">
        <Skeleton aria-label="Cargando venta" height={48} width="40%" />
        <Skeleton variant="rounded" height={160} />
        <Skeleton variant="rounded" height={240} />
      </Stack>
    );
  }

  if (saleQuery.isError) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 640 }}>
        <Typography component="h1" variant="h4">
          Venta
        </Typography>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void saleQuery.refetch()}>
              Reintentar
            </Button>
          }
        >
          {saleQuery.error instanceof Error
            ? saleQuery.error.message
            : 'No fue posible cargar la venta.'}
        </Alert>
        <Button component={Link} to="/sales" sx={{ alignSelf: 'flex-start' }}>
          Volver al historial de ventas
        </Button>
      </Stack>
    );
  }

  const sale: SaleDto = saleQuery.data;
  const notes = notesQuery.data ?? [];
  const confirmedNotes = notes.filter((n) => n.status === 'CONFIRMADA');
  const returned = returnedBaseUnits(notes);
  const status = SALE_STATUS_LABELS[sale.status];
  const isCompleted = sale.status === 'COMPLETED';

  const canReturn = isCompleted && hasPermission(SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE);
  const canSeeCancel = isCompleted && hasPermission(SYSTEM_PERMISSIONS.SALES_CANCEL);
  // El API rechaza (409) anular una venta con devoluciones vigentes (AUD-002)
  const cancelBlockedReason =
    confirmedNotes.length > 0
      ? `Tiene ${confirmedNotes.length === 1 ? 'una nota crédito vigente' : `${confirmedNotes.length} notas crédito vigentes`}: anúlelas antes de anular la venta.`
      : null;

  return (
    <Stack spacing={3} sx={{ maxWidth: 1200 }}>
      <Box>
        <Breadcrumbs aria-label="Ubicación" sx={{ mb: 1 }}>
          <MuiLink component={Link} to="/sales" underline="hover" color="inherit">
            Historial de ventas
          </MuiLink>
          <Typography color="text.primary" aria-current="page">
            {sale.invoiceNumber}
          </Typography>
        </Breadcrumbs>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography component="h1" variant="h4">
              Venta {sale.invoiceNumber}
            </Typography>
            <StatusChip label={status.label} tone={status.tone} data-testid="sale-status" />
          </Stack>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<PrintIcon />}
              onClick={() => setReceiptOpen(true)}
            >
              Comprobante
            </Button>
            {canReturn && (
              <Button
                variant="contained"
                startIcon={<AssignmentReturnIcon />}
                onClick={() => setReturnOpen(true)}
                data-testid="sale-detail-return-btn"
              >
                Devolución
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<HistoryIcon />}
              onClick={() => setHistoryOpen(true)}
            >
              Historial
            </Button>
            {canSeeCancel && (
              <Tooltip title={cancelBlockedReason ?? ''}>
                {/* El span mantiene el tooltip con el botón deshabilitado */}
                <span>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<BlockIcon />}
                    disabled={Boolean(cancelBlockedReason)}
                    onClick={() => setCancelOpen(true)}
                    data-testid="sale-detail-cancel-btn"
                  >
                    Anular
                  </Button>
                </span>
              </Tooltip>
            )}
          </Box>
        </Box>
        {canSeeCancel && cancelBlockedReason && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1 }}
            data-testid="cancel-blocked-reason"
          >
            Anulación no disponible. {cancelBlockedReason}
          </Typography>
        )}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,2fr) minmax(0,1fr)' },
        }}
      >
        <Card variant="outlined">
          <CardContent>
            <Box
              component="dl"
              sx={{
                m: 0,
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, minmax(0,1fr))' },
              }}
            >
              <Field label="Fecha">{formatDateTime(sale.createdAt)}</Field>
              <Field label="Cliente">
                {sale.customerName ?? '—'}
                {sale.customerDocument ? ` · ${sale.customerDocument}` : ''}
              </Field>
              <Field label="Medio de pago">{paymentMethodLabel(sale.paymentMethod)}</Field>
              <Field label="Vendedor">{sale.createdByUsername ?? '—'}</Field>
              <Field label="Líneas">{sale.lines.length}</Field>
              {sale.notes && <Field label="Observaciones">{sale.notes}</Field>}
            </Box>
          </CardContent>
        </Card>
        <Card variant="outlined" component="section" aria-label="Totales de la venta">
          <CardContent>
            <Stack spacing={0.75}>
              <TotalRow label="Subtotal" value={formatCop(sale.subtotal)} />
              {sale.discountTotal > 0 && (
                <TotalRow label="Descuentos" value={`− ${formatCop(sale.discountTotal)}`} />
              )}
              <TotalRow label="IVA" value={formatCop(sale.taxTotal)} />
              {sale.incTotal > 0 && <TotalRow label="INC" value={formatCop(sale.incTotal)} />}
              <TotalRow label="Total" value={formatCop(sale.total)} strong />
              {sale.paymentMethod === 'EFECTIVO' && (
                <>
                  <TotalRow label="Recibido" value={formatCop(sale.amountPaid)} />
                  <TotalRow label="Cambio" value={formatCop(sale.changeGiven)} />
                </>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Box>

      <Box component="section" aria-labelledby="sale-lines-title">
        <Typography
          id="sale-lines-title"
          component="h2"
          variant="h6"
          sx={{ fontWeight: 700, mb: 1 }}
        >
          Productos
        </Typography>
        <TableContainer component={Card} variant="outlined">
          <Table size="small" sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <TableCell>Producto</TableCell>
                <TableCell>Presentación</TableCell>
                <TableCell align="right">Cantidad</TableCell>
                <TableCell align="right">Precio unitario</TableCell>
                <TableCell align="right">Descuento</TableCell>
                <TableCell align="right">IVA</TableCell>
                <TableCell align="right">Total</TableCell>
                {returned.size > 0 && <TableCell align="right">Devuelto (unid. base)</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {sale.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {line.productName ?? line.productId}
                    </Typography>
                    {line.productCode && (
                      <Typography variant="caption" color="text.secondary">
                        {line.productCode}
                      </Typography>
                    )}
                    {line.lotAllocations && line.lotAllocations.length > 0 && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        Lotes:{' '}
                        {line.lotAllocations
                          .map(
                            (a) =>
                              `${a.lotNumber ?? 'sin número'} (${a.quantityBaseUnits} u., vence ${formatDate(a.expirationDate)})`,
                          )
                          .join(' · ')}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {line.presentationName ?? 'Unidad base'}
                    {line.presentationFactorHistorical > 1 && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        × {line.presentationFactorHistorical} unid. base
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{line.quantityCommercial}</TableCell>
                  <TableCell align="right">{formatCop(line.unitPrice)}</TableCell>
                  <TableCell align="right">
                    {line.discount > 0 ? formatCop(line.discount) : '—'}
                  </TableCell>
                  <TableCell align="right">{formatCop(line.taxAmount)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {formatCop(line.total)}
                  </TableCell>
                  {returned.size > 0 && (
                    <TableCell align="right">
                      {returned.get(line.id) ?? 0} de {line.quantityBaseUnits}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box component="section" aria-labelledby="sale-notes-title">
        <Typography
          id="sale-notes-title"
          component="h2"
          variant="h6"
          sx={{ fontWeight: 700, mb: 1 }}
        >
          Devoluciones
        </Typography>
        {notesQuery.isPending ? (
          <Skeleton aria-label="Cargando devoluciones" height={40} />
        ) : notesQuery.isError ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => void notesQuery.refetch()}>
                Reintentar
              </Button>
            }
          >
            No fue posible cargar las devoluciones de esta venta.
          </Alert>
        ) : notes.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Esta venta no tiene devoluciones.
          </Typography>
        ) : (
          <TableContainer component={Card} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nota crédito</TableCell>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Motivo</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {notes.map((note) => (
                  <TableRow key={note.id}>
                    <TableCell sx={{ fontWeight: 700 }}>{note.creditNoteNumber}</TableCell>
                    <TableCell>{formatDate(note.createdAt)}</TableCell>
                    <TableCell>{note.reason}</TableCell>
                    <TableCell>
                      <StatusChip
                        label={note.status === 'CONFIRMADA' ? 'Vigente' : 'Anulada'}
                        tone={note.status === 'CONFIRMADA' ? 'success' : 'error'}
                      />
                    </TableCell>
                    <TableCell align="right">{formatCop(note.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <MuiLink
          component={Link}
          to="/credit-notes"
          variant="body2"
          sx={{ display: 'inline-block', mt: 1 }}
        >
          Ver todas las notas crédito
        </MuiLink>
      </Box>

      <SaleReceiptDialog open={receiptOpen} sale={sale} onClose={() => setReceiptOpen(false)} />
      <CreditNoteDialog
        open={returnOpen}
        sale={returnOpen ? sale : null}
        creditNotes={notes}
        onClose={() => setReturnOpen(false)}
        onCreated={(number, exchangeCreditNoteId) => {
          setReturnOpen(false);
          if (exchangeCreditNoteId) {
            navigate(`/pos?cambio=${encodeURIComponent(exchangeCreditNoteId)}`);
            return;
          }
          setToast(`Nota crédito ${number} registrada.`);
          refresh();
        }}
      />
      <SaleActionHistoryDialog
        open={historyOpen}
        saleId={historyOpen ? sale.id : null}
        invoiceNumber={sale.invoiceNumber}
        onClose={() => setHistoryOpen(false)}
      />
      <CancelSaleDialog
        sale={cancelOpen ? sale : null}
        onClose={() => setCancelOpen(false)}
        onCancelled={(cancelled) => {
          setCancelOpen(false);
          setToast(`Venta ${cancelled.invoiceNumber} anulada.`);
          refresh();
        }}
      />
      <SweetModal
        open={Boolean(toast)}
        type="success"
        title="Listo"
        text={toast ?? ''}
        confirmText="Aceptar"
        onConfirm={() => setToast(null)}
        onClose={() => setToast(null)}
      />
    </Stack>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Table,
  TableContainer,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SYSTEM_PERMISSIONS,
  type CustomerDto,
  type ThirdPartyDto,
  type TreasuryDocumentDto,
  type TreasuryDocumentType,
  type TreasuryVoucherPaymentMethod,
} from '@farmacia/contracts';
import { ThirdPartyAutocomplete } from '../../third-parties/components/ThirdPartyAutocomplete';
import { CustomerAutocomplete } from '../../customers/components/CustomerAutocomplete';
import { usePermissions } from '../../auth/hooks/usePermissions';
import { businessToday } from '../../../utils/business-date';
import { CounterpartAccountSelect } from '../../accounting/components/CounterpartAccountSelect';
import { fetchReceivables } from '../../receivables/api/receivables.api';
import { fetchPayableStatement } from '../../payables/api/payables.api';
import { DOCUMENT_TYPE_LABELS } from '../../payables/components/PayableStatementTable';
import { SupplierStatementDialog } from '../../payables/components/SupplierStatementDialog';
import { useBankAccountOptions } from '../hooks/useTreasury';
import { createCashReceipt, createDisbursement } from '../api/treasury.api';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { formatMoney, toCents } from '../../../utils/money';
import { formatDate } from '../../../utils/date-format';

type Mode = 'FACTURAS' | 'MANUAL';

interface OpenItem {
  documentType: 'FACTURA_VENTA' | 'FACTURA_COMPRA' | 'CAUSACION_GASTO';
  documentId: string;
  documentNumber: string | null;
  label: string;
  documentDate: string;
  dueDate: string | null;
  balance: string;
}

const centsOf = (value: string) => {
  try {
    return toCents(value || '0');
  } catch {
    return NaN;
  }
};

/**
 * Registro de un recibo de caja (ingresos) o un comprobante de egreso (egresos): el único
 * lugar donde se mueve dinero manualmente. Con facturas, aplica el valor a las facturas
 * elegidas del cliente o del proveedor; manual, contabiliza contra la contrapartida elegida.
 * Cada modo se ofrece según el permiso del documento (correcciones del cliente, 2026-11-02):
 * el abono a cartera con `recibo_caja.crear_abono`, el pago a proveedor con
 * `comprobante_egreso.crear` y el documento manual además con el permiso contable.
 */
export function VoucherFormDialog({
  type,
  open,
  onClose,
  onCreated,
}: {
  type: TreasuryDocumentType;
  open: boolean;
  onClose: () => void;
  onCreated: (document: TreasuryDocumentDto) => void;
}) {
  const isReceipt = type === 'RECIBO_CAJA';
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canInvoices = hasPermission(
    isReceipt ? SYSTEM_PERMISSIONS.CASH_RECEIPTS_COLLECT : SYSTEM_PERMISSIONS.DISBURSEMENTS_CREATE,
  );
  // Recibo manual: su propio permiso (tesorería, sin contabilidad). Egreso manual: permiso
  // contable, porque saca dinero contra una contrapartida (2026-11-03)
  const canManual = isReceipt
    ? hasPermission(SYSTEM_PERMISSIONS.CASH_RECEIPTS_MANUAL)
    : hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_READ) &&
      hasPermission(SYSTEM_PERMISSIONS.DISBURSEMENTS_CREATE);
  const initialMode: Mode = canInvoices ? 'FACTURAS' : 'MANUAL';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [paymentMethod, setPaymentMethod] = useState<TreasuryVoucherPaymentMethod>('EFECTIVO');
  const [bankAccountId, setBankAccountId] = useState('');
  const [concept, setConcept] = useState('');
  const [notes, setNotes] = useState('');
  const [party, setParty] = useState<ThirdPartyDto | null>(null);
  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [amount, setAmount] = useState('');
  const [counterpartAccountId, setCounterpartAccountId] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [savedDraft, setSavedDraft] = useState<any | null>(null);
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);
  const [draftToast, setDraftToast] = useState<string | null>(null);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const bankAccounts = useBankAccountOptions(open && paymentMethod === 'TRANSFERENCIA');

  const draftStorageKey = `farmacontrol_draft_voucher_${type}`;

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setPaymentMethod('EFECTIVO');
    setBankAccountId('');
    setConcept('');
    setNotes('');
    setParty(null);
    setCustomer(null);
    setAmount('');
    setCounterpartAccountId('');
    setSelected({});
    setError(null);
    setDraftToast(null);
    retry.current = null;

    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (raw) {
        setSavedDraft(JSON.parse(raw));
      } else {
        setSavedDraft(null);
      }
    } catch {
      setSavedDraft(null);
    }
    setDraftBannerDismissed(false);
  }, [open, initialMode, draftStorageKey]);

  const loadDraft = () => {
    if (!savedDraft) return;
    if (savedDraft.mode) setMode(savedDraft.mode);
    if (savedDraft.paymentMethod) setPaymentMethod(savedDraft.paymentMethod);
    if (savedDraft.bankAccountId) setBankAccountId(savedDraft.bankAccountId);
    if (savedDraft.concept) setConcept(savedDraft.concept);
    if (savedDraft.notes) setNotes(savedDraft.notes);
    if (savedDraft.party) setParty(savedDraft.party);
    if (savedDraft.customer) setCustomer(savedDraft.customer);
    if (savedDraft.amount) setAmount(savedDraft.amount);
    if (savedDraft.counterpartAccountId) setCounterpartAccountId(savedDraft.counterpartAccountId);
    if (savedDraft.selected) setSelected(savedDraft.selected);
    setSavedDraft(null);
    setDraftToast('Borrador cargado. Puedes modificar cualquier campo antes de contabilizar.');
  };

  const discardDraft = () => {
    localStorage.removeItem(draftStorageKey);
    setSavedDraft(null);
  };

  const saveDraft = () => {
    if (concept.trim().length === 0 && !party && !customer && !amount) {
      setError('Ingresa al menos el concepto o el tercero para guardar el borrador.');
      return;
    }
    setError(null);
    const draftData = {
      mode,
      paymentMethod,
      bankAccountId,
      concept,
      notes,
      party,
      customer,
      amount,
      counterpartAccountId,
      selected,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(draftData));
      setDraftToast('Borrador guardado correctamente. Los cambios no se han contabilizado aún.');
    } catch {
      setError('No se pudo guardar el borrador en el almacenamiento local.');
    }
  };

  // El abono a cartera elige el cliente en el maestro de clientes (lo puede consultar cartera)
  const customerId = customer?.id ?? null;
  const supplierId = party?.supplierId ?? null;
  const ownerId = isReceipt ? customerId : supplierId;

  const openItems = useQuery({
    queryKey: ['voucher-open-items', type, ownerId],
    enabled: open && mode === 'FACTURAS' && Boolean(ownerId),
    queryFn: async (): Promise<OpenItem[]> => {
      if (isReceipt) {
        const result = await fetchReceivables({
          customerId: ownerId!,
          status: 'PENDIENTE',
          pageSize: 100,
        });
        return result.items.map((r) => ({
          documentType: 'FACTURA_VENTA',
          documentId: r.id,
          documentNumber: r.invoiceNumber ?? null,
          label: 'Factura de venta',
          documentDate: businessToday(new Date(r.createdAt)),
          dueDate: r.dueDate,
          balance: r.balance,
        }));
      }
      const statement = await fetchPayableStatement({ supplierId: ownerId! });
      return statement.items.map((i) => ({
        documentType: i.documentType,
        documentId: i.documentId,
        documentNumber: i.documentNumber,
        label:
          i.documentType === 'CAUSACION_GASTO'
            ? `${DOCUMENT_TYPE_LABELS[i.documentType]} · ${i.description}`
            : DOCUMENT_TYPE_LABELS[i.documentType],
        documentDate: i.documentDate,
        dueDate: i.dueDate,
        balance: i.balance,
      }));
    },
  });

  const items = useMemo(() => openItems.data ?? [], [openItems.data]);
  const totalCents =
    mode === 'MANUAL'
      ? centsOf(amount)
      : Object.values(selected).reduce((acc, value) => acc + centsOf(value), 0);

  const labels = isReceipt
    ? {
        title: 'Nuevo recibo de caja',
        invoices: 'Abono a cartera',
        manual: 'Ingreso manual',
        party: 'Cliente',
        role: 'CUSTOMER' as const,
        empty: 'El cliente no tiene facturas a crédito pendientes.',
        notParty: 'El tercero elegido no está registrado como cliente.',
        destination: paymentMethod === 'EFECTIVO' ? 'entra a caja' : 'entra a la cuenta bancaria',
      }
    : {
        title: 'Nuevo comprobante de egreso',
        invoices: 'Pago a proveedor',
        manual: 'Egreso manual',
        party: 'Proveedor',
        role: 'SUPPLIER' as const,
        empty: 'El proveedor no tiene facturas ni causaciones pendientes.',
        notParty: 'El tercero elegido no está registrado como proveedor.',
        destination: paymentMethod === 'EFECTIVO' ? 'sale de caja' : 'sale de la cuenta bancaria',
      };

  const validate = (): string | null => {
    if (paymentMethod === 'TRANSFERENCIA' && !bankAccountId)
      return 'Selecciona la cuenta bancaria.';
    if (concept.trim().length < 3)
      return 'Escribe el concepto del documento (mínimo 3 caracteres).';
    if (mode === 'MANUAL') {
      if (!(centsOf(amount) > 0)) return 'Ingresa un valor mayor a cero.';
      if (!counterpartAccountId) return 'Selecciona la cuenta de contrapartida.';
      return null;
    }
    if (!ownerId) return isReceipt ? 'Selecciona el cliente.' : 'Selecciona el proveedor.';
    const chosen = Object.entries(selected);
    if (!chosen.length) return 'Selecciona al menos una factura.';
    for (const [id, value] of chosen) {
      const item = items.find((i) => i.documentId === id);
      const cents = centsOf(value);
      if (!item || !(cents > 0)) return 'Cada factura seleccionada necesita un valor mayor a cero.';
      if (cents > centsOf(item.balance))
        return `El valor de ${item.documentNumber ?? 'la factura'} supera su saldo.`;
    }
    return null;
  };

  const buildPayload = () => {
    const conceptText = notes.trim()
      ? `${concept.trim()} (Obs: ${notes.trim()})`
      : concept.trim();
    const base = {
      paymentMethod,
      bankAccountId: paymentMethod === 'TRANSFERENCIA' ? bankAccountId : undefined,
      concept: conceptText,
    };
    if (mode === 'MANUAL') {
      return {
        ...base,
        kind: 'MANUAL' as const,
        amount: (centsOf(amount) / 100).toFixed(2),
        counterpartAccountId,
        thirdPartyId: party?.id,
      };
    }
    const chosen = Object.entries(selected).map(([id, value]) => ({
      item: items.find((i) => i.documentId === id)!,
      amount: (centsOf(value) / 100).toFixed(2),
    }));
    return isReceipt
      ? {
          ...base,
          kind: 'CARTERA' as const,
          customerId: customerId!,
          applications: chosen.map((c) => ({ receivableId: c.item.documentId, amount: c.amount })),
        }
      : {
          ...base,
          kind: 'PROVEEDOR' as const,
          supplierId: supplierId!,
          applications: chosen.map((c) => ({
            documentType: c.item.documentType as 'FACTURA_COMPRA' | 'CAUSACION_GASTO',
            documentId: c.item.documentId,
            amount: c.amount,
          })),
        };
  };

  const submit = async () => {
    if (submitting) return;
    setConfirmOpen(false);
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildPayload();
      const fingerprint = JSON.stringify(payload);
      if (retry.current?.fingerprint !== fingerprint)
        retry.current = { fingerprint, key: crypto.randomUUID() };
      const document = isReceipt
        ? await createCashReceipt(
            payload as Parameters<typeof createCashReceipt>[0],
            retry.current.key,
          )
        : await createDisbursement(
            payload as Parameters<typeof createDisbursement>[0],
            retry.current.key,
          );
      retry.current = null;
      try {
        localStorage.removeItem(draftStorageKey);
        setSavedDraft(null);
      } catch {
        // Ignorar fallo de almacenamiento
      }
      for (const key of [
        'treasury-documents',
        'receivables',
        'receivables-aging',
        'payables-statement',
        'voucher-open-items',
        'expenses',
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      onCreated(document);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el documento.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = (item: OpenItem, checked: boolean) =>
    setSelected((current) => {
      const next = { ...current };
      if (checked) next[item.documentId] = item.balance;
      else delete next[item.documentId];
      return next;
    });

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      maxWidth="md"
      fullWidth
      aria-labelledby="voucher-form-title"
    >
      <DialogTitle id="voucher-form-title" sx={{ fontWeight: 700 }}>
        {labels.title}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {savedDraft && !draftBannerDismissed && (
            <Alert
              severity="info"
              action={
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="contained" color="info" onClick={loadDraft}>
                    Cargar borrador
                  </Button>
                  <Button size="small" color="inherit" onClick={discardDraft}>
                    Descartar
                  </Button>
                </Stack>
              }
            >
              Existe un borrador guardado sin contabilizar. Puedes cargarlo para continuar editándolo o descartarlo.
            </Alert>
          )}

          {draftToast && (
            <Alert severity="success" onClose={() => setDraftToast(null)}>
              {draftToast}
            </Alert>
          )}

          {canInvoices && canManual && (
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              color="primary"
              aria-label="Tipo de documento"
              value={mode}
              onChange={(_, value: Mode | null) => {
                if (value) {
                  setMode(value);
                  setSelected({});
                  setError(null);
                }
              }}
            >
              <ToggleButton value="FACTURAS" sx={{ textTransform: 'none', fontWeight: 600 }}>
                {labels.invoices}
              </ToggleButton>
              <ToggleButton value="MANUAL" sx={{ textTransform: 'none', fontWeight: 600 }}>
                {labels.manual}
              </ToggleButton>
            </ToggleButtonGroup>
          )}

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Medio
            </Typography>
            <RadioGroup
              row
              aria-label="Medio de pago"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as TreasuryVoucherPaymentMethod)}
            >
              <FormControlLabel
                value="EFECTIVO"
                control={<Radio size="small" />}
                label="Efectivo (caja)"
              />
              <FormControlLabel
                value="TRANSFERENCIA"
                control={<Radio size="small" />}
                label="Transferencia (bancos)"
              />
            </RadioGroup>
            {paymentMethod === 'TRANSFERENCIA' && (
              <FormControl fullWidth size="small" required sx={{ mt: 1 }}>
                <InputLabel id="voucher-bank-label">Cuenta bancaria</InputLabel>
                <Select
                  labelId="voucher-bank-label"
                  label="Cuenta bancaria"
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  disabled={bankAccounts.isPending || bankAccounts.isError}
                >
                  {(bankAccounts.data ?? []).map((account) => (
                    <MenuItem key={account.id} value={account.id}>
                      {account.name} · {account.bankName}
                      {account.accountNumberLast4 ? ` ···${account.accountNumberLast4}` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ alignItems: { sm: 'flex-start' } }}
          >
            {isReceipt && mode === 'FACTURAS' ? (
              <CustomerAutocomplete
                value={customer}
                onChange={(value) => {
                  setCustomer(value);
                  setSelected({});
                }}
                required
              />
            ) : (
              <ThirdPartyAutocomplete
                value={party}
                onChange={(value) => {
                  setParty(value);
                  setSelected({});
                }}
                role={mode === 'FACTURAS' ? labels.role : undefined}
                label={mode === 'FACTURAS' ? labels.party : 'Tercero (opcional)'}
                required={mode === 'FACTURAS'}
                showQuickCreate={false}
                error={mode === 'FACTURAS' && Boolean(party) && !ownerId}
                helperText={mode === 'FACTURAS' && party && !ownerId ? labels.notParty : undefined}
              />
            )}
            {!isReceipt && mode === 'FACTURAS' && supplierId && (
              <Button
                variant="outlined"
                onClick={() => setStatementOpen(true)}
                sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Estado de cuenta
              </Button>
            )}
          </Stack>

          {mode === 'FACTURAS' && ownerId && (
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                {isReceipt ? 'Facturas a abonar' : 'Facturas a pagar'}
              </Typography>
              {openItems.isLoading ? (
                <CircularProgress size={24} />
              ) : openItems.isError ? (
                <Alert severity="error">{(openItems.error as Error).message}</Alert>
              ) : !items.length ? (
                <Alert severity="info">{labels.empty}</Alert>
              ) : (
                <TableContainer>
                  <Table
                    size="small"
                    aria-label={isReceipt ? 'Facturas a abonar' : 'Facturas a pagar'}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox" />
                        <TableCell>Documento</TableCell>
                        <TableCell>Fecha</TableCell>
                        <TableCell>Vence</TableCell>
                        <TableCell align="right">Saldo</TableCell>
                        <TableCell align="right" sx={{ width: 170 }}>
                          Valor a aplicar
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.map((item) => {
                        const checked = item.documentId in selected;
                        const name = item.documentNumber ?? item.label;
                        return (
                          <TableRow key={item.documentId} selected={checked}>
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={checked}
                                onChange={(e) => toggle(item, e.target.checked)}
                                slotProps={{ input: { 'aria-label': `Seleccionar ${name}` } }}
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {item.documentNumber ?? '—'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {item.label}
                              </Typography>
                            </TableCell>
                            <TableCell>{formatDate(item.documentDate)}</TableCell>
                            <TableCell>{item.dueDate ?? '—'}</TableCell>
                            <TableCell align="right">{formatMoney(centsOf(item.balance))}</TableCell>
                            <TableCell align="right">
                              <TextField
                                size="small"
                                type="number"
                                disabled={!checked}
                                value={checked ? selected[item.documentId] : ''}
                                onChange={(e) =>
                                  setSelected((current) => ({
                                    ...current,
                                    [item.documentId]: e.target.value,
                                  }))
                                }
                                slotProps={{
                                  htmlInput: {
                                    min: 0.01,
                                    step: 'any',
                                    'aria-label': `Valor a aplicar a ${name}`,
                                  },
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}

          {mode === 'MANUAL' && (
            <Stack spacing={2}>
              <TextField
                label="Valor"
                type="number"
                size="small"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                slotProps={{ htmlInput: { min: 0.01, step: 'any' } }}
              />
              <CounterpartAccountSelect
                value={counterpartAccountId}
                onChange={setCounterpartAccountId}
              />
            </Stack>
          )}

          <TextField
            label="Concepto"
            size="small"
            required
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder={
              isReceipt ? 'Ej. Abono factura de octubre' : 'Ej. Pago facturas de octubre'
            }
          />

          <TextField
            label="Observaciones (opcional)"
            size="small"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anotaciones adicionales o detalles del documento…"
            multiline
            rows={2}
          />

          <Alert severity="info" variant="outlined">
            <strong>Total: {formatMoney(Number.isFinite(totalCents) ? totalCents : 0)}</strong> — el
            dinero {labels.destination}
            {mode === 'FACTURAS'
              ? ' y el saldo de las facturas seleccionadas baja en el mismo valor.'
              : '.'}{' '}
            Se genera el asiento contable automáticamente.
          </Alert>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            color="info"
            disabled={submitting}
            onClick={saveDraft}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Guardar Borrador
          </Button>
          <Button
            variant="contained"
            disabled={submitting}
            onClick={() => {
              const problem = validate();
              setError(problem);
              if (!problem) setConfirmOpen(true);
            }}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {submitting ? 'Registrando…' : 'Registrar'}
          </Button>
        </Stack>
      </DialogActions>

      <ConfirmDialog
        open={confirmOpen}
        title={`Confirmar ${isReceipt ? 'recibo de caja' : 'comprobante de egreso'}`}
        description={`Se registrará un ${isReceipt ? 'recibo de caja' : 'comprobante de egreso'} por ${formatMoney(
          Number.isFinite(totalCents) ? totalCents : 0,
        )}: el dinero ${labels.destination}.`}
        confirmText="Confirmar"
        isLoading={submitting}
        onConfirm={submit}
        onClose={() => setConfirmOpen(false)}
      />

      {statementOpen && supplierId && (
        <SupplierStatementDialog
          supplierId={supplierId}
          supplierName={party?.name ?? ''}
          onClose={() => setStatementOpen(false)}
        />
      )}
    </Dialog>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type {
  TreasuryDocumentDto,
  TreasuryVoucherPaymentMethod,
} from '@farmacia/contracts';
import { useBankAccountOptions } from '../hooks/useTreasury';
import { CounterpartAccountSelect } from '../../accounting/components/CounterpartAccountSelect';
import {
  cancelTreasuryDocument,
  createCashReceipt,
  createDisbursement,
} from '../api/treasury.api';
import { SweetModal } from '../../../components/SweetModal';
import { formatMoney, toCents } from '../../../utils/money';
import { formatDate } from '../../../utils/date-format';

interface Props {
  open: boolean;
  document: TreasuryDocumentDto | null;
  onClose: () => void;
  onSuccess: (newDocument: TreasuryDocumentDto) => void;
}

const CORRECTION_REASON_PRESETS = [
  'Corrección de medio de pago',
  'Error en el concepto digitado',
  'Ajuste en valores aplicados',
  'Corrección de cuenta bancaria',
  'Otro motivo',
];

export const TreasuryDocumentCorrectionDialog: React.FC<Props> = ({
  open,
  document,
  onClose,
  onSuccess,
}) => {
  if (!document) return null;

  const isReceipt = document.documentType === 'RECIBO_CAJA';
  const docTypeName = isReceipt ? 'Recibo de Caja' : 'Comprobante de Egreso';

  // Formulario de corrección
  const [concept, setConcept] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<TreasuryVoucherPaymentMethod>('EFECTIVO');
  const [bankAccountId, setBankAccountId] = useState('');
  const [counterpartAccountId, setCounterpartAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedAmounts, setSelectedAmounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');

  // Estados de proceso y confirmación
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bankAccounts = useBankAccountOptions(open && paymentMethod === 'TRANSFERENCIA');

  // Inicializar con los datos del documento original
  useEffect(() => {
    if (!open || !document) return;
    setConcept(document.concept || '');
    setPaymentMethod((document.paymentMethod as TreasuryVoucherPaymentMethod) || 'EFECTIVO');
    setBankAccountId(document.bankAccountId || '');
    setCounterpartAccountId('');
    setAmount(document.amount || '0');
    setReason('');
    setError(null);

    // Inicializar facturas aplicadas
    const initialApps: Record<string, string> = {};
    if (document.applications && document.applications.length > 0) {
      document.applications.forEach((app, idx) => {
        initialApps[app.documentNumber || `app-${idx}`] = app.amount;
      });
    }
    setSelectedAmounts(initialApps);
  }, [open, document]);

  // Cálculo de totales corregidos en centavos
  const totalCorrectedCents = useMemo(() => {
    if (document.origin === 'MANUAL') {
      try {
        return toCents(amount || '0');
      } catch {
        return 0;
      }
    }
    return Object.values(selectedAmounts).reduce((acc, val) => {
      try {
        return acc + toCents(val || '0');
      } catch {
        return acc;
      }
    }, 0);
  }, [document.origin, amount, selectedAmounts]);

  const originalTotalCents = useMemo(() => {
    try {
      return toCents(document.amount || '0');
    } catch {
      return 0;
    }
  }, [document.amount]);

  const differenceCents = totalCorrectedCents - originalTotalCents;

  const validate = (): string | null => {
    if (paymentMethod === 'TRANSFERENCIA' && !bankAccountId) {
      return 'Selecciona la cuenta bancaria de destino o retiro.';
    }
    if (concept.trim().length < 3) {
      return 'El concepto corregido debe tener al menos 3 caracteres.';
    }
    if (reason.trim().length < 5) {
      return 'El motivo de la corrección es obligatorio (mínimo 5 caracteres).';
    }
    if (document.origin === 'MANUAL') {
      if (totalCorrectedCents <= 0) return 'El nuevo valor debe ser mayor a cero.';
    } else {
      if (totalCorrectedCents <= 0) return 'El total de facturas aplicadas debe ser mayor a cero.';
    }
    return null;
  };

  const handleOpenConfirm = () => {
    const valError = validate();
    if (valError) {
      setError(valError);
      return;
    }
    setError(null);
    setConfirmOpen(true);
  };

  const handleExecuteCorrection = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // 1. Anular el documento original mediante el procedimiento transaccional existente
      const cancelReason = `Corregido por reemplazo: ${reason.trim()}`;
      await cancelTreasuryDocument(
        {
          id: document.id,
          documentType: document.documentType,
          origin: document.origin,
        },
        cancelReason,
      );

      // 2. Registrar el nuevo documento de reemplazo
      const idempotencyKey = crypto.randomUUID();
      const basePayload = {
        paymentMethod,
        bankAccountId: paymentMethod === 'TRANSFERENCIA' ? bankAccountId : undefined,
        concept: `${concept.trim()} (Corrección de ${document.documentNumber})`,
      };

      let newDoc: TreasuryDocumentDto;

      if (isReceipt) {
        if (document.origin === 'CARTERA') {
          // Reconstruir aplicaciones de cartera
          const apps = Object.entries(selectedAmounts).map(([docNum, val]) => {
            const originalApp = (document.applications || []).find(
              (a) => a.documentNumber === docNum,
            );
            return {
              receivableId: originalApp?.documentId || docNum,
              amount: (toCents(val) / 100).toFixed(2),
            };
          });
          newDoc = await createCashReceipt(
            {
              ...basePayload,
              kind: 'CARTERA',
              customerId: document.customerId || '',
              applications: apps,
            },
            idempotencyKey,
          );
        } else {
          newDoc = await createCashReceipt(
            {
              ...basePayload,
              kind: 'MANUAL',
              amount: (totalCorrectedCents / 100).toFixed(2),
              counterpartAccountId: counterpartAccountId || document.counterpartAccountId || '',
              thirdPartyId: document.thirdPartyId || undefined,
            },
            idempotencyKey,
          );
        }
      } else {
        // Comprobante de egreso
        if (document.origin === 'PROVEEDOR') {
          const apps = Object.entries(selectedAmounts).map(([docNum, val]) => {
            const originalApp = (document.applications || []).find(
              (a) => a.documentNumber === docNum,
            );
            return {
              documentType: (originalApp?.documentType as 'FACTURA_COMPRA' | 'CAUSACION_GASTO') || 'FACTURA_COMPRA',
              documentId: originalApp?.documentId || docNum,
              amount: (toCents(val) / 100).toFixed(2),
            };
          });
          newDoc = await createDisbursement(
            {
              ...basePayload,
              kind: 'PROVEEDOR',
              supplierId: document.supplierId || '',
              applications: apps,
            },
            idempotencyKey,
          );
        } else {
          newDoc = await createDisbursement(
            {
              ...basePayload,
              kind: 'MANUAL',
              amount: (totalCorrectedCents / 100).toFixed(2),
              counterpartAccountId: counterpartAccountId || document.counterpartAccountId || '',
              thirdPartyId: document.thirdPartyId || undefined,
            },
            idempotencyKey,
          );
        }
      }

      setConfirmOpen(false);
      onSuccess(newDoc);
    } catch (err: any) {
      setError(err?.message || 'Error al ejecutar la corrección del documento.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open && !confirmOpen} onClose={submitting ? undefined : onClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Corregir {docTypeName} {document.documentNumber}
        </DialogTitle>

        <DialogContent dividers sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={3}>
            {error && <Alert severity="error">{error}</Alert>}

            {/* SECCIÓN 1: DATOS ORIGINALES */}
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'text.secondary' }}>
                1. Información del Documento Original a Corregir
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 1.5,
                }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary" component="div">
                    Tercero / Beneficiario:
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {document.thirdPartyName || 'Consumidor / Proveedor'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" component="div">
                    Fecha de expedición:
                  </Typography>
                  <Typography variant="body2">
                    {formatDate(document.documentDate)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" component="div">
                    Medio de pago original:
                  </Typography>
                  <Typography variant="body2">
                    {document.paymentMethod} {document.bankAccountName ? `(${document.bankAccountName})` : ''}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" component="div">
                    Valor total original:
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {formatMoney(originalTotalCents)}
                  </Typography>
                </Box>
                <Box sx={{ gridColumn: { xs: '1', sm: '1 / span 2' } }}>
                  <Typography variant="caption" color="text.secondary" component="div">
                    Concepto original:
                  </Typography>
                  <Typography variant="body2">
                    {document.concept}
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* SECCIÓN 2: CAMPOS DE CORRECCIÓN */}
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main', mb: 1.5 }}>
                2. Datos Corregidos que Reemplazarán al Documento
              </Typography>

              <Stack spacing={2}>
                <TextField
                  label="Concepto Corregido *"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  fullWidth
                  size="small"
                  disabled={submitting}
                />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <FormControl size="small" sx={{ minWidth: 200 }} disabled={submitting}>
                    <InputLabel id="corr-pm-label">Medio de Pago Corregido</InputLabel>
                    <Select
                      labelId="corr-pm-label"
                      label="Medio de Pago Corregido"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as TreasuryVoucherPaymentMethod)}
                    >
                      <MenuItem value="EFECTIVO">Efectivo (Caja General)</MenuItem>
                      <MenuItem value="TRANSFERENCIA">Transferencia Bancaria</MenuItem>
                    </Select>
                  </FormControl>

                  {paymentMethod === 'TRANSFERENCIA' && (
                    <FormControl size="small" fullWidth disabled={submitting}>
                      <InputLabel id="corr-bank-label">Cuenta Bancaria de Destino/Retiro</InputLabel>
                      <Select
                        labelId="corr-bank-label"
                        label="Cuenta Bancaria de Destino/Retiro"
                        value={bankAccountId}
                        onChange={(e) => setBankAccountId(e.target.value)}
                      >
                        {(bankAccounts.data ?? []).map((acc) => (
                          <MenuItem key={acc.id} value={acc.id}>
                            {acc.name} — {acc.bankName}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                </Stack>

                {document.origin === 'MANUAL' && (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      label="Valor Corregido ($) *"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      size="small"
                      type="number"
                      disabled={submitting}
                    />
                    <Box sx={{ flex: 1 }}>
                      <CounterpartAccountSelect
                        value={counterpartAccountId}
                        onChange={(val) => setCounterpartAccountId(val || '')}
                        disabled={submitting}
                      />
                    </Box>
                  </Stack>
                )}

                {/* Facturas aplicadas en Cartera o Proveedores */}
                {document.applications && document.applications.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                      Facturas aplicadas y valores a corregir:
                    </Typography>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead sx={{ bgcolor: 'action.hover' }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Factura / Documento</TableCell>
                            <TableCell sx={{ fontWeight: 700 }} align="right">Valor Aplicado Original</TableCell>
                            <TableCell sx={{ fontWeight: 700, width: 180 }} align="right">Valor Corregido ($)</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {document.applications.map((app, idx) => {
                            const key = app.documentNumber || `app-${idx}`;
                            return (
                              <TableRow key={key}>
                                <TableCell sx={{ fontWeight: 600 }}>{app.documentNumber}</TableCell>
                                <TableCell align="right">{formatMoney(toCents(app.amount))}</TableCell>
                                <TableCell align="right">
                                  <TextField
                                    size="small"
                                    type="number"
                                    value={selectedAmounts[key] ?? app.amount}
                                    onChange={(e) =>
                                      setSelectedAmounts((prev) => ({
                                        ...prev,
                                        [key]: e.target.value,
                                      }))
                                    }
                                    disabled={submitting}
                                    slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                )}
              </Stack>
            </Paper>

            {/* SECCIÓN 3: VISTA DE DIFERENCIAS (DIFF VIEW) */}
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                3. Comparación de Diferencias (Diff View)
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Concepto / Atributo</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Valor Original</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Valor Corregido</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="center">Impacto</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>Medio de Pago</TableCell>
                      <TableCell>{document.paymentMethod}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{paymentMethod}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={document.paymentMethod === paymentMethod ? 'Sin cambio' : 'Modificado'}
                          size="small"
                          color={document.paymentMethod === paymentMethod ? 'default' : 'warning'}
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Total del Documento</TableCell>
                      <TableCell>{formatMoney(originalTotalCents)}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{formatMoney(totalCorrectedCents)}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={
                            differenceCents === 0
                              ? 'Mismo monto'
                              : differenceCents > 0
                                ? `+${formatMoney(differenceCents)}`
                                : formatMoney(differenceCents)
                          }
                          size="small"
                          color={differenceCents === 0 ? 'default' : differenceCents > 0 ? 'info' : 'error'}
                        />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            {/* SECCIÓN 4: MOTIVO OBLIGATORIO */}
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main', mb: 1 }}>
                4. Motivo Obligatorio de la Corrección *
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                Haz clic en un motivo estándar o escribe una justificación detallada:
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                {CORRECTION_REASON_PRESETS.map((preset) => (
                  <Chip
                    key={preset}
                    label={preset}
                    size="small"
                    variant="outlined"
                    clickable
                    color={reason === preset ? 'primary' : 'default'}
                    onClick={() => setReason(preset === 'Otro motivo' ? '' : preset)}
                  />
                ))}
              </Stack>
              <TextField
                label="Motivo detallado de corrección *"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                multiline
                rows={2}
                fullWidth
                size="small"
                required
                disabled={submitting}
                placeholder="Explica qué error se corrigió y por qué se emite el reemplazo (mínimo 5 caracteres)…"
                helperText="Quedará registrado permanentemente en la auditoría y en la anulación del documento original."
              />
            </Paper>

            {/* SECCIÓN 5: EFECTO CONTABLE Y FINANCIERO */}
            <Alert severity="info" variant="outlined">
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Efecto Contable y Financiero de la Operación:
              </Typography>
              <Typography variant="body2" component="div">
                • El documento <strong>{document.documentNumber}</strong> pasará a estado <strong>ANULADO</strong>, revirtiendo sus movimientos de dinero y asientos contables históricos.
              </Typography>
              <Typography variant="body2" component="div">
                • Se emitirá un <strong>nuevo documento oficial de reemplazo</strong> con su propio número consecutivo y partida doble cuadrada.
              </Typography>
              <Typography variant="body2" component="div">
                • Se mantendrá trazabilidad bidireccional permanente entre el documento original y el que lo sustituye.
              </Typography>
            </Alert>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
          <Button onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleOpenConfirm}
            disabled={submitting}
            sx={{ fontWeight: 700 }}
          >
            Corregir Documento
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal de Confirmación Definitiva */}
      <SweetModal
        open={confirmOpen}
        type="warning"
        title="¿Confirmar Corrección del Documento?"
        text={`Se anulará ${document.documentNumber} y se generará un nuevo documento con los datos corregidos.`}
        confirmText={submitting ? 'Procesando…' : 'Confirmar y Reemplazar'}
        cancelText="Volver"
        isLoading={submitting}
        onConfirm={handleExecuteCorrection}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
};

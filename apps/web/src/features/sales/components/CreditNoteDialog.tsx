import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableContainer,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { CreditNoteDto, SaleDto } from '@farmacia/contracts';
import {
  createSaleCreditNote,
  type CreateCreditNotePayload,
} from '../../accounting/api/accounting.api';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createCreditNoteSchema,
  type CreditNoteFormValues,
} from '../validation/credit-note.schema';
import { fromCents, toCents } from '../../../utils/money';

interface Props {
  open: boolean;
  sale: SaleDto | null;
  creditNotes?: CreditNoteDto[];
  onClose: () => void;
  /** exchangeCreditNoteId llega cuando la devolución es un cambio de producto */
  onCreated: (creditNoteNumber: string, exchangeCreditNoteId?: string) => void;
}

type RefundMethod = NonNullable<CreateCreditNotePayload['refundMethod']>;

// El dinero vuelve por el mismo medio con el que se pagó la venta
const defaultRefundMethod = (paymentMethod: string): RefundMethod =>
  paymentMethod === 'CREDITO'
    ? 'CREDITO_CARTERA'
    : paymentMethod === 'TRANSFERENCIA'
      ? 'TRANSFERENCIA'
      : 'EFECTIVO';

const money = (n: number) =>
  `$${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const REASON_PRESETS = [
  'Producto defectuoso',
  'Producto equivocado',
  'Producto vencido',
  'Error en la facturación',
  'Solicitud del cliente',
  'Otro motivo',
];

export const CreditNoteDialog: React.FC<Props> = ({
  open,
  sale,
  creditNotes = [],
  onClose,
  onCreated,
}) => {
  const {
    control,
    watch,
    reset,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting: submitting },
  } = useForm<CreditNoteFormValues>({
    resolver: zodResolver(createCreditNoteSchema(sale?.lines ?? [])),
    defaultValues: { quantities: {}, reason: '', restock: true, refundMethod: 'EFECTIVO' },
  });
  const { quantities, restock, refundMethod, reason } = watch();
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isExchange, setIsExchange] = useState(false);
  // Un reintento del mismo contenido reutiliza la clave para no emitir la nota dos veces
  const retryRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (open && sale) {
      retryRef.current = null;
      reset({
        quantities: {},
        reason: '',
        restock: true,
        refundMethod: defaultRefundMethod(sale.paymentMethod),
      });
      setError(null);
      setIsExchange(false);
    }
  }, [open, sale, reset]);

  // Cantidades previamente devueltas por cada línea de esta factura
  const alreadyReturnedByLine = useMemo(() => {
    const map: Record<string, number> = {};
    if (!sale || !creditNotes) return map;
    const notesForSale = creditNotes.filter(
      (cn) =>
        (cn.saleId === sale.id || cn.saleInvoiceNumber === sale.invoiceNumber) &&
        cn.status === 'CONFIRMADA',
    );
    for (const cn of notesForSale) {
      for (const line of cn.lines || []) {
        const id = line.saleLineId || line.id;
        map[id] = (map[id] || 0) + Number(line.quantityCommercial || 0);
      }
    }
    return map;
  }, [sale, creditNotes]);

  // Cálculos de resumen
  const linesSummary = useMemo(() => {
    if (!sale) return [];
    return (sale.lines ?? [])
      .map((line) => {
        const qty = Number(quantities[line.id] || 0);
        if (qty <= 0) return null;
        const factor = Number(line.quantityCommercial) || 1;
        const lineTotal = (toCents(line.total) * qty) / factor;
        const lineSubtotal = (toCents(line.subtotal) * qty) / factor;
        const lineTax = (toCents(line.taxAmount) * qty) / factor;
        return {
          id: line.id,
          name: line.productName || line.productCode || line.productId,
          qty,
          subtotal: fromCents(Math.round(lineSubtotal)),
          tax: fromCents(Math.round(lineTax)),
          total: fromCents(Math.round(lineTotal)),
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      name: string;
      qty: number;
      subtotal: number;
      tax: number;
      total: number;
    }>;
  }, [sale, quantities]);

  const estimatedTotal = useMemo(() => {
    return linesSummary.reduce((acc, l) => acc + l.total, 0);
  }, [linesSummary]);

  const estimatedSubtotal = useMemo(() => {
    return linesSummary.reduce((acc, l) => acc + l.subtotal, 0);
  }, [linesSummary]);

  const estimatedTax = useMemo(() => {
    return linesSummary.reduce((acc, l) => acc + l.tax, 0);
  }, [linesSummary]);

  if (!sale) return null;

  const handlePresetClick = (preset: string) => {
    if (preset === 'Otro motivo') {
      setValue('reason', '', { shouldValidate: true });
    } else {
      setValue('reason', preset, { shouldValidate: true });
    }
  };

  const handleReturnAllAvailable = () => {
    sale.lines.forEach((line) => {
      const already = alreadyReturnedByLine[line.id] || 0;
      const available = Math.max(0, Number(line.quantityCommercial) - already);
      setValue(`quantities.${line.id}`, String(available || line.quantityCommercial), {
        shouldValidate: true,
      });
    });
  };

  const onSubmit = handleSubmit(async (values) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const items = sale.lines
      .map((line) => ({
        saleLineId: line.id,
        quantityCommercial: Number(values.quantities[line.id] || 0),
      }))
      .filter((item) => item.quantityCommercial > 0);
    setError(null);
    try {
      const payload = {
        saleId: sale.id,
        reason: values.reason.trim(),
        restock: values.restock,
        refundMethod: values.refundMethod,
        items,
      };
      const fingerprint = JSON.stringify(payload);
      if (retryRef.current?.fingerprint !== fingerprint) {
        retryRef.current = { fingerprint, key: crypto.randomUUID() };
      }
      const nc = await createSaleCreditNote(sale.id, payload, retryRef.current.key);
      onCreated(nc.creditNoteNumber, isExchange ? nc.id : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la nota crédito.');
    } finally {
      submittingRef.current = false;
    }
  });

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="md" fullWidth>
      <form noValidate onSubmit={onSubmit}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Devolución / Nota Crédito — Factura {sale.invoiceNumber}
        </DialogTitle>

        {/* REQ-009: Stepper de procedimiento guiado */}
        <Box sx={{ px: 3, py: 1.5, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
          <Stepper activeStep={linesSummary.length > 0 ? (reason.trim().length >= 5 ? 3 : 2) : 1} alternativeLabel>
            <Step completed>
              <StepLabel>1. Buscar Factura</StepLabel>
            </Step>
            <Step completed={linesSummary.length > 0}>
              <StepLabel>2. Seleccionar Productos</StepLabel>
            </Step>
            <Step completed={reason.trim().length >= 5}>
              <StepLabel>3. Motivo y Solución</StepLabel>
            </Step>
            <Step>
              <StepLabel>4. Revisar y Confirmar</StepLabel>
            </Step>
          </Stepper>
        </Box>

        <DialogContent dividers sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={3}>
            {/* PASO 1: RESUMEN DE LA FACTURA ELEGIBLE */}
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'text.secondary' }}>
                Paso 1. Factura elegible para devolución
              </Typography>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Factura N°:
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700 }}>
                    {sale.invoiceNumber}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Cliente:
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {sale.customerName || 'Consumidor Final'}{' '}
                    {sale.customerDocument ? `(${sale.customerDocument})` : ''}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Medio de pago original:
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip label={sale.paymentMethod} size="small" variant="outlined" />
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Total venta:
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {money(Number(sale.total))}
                  </Typography>
                </Box>
              </Stack>
            </Paper>

            {/* PASO 2: SELECCIÓN DE PRODUCTOS */}
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    Paso 2. Seleccionar los productos
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Indica la cantidad exacta a devolver por cada artículo vendido:
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={submitting}
                  onClick={handleReturnAllAvailable}
                >
                  Devolver todo
                </Button>
              </Box>

              {errors.quantities?.root?.message && (
                <Alert severity="error" sx={{ mb: 1.5 }}>
                  {errors.quantities.root.message}
                </Alert>
              )}

              <TableContainer>
                <Table size="small" aria-label="Líneas a devolver">
                  <TableHead sx={{ bgcolor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Producto</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        Cantidad vendida
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        Ya devuelta
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        Disponible para devolver
                      </TableCell>
                      <TableCell align="right" sx={{ width: 150, fontWeight: 700 }}>
                        Cantidad a devolver
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sale.lines.map((line) => {
                      const sold = Number(line.quantityCommercial);
                      const already = alreadyReturnedByLine[line.id] || 0;
                      const available = Math.max(0, sold - already);

                      return (
                        <TableRow key={line.id} hover>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {line.productName || line.productCode || line.productId}
                            </Typography>
                            {line.lotAllocations && line.lotAllocations.length > 0 && (
                              <Typography variant="caption" color="text.secondary" component="div">
                                Lote:{' '}
                                {line.lotAllocations
                                  .map((a: any) => a.lotNumber || a.lot?.lotNumber)
                                  .filter(Boolean)
                                  .join(', ') || 'N/A'}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">{sold}</TableCell>
                          <TableCell align="right">{already}</TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontWeight: 600,
                              color: available > 0 ? 'success.main' : 'text.disabled',
                            }}
                          >
                            {available}
                          </TableCell>
                          <TableCell align="right">
                            <Controller
                              name={`quantities.${line.id}`}
                              control={control}
                              defaultValue=""
                              render={({ field: { ref, ...field }, fieldState }) => (
                                <TextField
                                  {...field}
                                  inputRef={ref}
                                  size="small"
                                  type="number"
                                  disabled={submitting || available <= 0}
                                  error={Boolean(fieldState.error)}
                                  helperText={fieldState.error?.message}
                                  slotProps={{
                                    htmlInput: {
                                      min: 0,
                                      max: sold,
                                      step: 'any',
                                      'aria-label': `Cantidad a devolver de ${line.productName ?? 'producto'}`,
                                    },
                                  }}
                                />
                              )}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            {/* PASO 3: MOTIVO Y SOLUCIÓN */}
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main', mb: 1 }}>
                Paso 3. Indicar el motivo y la solución
              </Typography>

              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75 }}>
                  Motivos frecuentes (haz clic para autocompletar):
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {REASON_PRESETS.map((preset) => (
                    <Chip
                      key={preset}
                      label={preset}
                      size="small"
                      variant="outlined"
                      clickable
                      color={reason === preset ? 'primary' : 'default'}
                      onClick={() => handlePresetClick(preset)}
                    />
                  ))}
                </Stack>
              </Box>

              <Controller
                name="reason"
                control={control}
                render={({ field: { ref, ...field }, fieldState }) => (
                  <TextField
                    {...field}
                    inputRef={ref}
                    label="Motivo de la devolución"
                    required
                    multiline
                    minRows={2}
                    fullWidth
                    disabled={submitting}
                    error={Boolean(fieldState.error)}
                    helperText={
                      fieldState.error?.message ||
                      'Mínimo 5 caracteres. Quedará registrado en trazabilidad contable y auditoría.'
                    }
                    sx={{ mb: 2 }}
                  />
                )}
              />

              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                sx={{ alignItems: { md: 'center' } }}
              >
                <Controller
                  name="refundMethod"
                  control={control}
                  render={({ field: { ref, ...field }, fieldState }) => (
                    <FormControl
                      size="small"
                      sx={{ minWidth: 260 }}
                      error={Boolean(fieldState.error)}
                      disabled={submitting}
                    >
                      <InputLabel id="refund-method-label">Forma de reembolso</InputLabel>
                      <Select
                        labelId="refund-method-label"
                        label="Forma de reembolso"
                        {...field}
                        inputRef={ref}
                      >
                        <MenuItem value="EFECTIVO">Reembolso en efectivo (egreso de caja)</MenuItem>
                        {sale.paymentMethod === 'CREDITO' && (
                          <MenuItem value="CREDITO_CARTERA">Abono a cartera del cliente</MenuItem>
                        )}
                        {sale.paymentMethod === 'TRANSFERENCIA' && (
                          <MenuItem value="TRANSFERENCIA">
                            Transferencia bancaria (cuenta de la venta)
                          </MenuItem>
                        )}
                      </Select>
                      <FormHelperText>{fieldState.error?.message}</FormHelperText>
                    </FormControl>
                  )}
                />

                <Controller
                  name="restock"
                  control={control}
                  render={({ field: { ref, ...field } }) => (
                    <FormControlLabel
                      control={
                        <Checkbox
                          name={field.name}
                          onBlur={field.onBlur}
                          slotProps={{ input: { ref } }}
                          checked={field.value}
                          disabled={submitting}
                          onChange={(e) => field.onChange(e.target.checked)}
                        />
                      }
                      label="Reintegrar unidades al inventario (lote original)"
                    />
                  )}
                />
              </Stack>

              <Box sx={{ mt: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={isExchange}
                      disabled={submitting}
                      onChange={(e) => setIsExchange(e.target.checked)}
                    />
                  }
                  label="Es un cambio de producto: abrir el punto de venta para la venta de reemplazo"
                />
              </Box>
            </Paper>

            {/* PASO 4: REVISAR Y CONFIRMAR (RESUMEN) */}
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main', mb: 1.5 }}>
                Paso 4. Revisar y confirmar devolución
              </Typography>

              <Box sx={{ mb: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Resumen Económico:
                </Typography>
                <Stack direction="row" spacing={3} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                  <Typography variant="body2">
                    Subtotal devuelto: <strong>{money(estimatedSubtotal)}</strong>
                  </Typography>
                  <Typography variant="body2">
                    IVA devuelto: <strong>{money(estimatedTax)}</strong>
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 800, color: 'primary.main' }}>
                    TOTAL DEVOLUCIÓN: {money(estimatedTotal)}
                  </Typography>
                </Stack>
              </Box>

              <Divider sx={{ my: 1 }} />

              <Box>
                <Typography variant="caption" color="text.secondary" component="div">
                  <strong>Efecto en inventario:</strong>{' '}
                  {restock
                    ? 'Reintegro físico de las unidades a su lote original en Kardex'
                    : 'Baja de inventario por avería o merma (sin retorno a stock disponible)'}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  <strong>Efecto financiero:</strong>{' '}
                  {refundMethod === 'EFECTIVO' && 'Se registrará un comprobante de egreso en caja.'}
                  {refundMethod === 'CREDITO_CARTERA' &&
                    'Se reducirá automáticamente el saldo en cuentas por cobrar del cliente.'}
                  {refundMethod === 'TRANSFERENCIA' &&
                    'Se registrará una reversión en la cuenta bancaria de la venta.'}
                </Typography>
              </Box>
            </Paper>

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
          <Button onClick={onClose} disabled={submitting}>
            Volver
          </Button>
          <Button
            variant="contained"
            color="warning"
            type="submit"
            disabled={submitting}
            sx={{ fontWeight: 700 }}
          >
            {submitting ? 'Registrando…' : 'Confirmar nota crédito'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { SaleDto } from '@farmacia/contracts';
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
  onClose: () => void;
  onCreated: (creditNoteNumber: string) => void;
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

export const CreditNoteDialog: React.FC<Props> = ({ open, sale, onClose, onCreated }) => {
  const {
    control,
    watch,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting: submitting },
  } = useForm<CreditNoteFormValues>({
    resolver: zodResolver(createCreditNoteSchema(sale?.lines ?? [])),
    defaultValues: { quantities: {}, reason: '', restock: true, refundMethod: 'EFECTIVO' },
  });
  const { quantities, restock, refundMethod } = watch();
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
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
    }
  }, [open, sale, reset]);

  const estimatedTotal = fromCents(
    (sale?.lines ?? []).reduce((acc, line) => {
      const amount =
        (toCents(line.total) * Number(quantities[line.id] || 0)) / Number(line.quantityCommercial);
      return acc + (Number.isFinite(amount) ? Math.round(amount) : 0);
    }, 0),
  );

  if (!sale) return null;

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
      onCreated(nc.creditNoteNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la nota crédito.');
    } finally {
      submittingRef.current = false;
    }
  });

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="md" fullWidth>
      <form noValidate onSubmit={onSubmit}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Devolución / Nota Crédito — Factura {sale.invoiceNumber}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {errors.quantities?.root?.message && (
              <Alert severity="error">{errors.quantities.root.message}</Alert>
            )}
            <Table size="small" aria-label="Líneas a devolver">
              <TableHead>
                <TableRow>
                  <TableCell>Producto</TableCell>
                  <TableCell align="right">Vendido</TableCell>
                  <TableCell align="right">Precio unit.</TableCell>
                  <TableCell align="right">IVA %</TableCell>
                  <TableCell align="right" sx={{ width: 140 }}>
                    Cant. a devolver
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sale.lines.map((line) => {
                  return (
                    <TableRow key={line.id}>
                      <TableCell>
                        {line.productName || line.productCode || line.productId}
                      </TableCell>
                      <TableCell align="right">{line.quantityCommercial}</TableCell>
                      <TableCell align="right">{money(Number(line.unitPrice))}</TableCell>
                      <TableCell align="right">{Number(line.taxRate)}</TableCell>
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
                              disabled={submitting}
                              error={Boolean(fieldState.error)}
                              helperText={fieldState.error?.message}
                              slotProps={{
                                htmlInput: {
                                  min: 0,
                                  max: Number(line.quantityCommercial),
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
                  disabled={submitting}
                  error={Boolean(fieldState.error)}
                  helperText={
                    fieldState.error?.message ||
                    'Mínimo 5 caracteres. Quedará registrado en auditoría.'
                  }
                />
              )}
            />

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              sx={{ alignItems: { sm: 'center' } }}
            >
              <Controller
                name="refundMethod"
                control={control}
                render={({ field: { ref, ...field }, fieldState }) => (
                  <FormControl
                    size="small"
                    sx={{ minWidth: 240 }}
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
                      <MenuItem value="EFECTIVO">Efectivo (egreso de caja)</MenuItem>
                      {sale.paymentMethod === 'CREDITO' && (
                        <MenuItem value="CREDITO_CARTERA">Abono a cartera del cliente</MenuItem>
                      )}
                      {sale.paymentMethod === 'TRANSFERENCIA' && (
                        <MenuItem value="TRANSFERENCIA">
                          Transferencia (retiro de la cuenta de la venta)
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

            <Alert severity="info" variant="outlined">
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Impacto estimado: {money(estimatedTotal)}
              </Typography>
              <Typography variant="body2">
                Se generará un asiento contable automático (Devoluciones en ventas, IVA
                {restock ? ', reintegro de inventario y reversión del costo' : ''}).
                {refundMethod === 'EFECTIVO' && ' Se registrará un egreso en caja.'}
                {refundMethod === 'CREDITO_CARTERA' &&
                  ' Se reducirá el saldo de la cuenta por cobrar.'}
                {refundMethod === 'TRANSFERENCIA' &&
                  ' Se registrará un retiro en la cuenta bancaria de la venta.'}
              </Typography>
            </Alert>

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="contained" color="warning" type="submit" disabled={submitting}>
            {submitting ? 'Registrando…' : 'Confirmar nota crédito'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

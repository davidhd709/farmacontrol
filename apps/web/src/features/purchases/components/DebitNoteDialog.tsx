import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { PurchaseDto } from '@farmacia/contracts';
import { createPurchaseDebitNote } from '../../accounting/api/accounting.api';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createDebitNoteSchema, type DebitNoteFormValues } from '../validation/debit-note.schema';
import { fromCents, toCents } from '../../../utils/money';
import { lotNumberLabel } from '../../catalog/utils/inventory-control';

interface Props {
  open: boolean;
  purchase: PurchaseDto | null;
  onClose: () => void;
  onCreated: (debitNoteNumber: string) => void;
}

const money = (n: number) =>
  `$${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const DebitNoteDialog: React.FC<Props> = ({ open, purchase, onClose, onCreated }) => {
  const {
    control,
    watch,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting: submitting },
  } = useForm<DebitNoteFormValues>({
    resolver: zodResolver(createDebitNoteSchema(purchase?.lines ?? [])),
    defaultValues: { quantities: {}, reason: '' },
  });
  const { quantities } = watch();
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Un reintento del mismo contenido reutiliza la clave para no emitir la nota dos veces
  const retryRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (open) {
      retryRef.current = null;
      reset({ quantities: {}, reason: '' });
      setError(null);
    }
  }, [open, purchase, reset]);

  const estimatedTotal = fromCents(
    (purchase?.lines ?? []).reduce((acc, line) => {
      const amount = toCents(line.unitCost) * Number(quantities[line.id] || 0);
      return acc + (Number.isFinite(amount) ? Math.round(amount) : 0);
    }, 0),
  );

  if (!purchase) return null;

  const onSubmit = handleSubmit(async (values) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const items = purchase.lines
      .map((line) => ({
        purchaseLineId: line.id,
        quantityCommercial: Number(values.quantities[line.id] || 0),
      }))
      .filter((item) => item.quantityCommercial > 0);
    setError(null);
    try {
      const payload = {
        purchaseId: purchase.id,
        reason: values.reason.trim(),
        items,
      };
      const fingerprint = JSON.stringify(payload);
      if (retryRef.current?.fingerprint !== fingerprint) {
        retryRef.current = { fingerprint, key: crypto.randomUUID() };
      }
      const nd = await createPurchaseDebitNote(purchase.id, payload, retryRef.current.key);
      onCreated(nd.debitNoteNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la nota débito.');
    } finally {
      submittingRef.current = false;
    }
  });

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="md" fullWidth>
      <form noValidate onSubmit={onSubmit}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Devolución a proveedor / Nota Débito — Factura {purchase.invoiceNumber}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {errors.quantities?.root?.message && (
              <Alert severity="error">{errors.quantities.root.message}</Alert>
            )}
            <Table size="small" aria-label="Líneas a devolver al proveedor">
              <TableHead>
                <TableRow>
                  <TableCell>Producto</TableCell>
                  <TableCell>Lote</TableCell>
                  <TableCell align="right">Comprado</TableCell>
                  <TableCell align="right">Costo unit.</TableCell>
                  <TableCell align="right" sx={{ width: 140 }}>
                    Cant. a devolver
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {purchase.lines.map((line) => {
                  return (
                    <TableRow key={line.id}>
                      <TableCell>{line.productName || line.productId}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>
                        {lotNumberLabel(line.lotNumber)}
                      </TableCell>
                      <TableCell align="right">{Number(line.quantityCommercial)}</TableCell>
                      <TableCell align="right">{money(Number(line.unitCost))}</TableCell>
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

            <Alert severity="info" variant="outlined">
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Impacto estimado: {money(estimatedTotal)}
              </Typography>
              <Typography variant="body2">
                Se descontarán las unidades del lote (si no hay existencias suficientes la operación
                se rechaza), se reducirá la cuenta por pagar al proveedor y se generará el asiento
                contable automático (Proveedores / Inventario).
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
            {submitting ? 'Registrando…' : 'Confirmar nota débito'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

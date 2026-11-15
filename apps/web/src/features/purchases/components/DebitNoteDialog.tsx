import React, { useContext, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableContainer,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { PurchaseDto } from '@farmacia/contracts';
import {
  createPurchaseDebitNote,
  fetchPurchaseDebitNotes,
} from '../../accounting/api/accounting.api';
import { fetchInventoryLots } from '../../inventory/api/inventory.api';

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

// El diálogo también se monta fuera del proveedor de consultas (pruebas aisladas)
const fallbackClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** Lo ya devuelto por línea y la existencia actual de cada lote, en unidades base. */
async function fetchReturnContext(purchase: PurchaseDto) {
  const productIds = [...new Set(purchase.lines.map((line) => line.productId))];
  const [notes, ...lotPages] = await Promise.all([
    fetchPurchaseDebitNotes(purchase.id),
    ...productIds.map((productId) => fetchInventoryLots({ productId, pageSize: 100 })),
  ]);
  const returnedBase: Record<string, number> = {};
  for (const note of notes) {
    for (const line of note.lines) {
      returnedBase[line.purchaseLineId] =
        (returnedBase[line.purchaseLineId] ?? 0) + Number(line.quantityBaseUnits);
    }
  }
  const lotStock: Record<string, number> = {};
  for (const page of lotPages) {
    for (const lot of page.items) lotStock[lot.id] = Number(lot.currentQuantity);
  }
  return { returnedBase, lotStock };
}

const money = (n: number) =>
  `$${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const DebitNoteDialog: React.FC<Props> = ({ open, purchase, onClose, onCreated }) => {
  const client = useContext(QueryClientContext) ?? fallbackClient;
  const context = useQuery(
    {
      queryKey: ['purchase-return-context', purchase?.id],
      queryFn: () => fetchReturnContext(purchase!),
      enabled: open && Boolean(purchase),
      staleTime: 0,
      retry: false,
    },
    client,
  );

  // Por línea: recibido, ya devuelto, existencia del lote y lo devolvible hoy (reglas del servidor:
  // saldo de la compra en unidades base y existencia suficiente en el lote)
  const rows = (purchase?.lines ?? []).map((line) => {
    const received = Number(line.quantityCommercial);
    const factor = received > 0 ? Number(line.quantityBaseUnits) / received : 1;
    const returnedBase = context.data?.returnedBase[line.id] ?? 0;
    const stockBase = context.data?.lotStock[line.lotId];
    const pendingBase = Math.max(0, Number(line.quantityBaseUnits) - returnedBase);
    const returnableBase =
      context.data && stockBase !== undefined ? Math.min(pendingBase, stockBase) : undefined;
    return {
      line,
      factor,
      received,
      returned: context.data ? returnedBase / factor : undefined,
      stockBase,
      returnable:
        returnableBase !== undefined
          ? Math.floor((returnableBase / factor) * 10000) / 10000
          : undefined,
    };
  });
  const maxByLine = Object.fromEntries(
    rows.filter((r) => r.returnable !== undefined).map((r) => [r.line.id, r.returnable!]),
  );

  const {
    control,
    watch,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting: submitting },
  } = useForm<DebitNoteFormValues>({
    resolver: zodResolver(createDebitNoteSchema(purchase?.lines ?? [], maxByLine)),
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

  // Estimación: el servidor prorratea el IVA por unidades base y ajusta el resto exacto
  const selected = rows
    .map((row) => {
      const qty = Number(quantities?.[row.line.id] || 0);
      if (!Number.isFinite(qty) || qty <= 0) return null;
      const base = Math.round(qty * row.factor);
      const subtotalCents = Math.round(toCents(row.line.unitCost) * qty);
      const lineBase = Number(row.line.quantityBaseUnits) || 1;
      const vatCents = Math.round((toCents(row.line.vatAmount || '0') * base) / lineBase);
      return { row, qty, base, subtotalCents, vatCents };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const estimatedSubtotal = fromCents(selected.reduce((acc, i) => acc + i.subtotalCents, 0));
  const estimatedVat = fromCents(selected.reduce((acc, i) => acc + i.vatCents, 0));
  const estimatedTotal = estimatedSubtotal + estimatedVat;

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
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="lg" fullWidth>
      <form noValidate onSubmit={onSubmit}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Devolución a proveedor / Nota Débito — Factura {purchase.invoiceNumber}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {context.isError && (
              <Alert
                severity="warning"
                action={
                  <Button color="inherit" size="small" onClick={() => void context.refetch()}>
                    Reintentar
                  </Button>
                }
              >
                No se pudo consultar lo ya devuelto ni la existencia de los lotes. El sistema lo
                valida igual al confirmar.
              </Alert>
            )}
            {errors.quantities?.root?.message && (
              <Alert severity="error">{errors.quantities.root.message}</Alert>
            )}
            <TableContainer>
              <Table
                size="small"
                aria-label="Líneas a devolver al proveedor"
                sx={{ minWidth: 900 }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell>Producto</TableCell>
                    <TableCell>Lote</TableCell>
                    <TableCell align="right">Recibido</TableCell>
                    <TableCell align="right">Ya devuelto</TableCell>
                    <TableCell align="right">Existencia del lote</TableCell>
                    <TableCell align="right">Se puede devolver</TableCell>
                    <TableCell align="right">Costo unit.</TableCell>
                    <TableCell align="right" sx={{ width: 140 }}>
                      Cant. a devolver
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map(({ line, received, returned, stockBase, returnable, factor }) => {
                    return (
                      <TableRow key={line.id}>
                        <TableCell>
                          {line.productName || line.productId}
                          {line.presentationName && (
                            <Typography variant="caption" color="text.secondary" component="div">
                              {line.presentationName}
                              {factor !== 1 ? ` (x${factor} unid. base)` : ''}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>
                          {lotNumberLabel(line.lotNumber)}
                        </TableCell>
                        <TableCell align="right">{received}</TableCell>
                        <TableCell align="right">{returned ?? '—'}</TableCell>
                        <TableCell align="right">
                          {stockBase !== undefined ? `${stockBase} u. base` : '—'}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{ fontWeight: 600 }}
                          data-testid={`returnable-${line.id}`}
                        >
                          {returnable ?? '—'}
                        </TableCell>
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
                                disabled={submitting || returnable === 0}
                                error={Boolean(fieldState.error)}
                                helperText={fieldState.error?.message}
                                slotProps={{
                                  htmlInput: {
                                    min: 0,
                                    max: returnable ?? Number(line.quantityCommercial),
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

            <Box
              component="section"
              aria-label="Efecto de la devolución"
              sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Efecto previsto · Total estimado {money(estimatedTotal)}
                {estimatedVat > 0 ? ` (IVA ${money(estimatedVat)})` : ''}
              </Typography>
              <Box
                component="dl"
                data-testid="debit-note-effects"
                sx={{
                  m: 0,
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '120px 1fr' },
                  columnGap: 2,
                  rowGap: 0.5,
                  '& dt': { fontWeight: 700, fontSize: '0.85rem' },
                  '& dd': { m: 0, fontSize: '0.85rem', mb: { xs: 0.75, sm: 0 } },
                }}
              >
                <dt>Inventario</dt>
                <dd>
                  {selected.length === 0
                    ? 'Indique las cantidades a devolver.'
                    : selected
                        .map(
                          (i) =>
                            `Salen ${i.base} unidades base del lote ${lotNumberLabel(i.row.line.lotNumber)}`,
                        )
                        .join('; ') +
                      '. Queda en el Kardex como salida por devolución a proveedor.'}
                </dd>
                <dt>Proveedor</dt>
                <dd>
                  Baja {money(estimatedTotal)} la cuenta por pagar
                  {purchase.supplierName ? ` a ${purchase.supplierName}` : ''}.
                </dd>
                <dt>Contabilidad</dt>
                <dd>Asiento automático de la nota débito: proveedores contra inventario e IVA.</dd>
              </Box>
            </Box>

            {error && (
              <Alert
                severity="error"
                action={
                  <Button color="inherit" size="small" onClick={() => void context.refetch()}>
                    Actualizar existencias
                  </Button>
                }
              >
                {error}
              </Alert>
            )}
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

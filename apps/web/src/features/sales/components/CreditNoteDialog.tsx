import React, { useEffect, useMemo, useState } from 'react';
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
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('EFECTIVO');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && sale) {
      setQuantities({});
      setReason('');
      setRestock(true);
      setRefundMethod(defaultRefundMethod(sale.paymentMethod));
      setError(null);
    }
  }, [open, sale]);

  const estimatedTotal = useMemo(() => {
    if (!sale) return 0;
    return sale.lines.reduce((acc, line) => {
      const q = Number(quantities[line.id] || 0);
      if (!q || q <= 0) return acc;
      // Valor neto de descuento e IVA, proporcional a lo devuelto
      return acc + (Number(line.total) * q) / Number(line.quantityCommercial);
    }, 0);
  }, [sale, quantities]);

  if (!sale) return null;

  const items = sale.lines
    .map((l) => ({ saleLineId: l.id, quantityCommercial: Number(quantities[l.id] || 0) }))
    .filter((i) => i.quantityCommercial > 0);

  const invalidLine = sale.lines.find((l) => {
    const q = Number(quantities[l.id] || 0);
    return q < 0 || q > Number(l.quantityCommercial);
  });

  const canSubmit = items.length > 0 && reason.trim().length >= 5 && !invalidLine && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const nc = await createSaleCreditNote(sale.id, {
        saleId: sale.id,
        reason: reason.trim(),
        restock,
        refundMethod,
        items,
      });
      onCreated(nc.creditNoteNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la nota crédito.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        Devolución / Nota Crédito — Factura {sale.invoiceNumber}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Table size="small" aria-label="Líneas a devolver">
            <TableHead>
              <TableRow>
                <TableCell>Producto</TableCell>
                <TableCell align="right">Vendido</TableCell>
                <TableCell align="right">Precio unit.</TableCell>
                <TableCell align="right">IVA %</TableCell>
                <TableCell align="right" sx={{ width: 140 }}>Cant. a devolver</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sale.lines.map((line) => {
                const q = Number(quantities[line.id] || 0);
                const over = q > Number(line.quantityCommercial) || q < 0;
                return (
                  <TableRow key={line.id}>
                    <TableCell>{line.productName || line.productCode || line.productId}</TableCell>
                    <TableCell align="right">{line.quantityCommercial}</TableCell>
                    <TableCell align="right">{money(Number(line.unitPrice))}</TableCell>
                    <TableCell align="right">{Number(line.taxRate)}</TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small"
                        type="number"
                        value={quantities[line.id] ?? ''}
                        onChange={(e) => setQuantities((p) => ({ ...p, [line.id]: e.target.value }))}
                        error={over}
                        helperText={over ? 'Excede lo vendido' : undefined}
                        slotProps={{
                          htmlInput: {
                            min: 0,
                            max: Number(line.quantityCommercial),
                            'aria-label': `Cantidad a devolver de ${line.productName ?? 'producto'}`,
                          },
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <TextField
            label="Motivo de la devolución"
            required
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            helperText="Mínimo 5 caracteres. Quedará registrado en auditoría."
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel id="refund-method-label">Forma de reembolso</InputLabel>
              <Select
                labelId="refund-method-label"
                label="Forma de reembolso"
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value as RefundMethod)}
              >
                <MenuItem value="EFECTIVO">Efectivo (egreso de caja)</MenuItem>
                {sale.paymentMethod === 'CREDITO' && (
                  <MenuItem value="CREDITO_CARTERA">Abono a cartera del cliente</MenuItem>
                )}
                {sale.paymentMethod === 'TRANSFERENCIA' && (
                  <MenuItem value="TRANSFERENCIA">Transferencia (retiro de la cuenta de la venta)</MenuItem>
                )}
              </Select>
            </FormControl>
            <FormControlLabel
              control={<Checkbox checked={restock} onChange={(e) => setRestock(e.target.checked)} />}
              label="Reintegrar unidades al inventario (lote original)"
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
              {refundMethod === 'CREDITO_CARTERA' && ' Se reducirá el saldo de la cuenta por cobrar.'}
              {refundMethod === 'TRANSFERENCIA' &&
                ' Se registrará un retiro en la cuenta bancaria de la venta.'}
            </Typography>
          </Alert>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancelar</Button>
        <Button variant="contained" color="warning" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? 'Registrando…' : 'Confirmar nota crédito'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

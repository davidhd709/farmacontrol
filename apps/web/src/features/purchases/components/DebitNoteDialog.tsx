import React, { useEffect, useMemo, useState } from 'react';
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

interface Props {
  open: boolean;
  purchase: PurchaseDto | null;
  onClose: () => void;
  onCreated: (debitNoteNumber: string) => void;
}

const money = (n: number) =>
  `$${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const DebitNoteDialog: React.FC<Props> = ({ open, purchase, onClose, onCreated }) => {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setQuantities({});
      setReason('');
      setError(null);
    }
  }, [open, purchase]);

  const estimatedTotal = useMemo(() => {
    if (!purchase) return 0;
    return purchase.lines.reduce(
      (acc, l) => acc + Number(l.unitCost) * Number(quantities[l.id] || 0),
      0,
    );
  }, [purchase, quantities]);

  if (!purchase) return null;

  const items = purchase.lines
    .map((l) => ({ purchaseLineId: l.id, quantityCommercial: Number(quantities[l.id] || 0) }))
    .filter((i) => i.quantityCommercial > 0);

  const invalidLine = purchase.lines.find((l) => {
    const q = Number(quantities[l.id] || 0);
    return q < 0 || q > Number(l.quantityCommercial);
  });

  const canSubmit = items.length > 0 && reason.trim().length >= 5 && !invalidLine && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const nd = await createPurchaseDebitNote(purchase.id, {
        purchaseId: purchase.id,
        reason: reason.trim(),
        items,
      });
      onCreated(nd.debitNoteNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la nota débito.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        Devolución a proveedor / Nota Débito — Factura {purchase.invoiceNumber}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Table size="small" aria-label="Líneas a devolver al proveedor">
            <TableHead>
              <TableRow>
                <TableCell>Producto</TableCell>
                <TableCell>Lote</TableCell>
                <TableCell align="right">Comprado</TableCell>
                <TableCell align="right">Costo unit.</TableCell>
                <TableCell align="right" sx={{ width: 140 }}>Cant. a devolver</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {purchase.lines.map((line) => {
                const q = Number(quantities[line.id] || 0);
                const over = q > Number(line.quantityCommercial) || q < 0;
                return (
                  <TableRow key={line.id}>
                    <TableCell>{line.productName || line.productId}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{line.lotNumber}</TableCell>
                    <TableCell align="right">{Number(line.quantityCommercial)}</TableCell>
                    <TableCell align="right">{money(Number(line.unitCost))}</TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small"
                        type="number"
                        value={quantities[line.id] ?? ''}
                        onChange={(e) => setQuantities((p) => ({ ...p, [line.id]: e.target.value }))}
                        error={over}
                        helperText={over ? 'Excede lo comprado' : undefined}
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

          <Alert severity="info" variant="outlined">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Impacto estimado: {money(estimatedTotal)}
            </Typography>
            <Typography variant="body2">
              Se descontarán las unidades del lote (si no hay existencias suficientes la operación se
              rechaza), se reducirá la cuenta por pagar al proveedor y se generará el asiento contable
              automático (Proveedores / Inventario).
            </Typography>
          </Alert>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancelar</Button>
        <Button variant="contained" color="warning" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? 'Registrando…' : 'Confirmar nota débito'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

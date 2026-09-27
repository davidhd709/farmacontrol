import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Stack,
  Alert,
  Typography,
  Box,
} from '@mui/material';
import type { InventoryLotDto, ProductDto } from '@farmacia/contracts';
import { adjustInventory } from '../api/inventory.api';

interface AdjustInventoryDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  products: ProductDto[];
  lots: InventoryLotDto[];
}

export const AdjustInventoryDialog = ({
  open,
  onClose,
  onSuccess,
  products,
  lots,
}: AdjustInventoryDialogProps) => {
  const [productId, setProductId] = useState('');
  const [lotId, setLotId] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'INCREMENTO' | 'DECREMENTO'>('INCREMENTO');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availableLots = lots.filter((l) => (productId ? l.productId === productId : true));
  const selectedLot = lots.find((l) => l.id === lotId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!productId) {
      setErrorMessage('Seleccione el producto a ajustar.');
      return;
    }
    if (!lotId) {
      setErrorMessage('Seleccione el lote específico.');
      return;
    }
    if (!reason.trim()) {
      setErrorMessage('La justificación o motivo del ajuste es obligatoria.');
      return;
    }
    if (quantity <= 0) {
      setErrorMessage('La cantidad debe ser mayor a 0.');
      return;
    }

    if (adjustmentType === 'DECREMENTO' && selectedLot && quantity > selectedLot.currentQuantity) {
      setErrorMessage(
        `No puede descontar más de la existencia actual del lote (${selectedLot.currentQuantity}).`,
      );
      return;
    }

    try {
      setIsSubmitting(true);
      await adjustInventory({
        productId,
        lotId,
        adjustmentType,
        quantityBaseUnits: quantity,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      });

      setReason('');
      setNotes('');
      setQuantity(1);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al procesar el ajuste de inventario.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Ajuste Manual de Inventario (Supervisor)
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

            <Alert severity="warning">
              Esta operación impacta de manera directa el libro mayor de movimientos (Kardex) y
              el saldo disponible en unidades base. Requiere motivo formal auditado.
            </Alert>

            <TextField
              select
              label="Producto"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setLotId('');
              }}
              required
              fullWidth
              disabled={isSubmitting}
            >
              {products.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Lote Específico"
              value={lotId}
              onChange={(e) => setLotId(e.target.value)}
              required
              fullWidth
              disabled={isSubmitting || !productId}
              helperText={
                selectedLot
                  ? `Saldo actual: ${selectedLot.currentQuantity} ${selectedLot.product?.baseUnit || 'UNIDADES'} (Vence: ${selectedLot.expirationDate})`
                  : 'Seleccione primero el producto'
              }
            >
              {availableLots.map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.lotNumber} — Saldo: {l.currentQuantity} (Vence: {l.expirationDate})
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Tipo de Ajuste"
              value={adjustmentType}
              onChange={(e) => setAdjustmentType(e.target.value as any)}
              required
              fullWidth
              disabled={isSubmitting}
            >
              <MenuItem value="INCREMENTO">Incremento (+ Ingreso de sobrante o conteo)</MenuItem>
              <MenuItem value="DECREMENTO">Decremento (- Merma, avería o pérdida)</MenuItem>
            </TextField>

            <TextField
              label="Cantidad a Ajustar (en unidades base)"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value || '1', 10)))}
              required
              fullWidth
              disabled={isSubmitting}
            />

            <TextField
              label="Motivo Justificado (Obligatorio)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Conteo físico mensual, frasco averiado en estantería..."
              required
              fullWidth
              disabled={isSubmitting}
            />

            <TextField
              label="Notas Adicionales (Opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              rows={2}
              fullWidth
              disabled={isSubmitting}
            />

            {selectedLot && (
              <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Impacto estimado en existencia:
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Saldo actual: {selectedLot.currentQuantity} → Nuevo saldo proyectado:{' '}
                  <strong>
                    {adjustmentType === 'INCREMENTO'
                      ? selectedLot.currentQuantity + quantity
                      : selectedLot.currentQuantity - quantity}
                  </strong>{' '}
                  {selectedLot.product?.baseUnit || 'UNIDADES'}
                </Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting} color="inherit">
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            color={adjustmentType === 'DECREMENTO' ? 'error' : 'primary'}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Procesando...' : 'Confirmar Ajuste'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

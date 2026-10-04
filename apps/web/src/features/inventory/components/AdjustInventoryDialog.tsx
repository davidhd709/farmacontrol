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
import { ConfirmDialog } from '../../../components/ConfirmDialog';

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

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availableLots = lots.filter((l) => (productId ? l.productId === productId : true));
  const selectedLot = lots.find((l) => l.id === lotId);
  const selectedProduct = products.find((p) => p.id === productId);

  const handlePreSubmit = (e: React.FormEvent) => {
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

    setConfirmOpen(true);
  };

  const handleConfirmAdjust = async () => {
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
      setConfirmOpen(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al procesar el ajuste de inventario.');
      setConfirmOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={isSubmitting ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2.5,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
          },
        },
      }}
    >
      <form onSubmit={handlePreSubmit}>
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
          <Button onClick={onClose} disabled={isSubmitting} color="inherit" sx={{ textTransform: 'none' }}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            color={adjustmentType === 'DECREMENTO' ? 'error' : 'primary'}
            disabled={isSubmitting}
            sx={{
              fontWeight: 700,
              textTransform: 'none',
              px: 3,
              transition: 'transform 0.1s ease, background-color 0.15s ease',
              '&:active': { transform: 'scale(0.98)' },
            }}
          >
            {isSubmitting ? 'Procesando...' : 'Revisar y Confirmar'}
          </Button>
        </DialogActions>
      </form>

      {/* DIÁLOGO CONFIRMACIÓN: ASENTAR AJUSTE */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmAdjust}
        isLoading={isSubmitting}
        title="Confirmar Ajuste en Kardex"
        description={
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              ¿Estás seguro de registrar un ajuste de tipo{' '}
              <strong>{adjustmentType === 'INCREMENTO' ? 'INCREMENTO (+)' : 'DECREMENTO (-)'}</strong> por{' '}
              <strong>{quantity} {selectedLot?.product?.baseUnit || 'unidades'}</strong>?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Producto:</strong> {selectedProduct?.name || selectedLot?.product?.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Lote:</strong> {selectedLot?.lotNumber}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Motivo:</strong> {reason}
            </Typography>
            <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
              ⚠️ Esta operación generará un movimiento de inventario inmutable y actualizará el saldo físico del lote.
            </Typography>
          </Stack>
        }
        confirmText="Asentar Ajuste"
        confirmColor={adjustmentType === 'DECREMENTO' ? 'error' : 'primary'}
      />
    </Dialog>
  );
};

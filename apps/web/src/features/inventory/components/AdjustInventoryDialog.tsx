import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createAdjustInventorySchema,
  type AdjustInventoryFormValues,
} from '../validation/adjust-inventory.schema';
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
import {
  INVENTORY_ADJUSTMENT_REASON_MAX_LENGTH,
  INVENTORY_MOVEMENT_NOTES_MAX_LENGTH,
  type InventoryLotDto,
  type ProductDto,
} from '@farmacia/contracts';
import { adjustInventory } from '../api/inventory.api';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { expirationDateLabel, lotNumberLabel } from '../../catalog/utils/inventory-control';

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
  const {
    control,
    watch,
    setValue,
    resetField,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<AdjustInventoryFormValues>({
    resolver: zodResolver(createAdjustInventorySchema(lots)),
    defaultValues: {
      productId: '',
      lotId: '',
      adjustmentType: 'INCREMENTO',
      quantity: 1,
      reason: '',
      notes: '',
    },
  });
  const { productId, lotId, adjustmentType, quantity, reason, notes } = watch();
  const submittingRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availableLots = lots.filter((l) => (productId ? l.productId === productId : true));
  const selectedLot = lots.find((l) => l.id === lotId);
  const selectedProduct = products.find((p) => p.id === productId);

  const handlePreSubmit = handleSubmit(() => {
    setErrorMessage(null);
    setConfirmOpen(true);
  });

  const handleConfirmAdjust = handleSubmit(async (values) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await adjustInventory({
        productId: values.productId,
        lotId: values.lotId,
        adjustmentType: values.adjustmentType,
        quantityBaseUnits: values.quantity,
        reason: values.reason.trim(),
        notes: values.notes.trim() || undefined,
      });

      resetField('reason');
      resetField('notes');
      resetField('quantity');
      setConfirmOpen(false);
      onSuccess();
      onClose();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Error al procesar el ajuste de inventario.',
      );
      setConfirmOpen(false);
    } finally {
      submittingRef.current = false;
    }
  });

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
      <form noValidate onSubmit={handlePreSubmit}>
        <DialogTitle sx={{ fontWeight: 700 }}>Ajuste Manual de Inventario (Supervisor)</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

            <Alert severity="warning">
              Esta operación impacta de manera directa el libro mayor de movimientos (Kardex) y el
              saldo disponible en unidades base. Requiere motivo formal auditado.
            </Alert>

            <Controller
              name="productId"
              control={control}
              render={({ field: { ref, ...field }, fieldState }) => (
                <TextField
                  select
                  label="Producto"
                  {...field}
                  inputRef={ref}
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message}
                  onChange={(e) => {
                    field.onChange(e);
                    setValue('lotId', '');
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
              )}
            />

            <Controller
              name="lotId"
              control={control}
              render={({ field: { ref, ...field }, fieldState }) => (
                <TextField
                  select
                  label="Lote Específico"
                  {...field}
                  inputRef={ref}
                  error={Boolean(fieldState.error)}
                  required
                  fullWidth
                  disabled={isSubmitting || !productId}
                  helperText={
                    fieldState.error?.message ||
                    (selectedLot
                      ? `Saldo actual: ${selectedLot.currentQuantity} ${selectedLot.product?.baseUnit || 'UNIDADES'} (Vence: ${selectedLot.expirationDate})`
                      : 'Seleccione primero el producto')
                  }
                >
                  {availableLots.map((l) => (
                    <MenuItem key={l.id} value={l.id}>
                      {lotNumberLabel(l.lotNumber)} — Saldo: {l.currentQuantity} (Vence:{' '}
                      {expirationDateLabel(l.expirationDate)})
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />

            <Controller
              name="adjustmentType"
              control={control}
              render={({ field: { ref, ...field }, fieldState }) => (
                <TextField
                  select
                  label="Tipo de Ajuste"
                  {...field}
                  inputRef={ref}
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message}
                  required
                  fullWidth
                  disabled={isSubmitting}
                >
                  <MenuItem value="INCREMENTO">
                    Incremento (+ Ingreso de sobrante o conteo)
                  </MenuItem>
                  <MenuItem value="DECREMENTO">Decremento (- Merma, avería o pérdida)</MenuItem>
                </TextField>
              )}
            />

            <Controller
              name="quantity"
              control={control}
              render={({ field: { ref, ...field }, fieldState }) => (
                <TextField
                  label="Cantidad a Ajustar (en unidades base)"
                  type="number"
                  {...field}
                  inputRef={ref}
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? 0 : Number(e.target.value))
                  }
                  required
                  fullWidth
                  disabled={isSubmitting}
                />
              )}
            />

            <Controller
              name="reason"
              control={control}
              render={({ field: { ref, ...field }, fieldState }) => (
                <TextField
                  label="Motivo Justificado (Obligatorio)"
                  {...field}
                  inputRef={ref}
                  error={Boolean(fieldState.error)}
                  placeholder="Ej. Conteo físico mensual, frasco averiado en estantería..."
                  required
                  fullWidth
                  disabled={isSubmitting}
                  slotProps={{ htmlInput: { maxLength: INVENTORY_ADJUSTMENT_REASON_MAX_LENGTH } }}
                  helperText={
                    fieldState.error?.message ||
                    `${reason.length}/${INVENTORY_ADJUSTMENT_REASON_MAX_LENGTH}`
                  }
                />
              )}
            />

            <Controller
              name="notes"
              control={control}
              render={({ field: { ref, ...field }, fieldState }) => (
                <TextField
                  label="Notas Adicionales (Opcional)"
                  {...field}
                  inputRef={ref}
                  error={Boolean(fieldState.error)}
                  multiline
                  rows={2}
                  fullWidth
                  disabled={isSubmitting}
                  slotProps={{ htmlInput: { maxLength: INVENTORY_MOVEMENT_NOTES_MAX_LENGTH } }}
                  helperText={
                    fieldState.error?.message ||
                    `${notes.length}/${INVENTORY_MOVEMENT_NOTES_MAX_LENGTH}`
                  }
                />
              )}
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
          <Button
            onClick={onClose}
            disabled={isSubmitting}
            color="inherit"
            sx={{ textTransform: 'none' }}
          >
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
        onClose={() => {
          if (!submittingRef.current) setConfirmOpen(false);
        }}
        onConfirm={handleConfirmAdjust}
        isLoading={isSubmitting}
        title="Confirmar Ajuste en Kardex"
        description={
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              ¿Estás seguro de registrar un ajuste de tipo{' '}
              <strong>
                {adjustmentType === 'INCREMENTO' ? 'INCREMENTO (+)' : 'DECREMENTO (-)'}
              </strong>{' '}
              por{' '}
              <strong>
                {quantity} {selectedLot?.product?.baseUnit || 'unidades'}
              </strong>
              ?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Producto:</strong> {selectedProduct?.name || selectedLot?.product?.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Lote:</strong> {lotNumberLabel(selectedLot?.lotNumber)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Motivo:</strong> {reason}
            </Typography>
            <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
              ⚠️ Esta operación generará un movimiento de inventario inmutable y actualizará el
              saldo físico del lote.
            </Typography>
          </Stack>
        }
        confirmText="Asentar Ajuste"
        confirmColor={adjustmentType === 'DECREMENTO' ? 'error' : 'primary'}
      />
    </Dialog>
  );
};

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
} from '@mui/material';
import type { LocationDto, ProductDto } from '@farmacia/contracts';
import { createInventoryLot } from '../api/inventory.api';
import { INVENTORY_CONTROL_MODE_INFO } from '../../catalog/utils/inventory-control';

interface CreateLotDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  products: ProductDto[];
  locations: LocationDto[];
}

export const CreateLotDialog = ({
  open,
  onClose,
  onSuccess,
  products,
  locations,
}: CreateLotDialogProps) => {
  const [productId, setProductId] = useState('');
  const [locationId, setLocationId] = useState(
    locations.find((l) => l.isDefault)?.id || locations[0]?.id || '',
  );
  const [lotNumber, setLotNumber] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [initialQuantity, setInitialQuantity] = useState(0);

  // Lote, vencimiento y cantidad máxima dependen del modo de control del producto (ADR-006)
  const mode = products.find((p) => p.id === productId)?.inventoryControlMode;
  const needsLot = mode === 'LOT' || mode === 'LOT_EXPIRY' || mode === 'SERIAL';
  const needsExpiration = mode === 'LOT_EXPIRY';
  const stockProducts = products.filter((p) => p.inventoryControlMode !== 'SERVICE');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!productId) {
      setErrorMessage('Seleccione un producto.');
      return;
    }
    if (!locationId) {
      setErrorMessage('Seleccione una ubicación.');
      return;
    }
    if (needsLot && !lotNumber.trim()) {
      setErrorMessage(
        mode === 'SERIAL' ? 'Ingrese el número de serie.' : 'Ingrese el código de lote.',
      );
      return;
    }
    if (needsExpiration && !expirationDate) {
      setErrorMessage('Seleccione la fecha de vencimiento.');
      return;
    }
    if (mode === 'SERIAL' && initialQuantity > 1) {
      setErrorMessage('Una serie es una sola unidad: la cantidad inicial debe ser 0 o 1.');
      return;
    }

    try {
      setIsSubmitting(true);
      await createInventoryLot({
        productId,
        locationId,
        ...(needsLot ? { lotNumber: lotNumber.trim().toUpperCase() } : {}),
        ...(needsExpiration ? { expirationDate } : {}),
        initialQuantity: Number(initialQuantity) || 0,
      });

      // Reset
      setLotNumber('');
      setExpirationDate('');
      setInitialQuantity(0);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al registrar el lote de inventario.');
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
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700 }}>Registrar existencia de inventario</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

            <TextField
              select
              label="Producto"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
              fullWidth
              disabled={isSubmitting}
            >
              {stockProducts.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.code} — {p.name} ({p.baseUnit})
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Ubicación / Almacén"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              required
              fullWidth
              disabled={isSubmitting}
            >
              {locations.map((loc) => (
                <MenuItem key={loc.id} value={loc.id}>
                  {loc.code} — {loc.name} {loc.isDefault ? '(Principal)' : ''}
                </MenuItem>
              ))}
            </TextField>

            {mode && (
              <Alert severity="info" variant="outlined">
                {INVENTORY_CONTROL_MODE_INFO[mode].label}:{' '}
                {INVENTORY_CONTROL_MODE_INFO[mode].description}
              </Alert>
            )}

            {needsLot && (
              <TextField
                label={mode === 'SERIAL' ? 'Número de serie' : 'Código / Número de Lote'}
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder={mode === 'SERIAL' ? 'EJ. SN-000123' : 'EJ. LT-9872'}
                required
                fullWidth
                disabled={isSubmitting}
              />
            )}

            {needsExpiration && (
              <TextField
                label="Fecha de Vencimiento"
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                required
                fullWidth
                disabled={isSubmitting}
              />
            )}

            <TextField
              label="Cantidad Inicial (en unidades base)"
              type="number"
              value={initialQuantity}
              onChange={(e) => setInitialQuantity(Math.max(0, parseInt(e.target.value || '0', 10)))}
              helperText={
                mode === 'SERIAL'
                  ? 'Una serie tiene 0 o 1 unidad.'
                  : 'Saldo inicial en unidad base del producto. No se permiten valores negativos.'
              }
              fullWidth
              disabled={isSubmitting}
            />
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
            disabled={isSubmitting}
            sx={{
              fontWeight: 700,
              textTransform: 'none',
              px: 3,
              transition: 'transform 0.1s ease, background-color 0.15s ease',
              '&:active': { transform: 'scale(0.98)' },
            }}
          >
            {isSubmitting ? 'Registrando...' : 'Guardar existencia'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

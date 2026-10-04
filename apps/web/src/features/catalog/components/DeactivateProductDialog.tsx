import { useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import type { ProductDto } from '@farmacia/contracts';
import { ApiError } from '../../../api/http-client';
import { useDeactivateProduct } from '../hooks/useProducts';

interface DeactivateProductDialogProps {
  open: boolean;
  onClose: () => void;
  product: ProductDto | null;
  onSuccess?: (product: ProductDto) => void;
}

export function DeactivateProductDialog({
  open,
  onClose,
  product,
  onSuccess,
}: DeactivateProductDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const deactivateMutation = useDeactivateProduct();
  const isDeactivating = deactivateMutation.isPending;

  const handleConfirm = async () => {
    if (!product) return;
    setErrorMessage(null);

    try {
      await deactivateMutation.mutateAsync(product.id);
      onSuccess?.(product);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
        return;
      }
      setErrorMessage('No fue posible inactivar el producto. Intenta nuevamente.');
    }
  };

  const handleClose = () => {
    if (!isDeactivating) {
      setErrorMessage(null);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="deactivate-product-dialog-title"
    >
      <DialogTitle id="deactivate-product-dialog-title">Inactivar Producto</DialogTitle>
      <DialogContent>
        {errorMessage ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMessage}
          </Alert>
        ) : null}

        <DialogContentText variant="body2" color="text.secondary">
          ¿Estás seguro de que deseas inactivar el producto{' '}
          <strong>{product?.name}</strong> (SKU: {product?.code})?
        </DialogContentText>

        <DialogContentText variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Esta acción deshabilitará el producto para la creación de nuevas ventas y recepciones de
          compra. Los movimientos de inventario históricos, lotes pasados y ventas previas
          conservarán su trazabilidad intacta.
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={handleClose} disabled={isDeactivating} color="inherit">
          Cancelar
        </Button>
        <Button
          onClick={() => void handleConfirm()}
          color="error"
          variant="contained"
          disabled={isDeactivating}
          startIcon={isDeactivating ? <CircularProgress size={18} color="inherit" /> : null}
        >
          {isDeactivating ? 'Inactivando…' : 'Sí, inactivar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

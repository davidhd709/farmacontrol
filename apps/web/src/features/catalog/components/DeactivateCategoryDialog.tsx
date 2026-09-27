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
import type { CategoryDto } from '@farmacia/contracts';
import { ApiError } from '../../../api/http-client';
import { useDeactivateCategory } from '../hooks/useCategories';

interface DeactivateCategoryDialogProps {
  open: boolean;
  onClose: () => void;
  category: CategoryDto | null;
}

export function DeactivateCategoryDialog({
  open,
  onClose,
  category,
}: DeactivateCategoryDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const deactivateMutation = useDeactivateCategory();
  const isDeactivating = deactivateMutation.isPending;

  const handleConfirm = async () => {
    if (!category) return;
    setErrorMessage(null);

    try {
      await deactivateMutation.mutateAsync(category.id);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
        return;
      }
      setErrorMessage('No fue posible inactivar la categoría. Intenta nuevamente.');
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
      aria-labelledby="deactivate-category-dialog-title"
    >
      <DialogTitle id="deactivate-category-dialog-title">Inactivar Categoría</DialogTitle>
      <DialogContent>
        {errorMessage ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMessage}
          </Alert>
        ) : null}

        <DialogContentText variant="body2" color="text.secondary">
          ¿Estás seguro de que deseas inactivar la categoría{' '}
          <strong>{category?.name}</strong>?
        </DialogContentText>

        <DialogContentText variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Esta acción deshabilitará la categoría para la creación de nuevos productos. Los
          productos que ya la tengan asignada conservarán su información histórica sin alteraciones.
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

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import type { CategoryDto } from '@farmacia/contracts';
import { ApiError } from '../../../api/http-client';
import { useCreateCategory, useUpdateCategory } from '../hooks/useCategories';
import { categorySchema, type CategoryFormValues } from '../validation/category.schema';

interface CategoryFormDialogProps {
  open: boolean;
  onClose: () => void;
  category?: CategoryDto | null;
}

export function CategoryFormDialog({ open, onClose, category }: CategoryFormDialogProps) {
  const isEditing = Boolean(category);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  useEffect(() => {
    if (open) {
      setSubmitError(null);
      reset({
        name: category?.name ?? '',
        description: category?.description ?? '',
      });
    }
  }, [open, category, reset]);

  const onSubmit = async (values: CategoryFormValues) => {
    setSubmitError(null);
    try {
      if (isEditing && category) {
        await updateMutation.mutateAsync({
          id: category.id,
          payload: {
            name: values.name,
            description: values.description ? values.description : null,
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: values.name,
          description: values.description ? values.description : null,
        });
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          setError('name', {
            type: 'manual',
            message: 'Ya existe una categoría con este nombre.',
          });
          return;
        }
        setSubmitError(error.message);
        return;
      }
      setSubmitError('Ocurrió un error inesperado al procesar la categoría.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={isSubmitting ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="category-dialog-title"
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogTitle id="category-dialog-title">
          {isEditing ? 'Editar Categoría' : 'Nueva Categoría'}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <DialogContentText variant="body2" color="text.secondary">
              {isEditing
                ? 'Modifica la información básica de la categoría. Los productos asociados mantendrán la referencia.'
                : 'Ingresa los datos para registrar una nueva categoría en el catálogo de productos.'}
            </DialogContentText>

            {submitError ? (
              <Alert severity="error" onClose={() => setSubmitError(null)}>
                {submitError}
              </Alert>
            ) : null}

            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  id="category-name-input"
                  label="Nombre de la categoría"
                  placeholder="Ej. Analgésicos, Antibióticos, Cuidado Personal"
                  autoFocus
                  required
                  fullWidth
                  disabled={isSubmitting}
                  error={Boolean(errors.name)}
                  helperText={errors.name?.message}
                  slotProps={{
                    htmlInput: {
                      maxLength: 100,
                      'aria-required': 'true',
                    },
                  }}
                />
              )}
            />

            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  id="category-description-input"
                  label="Descripción (opcional)"
                  placeholder="Describe el propósito o alcance de esta categoría..."
                  multiline
                  rows={3}
                  fullWidth
                  disabled={isSubmitting}
                  error={Boolean(errors.description)}
                  helperText={errors.description?.message}
                  slotProps={{
                    htmlInput: {
                      maxLength: 500,
                    },
                  }}
                />
              )}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={isSubmitting} color="inherit">
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {isSubmitting ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear categoría'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

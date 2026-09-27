import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  InputAdornment,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import type { ProductDto, ProductPresentationDto } from '@farmacia/contracts';
import { ApiError } from '../../../api/http-client';
import {
  useCreatePresentation,
  useUpdatePresentation,
} from '../hooks/usePresentations';
import {
  presentationSchema,
  type PresentationFormValues,
} from '../validation/presentation.schema';

interface PresentationFormDialogProps {
  open: boolean;
  onClose: () => void;
  product: ProductDto;
  presentation?: ProductPresentationDto | null;
}

export function PresentationFormDialog({
  open,
  onClose,
  product,
  presentation,
}: PresentationFormDialogProps) {
  const isEditing = Boolean(presentation);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createMutation = useCreatePresentation(product.id);
  const updateMutation = useUpdatePresentation(product.id);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const {
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<PresentationFormValues>({
    resolver: zodResolver(presentationSchema),
    defaultValues: {
      name: '',
      barcode: '',
      conversionFactor: 1,
      price: 0,
      cost: 0,
      isDefault: false,
    },
  });

  const watchedName = watch('name');
  const watchedFactor = watch('conversionFactor') || 1;
  const watchedPrice = watch('price') || 0;
  const watchedCost = watch('cost') || 0;

  useEffect(() => {
    if (open) {
      setSubmitError(null);
      if (presentation) {
        reset({
          name: presentation.name,
          barcode: presentation.barcode ?? '',
          conversionFactor: presentation.conversionFactor,
          price: parseFloat(presentation.price) || 0,
          cost: parseFloat(presentation.cost) || 0,
          isDefault: presentation.isDefault,
        });
      } else {
        reset({
          name: '',
          barcode: '',
          conversionFactor: 1,
          price: parseFloat(product.basePrice) || 0,
          cost: parseFloat(product.baseCost) || 0,
          isDefault: false,
        });
      }
    }
  }, [open, presentation, product, reset]);

  const onSubmit = async (values: PresentationFormValues) => {
    setSubmitError(null);

    try {
      if (isEditing && presentation) {
        await updateMutation.mutateAsync({
          presentationId: presentation.id,
          payload: {
            name: values.name,
            barcode: values.barcode?.trim() || null,
            conversionFactor: values.conversionFactor,
            price: values.price,
            cost: values.cost,
            isDefault: values.isDefault,
          },
        });
      } else {
        await createMutation.mutateAsync({
          productId: product.id,
          name: values.name,
          barcode: values.barcode?.trim() || null,
          conversionFactor: values.conversionFactor,
          price: values.price,
          cost: values.cost,
          isDefault: values.isDefault,
        });
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          const lower = err.message.toLowerCase();
          if (lower.includes('código de barras') || lower.includes('barcode')) {
            setError('barcode', { message: err.message });
          } else {
            setError('name', { message: err.message });
          }
          return;
        }
        setSubmitError(err.message);
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Ocurrió un error inesperado al guardar la presentación.');
      }
    }
  };

  const unitEquivalentPrice =
    watchedFactor > 0 ? (watchedPrice / watchedFactor).toFixed(2) : '0.00';
  const unitEquivalentCost =
    watchedFactor > 0 ? (watchedCost / watchedFactor).toFixed(2) : '0.00';
  const estimatedMargin =
    watchedPrice > 0
      ? (((watchedPrice - watchedCost) / watchedPrice) * 100).toFixed(1)
      : '0.0';

  return (
    <Dialog
      open={open}
      onClose={isSubmitting ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="presentation-dialog-title"
    >
      <DialogTitle id="presentation-dialog-title">
        {isEditing
          ? 'Editar Presentación Comercial'
          : 'Nueva Presentación Comercial'}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Producto: <strong>{product.name}</strong> (Unidad base:{' '}
          <strong style={{ textTransform: 'uppercase' }}>{product.baseUnit}</strong>)
        </Typography>
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent dividers>
          <Stack spacing={2.5}>
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
                  id="presentation-name-input"
                  label="Nombre de la presentación"
                  placeholder="Ej: Caja x 30 tabletas, Blíster x 10, Frasco x 120ml"
                  required
                  fullWidth
                  error={Boolean(errors.name)}
                  helperText={errors.name?.message}
                />
              )}
            />

            <Controller
              name="barcode"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  id="presentation-barcode-input"
                  label="Código de barras comercial (GTIN/EAN)"
                  placeholder="Ej: 7701234567890"
                  fullWidth
                  error={Boolean(errors.barcode)}
                  helperText={
                    errors.barcode?.message ||
                    'Opcional. Código de barras específico para esta presentación de empaque.'
                  }
                />
              )}
            />

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
              }}
            >
              <Controller
                name="conversionFactor"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    id="presentation-factor-input"
                    type="number"
                    label="Factor de conversión"
                    required
                    fullWidth
                    slotProps={{
                      htmlInput: { min: 1, step: 1 },
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            {product.baseUnit}
                          </InputAdornment>
                        ),
                      },
                    }}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === '' ? '' : parseInt(e.target.value, 10),
                      )
                    }
                    error={Boolean(errors.conversionFactor)}
                    helperText={
                      errors.conversionFactor?.message ||
                      `Unidades base (${product.baseUnit}) contenidas en este empaque comercial.`
                    }
                  />
                )}
              />

              <Controller
                name="isDefault"
                control={control}
                render={({ field }) => (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Presentación principal
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Sugerida por defecto en ventas
                      </Typography>
                    </Box>
                    <FormControlLabel
                      control={
                        <Switch
                          id="presentation-is-default-switch"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                        />
                      }
                      label=""
                      sx={{ m: 0 }}
                    />
                  </Paper>
                )}
              />
            </Box>

            <Divider />

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
              }}
            >
              <Controller
                name="price"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    id="presentation-price-input"
                    type="number"
                    label="Precio de venta al público"
                    required
                    fullWidth
                    slotProps={{
                      htmlInput: { min: 0, step: 'any' },
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">$</InputAdornment>
                        ),
                      },
                    }}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === '' ? '' : parseFloat(e.target.value),
                      )
                    }
                    error={Boolean(errors.price)}
                    helperText={errors.price?.message}
                  />
                )}
              />

              <Controller
                name="cost"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    id="presentation-cost-input"
                    type="number"
                    label="Costo de referencia"
                    fullWidth
                    slotProps={{
                      htmlInput: { min: 0, step: 'any' },
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">$</InputAdornment>
                        ),
                      },
                    }}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === '' ? '' : parseFloat(e.target.value),
                      )
                    }
                    error={Boolean(errors.cost)}
                    helperText={errors.cost?.message || 'Costo promedio o de última compra'}
                  />
                )}
              />
            </Box>

            {/* Vista previa matemática de equivalencia */}
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                bgcolor: 'action.hover',
                borderRadius: 1,
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Resumen de Equivalencia
              </Typography>
              <Stack spacing={0.5}>
                <Typography variant="body2">
                  • 1 {watchedName || 'presentación'} ={' '}
                  <strong>
                    {watchedFactor} {product.baseUnit}
                  </strong>
                </Typography>
                <Typography variant="body2">
                  • Precio unitario equivalente:{' '}
                  <strong>${unitEquivalentPrice}</strong> por {product.baseUnit}
                </Typography>
                <Typography variant="body2">
                  • Costo unitario equivalente:{' '}
                  <strong>${unitEquivalentCost}</strong> por {product.baseUnit}
                </Typography>
                <Typography variant="body2">
                  • Margen comercial estimado:{' '}
                  <strong
                    style={{
                      color: parseFloat(estimatedMargin) >= 0 ? '#2e7d32' : '#d32f2f',
                    }}
                  >
                    {estimatedMargin}%
                  </strong>
                </Typography>
              </Stack>
            </Paper>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={16} /> : null}
            data-testid="save-presentation-btn"
          >
            {isSubmitting
              ? 'Guardando…'
              : isEditing
                ? 'Actualizar Presentación'
                : 'Crear Presentación'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

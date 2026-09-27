import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormHelperText,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import type {
  ProductDto,
  ProductPresentationDto,
  UnitOfMeasureDto,
} from '@farmacia/contracts';
import { ApiError } from '../../../api/http-client';
import { useUnitsOfMeasure } from '../hooks/useUnitsOfMeasure';
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
  availablePresentations?: ProductPresentationDto[];
}

export function PresentationFormDialog({
  open,
  onClose,
  product,
  presentation,
  availablePresentations = [],
}: PresentationFormDialogProps) {
  const isEditing = Boolean(presentation);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: uomData, isLoading: isLoadingUoms } = useUnitsOfMeasure({
    isActive: true,
    pageSize: 100,
  });
  const uoms = uomData?.items ?? [];

  const createMutation = useCreatePresentation(product.id);
  const updateMutation = useUpdatePresentation(product.id);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  // Filtrar presentaciones que pueden ser contenidas (evitar autoreferencia si estamos editando)
  const validContainedOptions = useMemo(() => {
    return availablePresentations.filter((p) => {
      if (isEditing && presentation && p.id === presentation.id) {
        return false;
      }
      return p.isActive;
    });
  }, [availablePresentations, isEditing, presentation]);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PresentationFormValues>({
    resolver: zodResolver(presentationSchema),
    defaultValues: {
      unitOfMeasureId: '',
      containedPresentationId: '',
      name: '',
      barcode: '',
      quantityContained: 1,
      price: 0,
      cost: 0,
      purchaseEnabled: true,
      saleEnabled: true,
      isDefault: false,
      isDefaultPurchase: false,
      isDefaultSale: false,
    },
  });

  const watchedUomId = watch('unitOfMeasureId');
  const watchedContainedId = watch('containedPresentationId');
  const watchedQuantity = watch('quantityContained') || 1;
  const watchedPrice = watch('price') || 0;
  const watchedCost = watch('cost') || 0;
  const watchedCustomName = watch('name');

  // Encontrar UoM seleccionada
  const selectedUom = useMemo(() => {
    return uoms.find((u: UnitOfMeasureDto) => u.id === watchedUomId);
  }, [uoms, watchedUomId]);

  // Encontrar presentación contenida seleccionada
  const selectedContainedPresentation = useMemo(() => {
    if (!watchedContainedId) return null;
    return availablePresentations.find((p) => p.id === watchedContainedId) || null;
  }, [availablePresentations, watchedContainedId]);

  // Nombre calculado o sugerido para la presentación
  const presentationDisplayName = useMemo(() => {
    if (watchedCustomName && watchedCustomName.trim()) {
      return watchedCustomName.trim();
    }
    return selectedUom?.name || 'Presentación';
  }, [watchedCustomName, selectedUom]);

  // Factor de la presentación contenida (1 si es unidad base)
  const containedFactor = selectedContainedPresentation ? selectedContainedPresentation.conversionFactor : 1;
  const containedName = selectedContainedPresentation ? selectedContainedPresentation.name : `Unidad base (${product.baseUnit})`;

  // Factor base calculado total
  const calculatedBaseUnits = watchedQuantity * containedFactor;

  // Actualizar valores al abrir
  useEffect(() => {
    if (open) {
      setSubmitError(null);
      if (presentation) {
        reset({
          unitOfMeasureId: presentation.unitOfMeasureId ?? '',
          containedPresentationId: presentation.containedPresentationId ?? '',
          name: presentation.name,
          barcode: presentation.barcode ?? '',
          quantityContained: presentation.quantityContained || presentation.conversionFactor || 1,
          price: parseFloat(presentation.price) || 0,
          cost: parseFloat(presentation.cost) || 0,
          purchaseEnabled: presentation.purchaseEnabled ?? true,
          saleEnabled: presentation.saleEnabled ?? true,
          isDefault: presentation.isDefault ?? false,
          isDefaultPurchase: presentation.isDefaultPurchase ?? false,
          isDefaultSale: presentation.isDefaultSale ?? presentation.isDefault ?? false,
        });
      } else {
        reset({
          unitOfMeasureId: '',
          containedPresentationId: '',
          name: '',
          barcode: '',
          quantityContained: 1,
          price: parseFloat(product.basePrice) || 0,
          cost: parseFloat(product.baseCost) || 0,
          purchaseEnabled: true,
          saleEnabled: true,
          isDefault: false,
          isDefaultPurchase: false,
          isDefaultSale: false,
        });
      }
    }
  }, [open, presentation, product, reset]);

  // Sugerir nombre cuando cambia la unidad de medida si no se ha escrito manualmente
  const handleUomChange = (uomId: string) => {
    setValue('unitOfMeasureId', uomId);
    const uom = uoms.find((u: UnitOfMeasureDto) => u.id === uomId);
    if (uom && (!watchedCustomName || watchedCustomName.trim() === '')) {
      setValue('name', uom.name);
    }
  };

  const onSubmit = async (values: PresentationFormValues) => {
    setSubmitError(null);

    const finalName = (values.name || selectedUom?.name || 'Presentación').trim();

    try {
      if (isEditing && presentation) {
        const updatePayload: any = {
          name: finalName,
          barcode: values.barcode?.trim() || null,
          price: values.price,
          cost: values.cost,
          isDefault: values.isDefaultSale || values.isDefault,
        };
        if (values.unitOfMeasureId) updatePayload.unitOfMeasureId = values.unitOfMeasureId;
        if (values.containedPresentationId) updatePayload.containedPresentationId = values.containedPresentationId;
        if (values.quantityContained !== undefined) updatePayload.quantityContained = values.quantityContained;
        if (values.purchaseEnabled !== undefined) updatePayload.purchaseEnabled = values.purchaseEnabled;
        if (values.saleEnabled !== undefined) updatePayload.saleEnabled = values.saleEnabled;
        if (values.isDefaultPurchase !== undefined) updatePayload.isDefaultPurchase = values.isDefaultPurchase;
        if (values.isDefaultSale !== undefined) updatePayload.isDefaultSale = values.isDefaultSale;

        await updateMutation.mutateAsync({
          presentationId: presentation.id,
          payload: updatePayload,
        });
      } else {
        const createPayload: any = {
          productId: product.id,
          name: finalName,
          barcode: values.barcode?.trim() || null,
          conversionFactor: values.quantityContained,
          price: values.price,
          cost: values.cost,
          isDefault: values.isDefaultSale || values.isDefault,
        };
        if (values.unitOfMeasureId) createPayload.unitOfMeasureId = values.unitOfMeasureId;
        if (values.containedPresentationId) createPayload.containedPresentationId = values.containedPresentationId;
        if (values.quantityContained !== undefined && values.unitOfMeasureId) {
          createPayload.quantityContained = values.quantityContained;
        }
        if (values.purchaseEnabled !== undefined && values.unitOfMeasureId) {
          createPayload.purchaseEnabled = values.purchaseEnabled;
        }
        if (values.saleEnabled !== undefined && values.unitOfMeasureId) {
          createPayload.saleEnabled = values.saleEnabled;
        }
        if (values.isDefaultPurchase !== undefined && values.unitOfMeasureId) {
          createPayload.isDefaultPurchase = values.isDefaultPurchase;
        }
        if (values.isDefaultSale !== undefined && values.unitOfMeasureId) {
          createPayload.isDefaultSale = values.isDefaultSale;
        }

        await createMutation.mutateAsync(createPayload);
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
    calculatedBaseUnits > 0 ? (watchedPrice / calculatedBaseUnits).toFixed(2) : '0.00';
  const unitEquivalentCost =
    calculatedBaseUnits > 0 ? (watchedCost / calculatedBaseUnits).toFixed(2) : '0.00';
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
        <Typography variant="body2" component="div" color="text.secondary" sx={{ mt: 0.5 }}>
          Producto: <strong>{product.name}</strong> • Unidad base:{' '}
          <Chip
            label={product.baseUnit}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 700, textTransform: 'uppercase', ml: 0.5 }}
          />
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

            {/* SECCIÓN 1: DEFINICIÓN DE EMPAQUE JERÁRQUICO */}
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                1. Estructura y Empaque del Producto
              </Typography>

              <Stack spacing={2}>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 2,
                  }}
                >
                  <Controller
                    name="unitOfMeasureId"
                    control={control}
                    render={({ field }) => (
                      <FormControl fullWidth size="small" error={Boolean(errors.unitOfMeasureId)}>
                        <InputLabel id="presentation-uom-label">Tipo de presentación</InputLabel>
                        <Select
                          labelId="presentation-uom-label"
                          id="presentation-uom-select"
                          value={field.value || ''}
                          label="Tipo de presentación"
                          onChange={(e) => handleUomChange(e.target.value)}
                          disabled={isLoadingUoms}
                        >
                          <MenuItem value="">
                            <em>Personalizada / Sin catálogo</em>
                          </MenuItem>
                          {uoms.map((uom: UnitOfMeasureDto) => (
                            <MenuItem key={uom.id} value={uom.id}>
                              {uom.name} ({uom.code})
                            </MenuItem>
                          ))}
                        </Select>
                        <FormHelperText>
                          {selectedUom?.description || 'Selecciona el tipo de empaque (ej. Blíster, Caja, Six-Pack)'}
                        </FormHelperText>
                      </FormControl>
                    )}
                  />

                  <Controller
                    name="name"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        id="presentation-name-input"
                        label="Nombre de la presentación"
                        placeholder="Ej: Blíster, Caja, Six-Pack"
                        fullWidth
                        size="small"
                        error={Boolean(errors.name)}
                        helperText={errors.name?.message || 'Nombre descriptivo de la presentación.'}
                      />
                    )}
                  />
                </Box>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1.5fr' },
                    gap: 2,
                    alignItems: 'flex-start',
                  }}
                >
                  <Controller
                    name="quantityContained"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        id="presentation-quantity-contained-input"
                        type="number"
                        label="Factor de conversión"
                        required
                        fullWidth
                        size="small"
                        slotProps={{
                          htmlInput: { min: 1, step: 1 },
                        }}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === '' ? '' : parseInt(e.target.value, 10),
                          )
                        }
                        error={Boolean(errors.quantityContained)}
                        helperText={errors.quantityContained?.message || 'Cantidad física contenida'}
                      />
                    )}
                  />

                  <Controller
                    name="containedPresentationId"
                    control={control}
                    render={({ field }) => (
                      <FormControl fullWidth size="small">
                        <InputLabel id="contained-presentation-label">Unidad o Empaque contenido</InputLabel>
                        <Select
                          labelId="contained-presentation-label"
                          id="contained-presentation-select"
                          value={field.value || ''}
                          label="Unidad o Empaque contenido"
                          onChange={(e) => field.onChange(e.target.value || null)}
                        >
                          <MenuItem value="">
                            <strong>Unidad base: {product.baseUnit}</strong> (contiene unidades base)
                          </MenuItem>
                          {validContainedOptions.map((pres) => (
                            <MenuItem key={pres.id} value={pres.id}>
                              {pres.name} (equivale a x{pres.conversionFactor} {product.baseUnit})
                            </MenuItem>
                          ))}
                        </Select>
                        <FormHelperText>
                          {selectedContainedPresentation
                            ? `Contiene unidades de: ${selectedContainedPresentation.name}`
                            : `Contiene directamente ${product.baseUnit} sueltas.`}
                        </FormHelperText>
                      </FormControl>
                    )}
                  />
                </Box>

                {/* VISTA PREVIA DEL MOTOR DE CONVERSIÓN EN LENGUAJE NATURAL */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    bgcolor: 'info.lighter',
                    border: '1px solid',
                    borderColor: 'info.light',
                    borderRadius: 1.5,
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'info.main', display: 'block', mb: 0.5 }}>
                    Resumen de Equivalencia:
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    1 {presentationDisplayName} = {watchedQuantity} {containedName}
                    {selectedContainedPresentation ? (
                      <span style={{ color: '#1976d2' }}>
                        {' '}= {calculatedBaseUnits.toLocaleString('es-CO')} {product.baseUnit}
                      </span>
                    ) : null}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Total ingresado o descontado de inventario por cada empaque:{' '}
                    <strong>{calculatedBaseUnits.toLocaleString('es-CO')} {product.baseUnit}</strong>
                  </Typography>
                </Paper>
              </Stack>
            </Paper>

            {/* SECCIÓN 2: PRECIOS Y CÓDIGO DE BARRAS */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              2. Precios y Código de Barras
            </Typography>

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
                  size="small"
                  error={Boolean(errors.barcode)}
                  helperText={
                    errors.barcode?.message ||
                    'Opcional. Código de barras exclusivo de este empaque comercial.'
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
                name="price"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    id="presentation-price-input"
                    type="number"
                    label="Precio de venta al público"
                    fullWidth
                    size="small"
                    slotProps={{
                      htmlInput: { min: 0, step: 'any' },
                      input: {
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      },
                    }}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))
                    }
                    error={Boolean(errors.price)}
                    helperText={
                      watchedPrice > 0
                        ? `Equivale a $${unitEquivalentPrice} por cada ${product.baseUnit}`
                        : 'Precio de venta al público para este empaque.'
                    }
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
                    size="small"
                    slotProps={{
                      htmlInput: { min: 0, step: 'any' },
                      input: {
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      },
                    }}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))
                    }
                    error={Boolean(errors.cost)}
                    helperText={
                      watchedCost > 0
                        ? `Costo unitario base: $${unitEquivalentCost} | Margen: ${estimatedMargin}%`
                        : 'Costo comercial de compra de referencia.'
                    }
                  />
                )}
              />
            </Box>

            <Divider />

            {/* SECCIÓN 3: DISPONIBILIDAD Y OPCIONES */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              3. Disponibilidad Operativa
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1.5,
              }}
            >
              <Controller
                name="purchaseEnabled"
                control={control}
                render={({ field }) => (
                  <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>Disponible en Compras</Typography>
                      <Typography variant="caption" color="text.secondary">Habilitada para recibir a proveedores</Typography>
                    </Box>
                    <Switch
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      id="presentation-purchase-enabled-switch"
                    />
                  </Paper>
                )}
              />

              <Controller
                name="saleEnabled"
                control={control}
                render={({ field }) => (
                  <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>Disponible en Ventas (POS)</Typography>
                      <Typography variant="caption" color="text.secondary">Habilitada para facturar a clientes</Typography>
                    </Box>
                    <Switch
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      id="presentation-sale-enabled-switch"
                    />
                  </Paper>
                )}
              />

              <Controller
                name="isDefaultSale"
                control={control}
                render={({ field }) => (
                  <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>Principal en Ventas</Typography>
                      <Typography variant="caption" color="text.secondary">Opción sugerida por defecto en POS</Typography>
                    </Box>
                    <Switch
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      id="presentation-is-default-sale-switch"
                    />
                  </Paper>
                )}
              />

              <Controller
                name="isDefaultPurchase"
                control={control}
                render={({ field }) => (
                  <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>Principal en Compras</Typography>
                      <Typography variant="caption" color="text.secondary">Sugerida al recibir facturas</Typography>
                    </Box>
                    <Switch
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      id="presentation-is-default-purchase-switch"
                    />
                  </Paper>
                )}
              />
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting} variant="outlined" color="inherit">
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={16} /> : undefined}
            data-testid="save-presentation-btn"
            id="save-presentation-btn"
          >
            {isEditing ? 'Guardar Cambios' : 'Guardar Presentación'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

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
  FormControl,
  FormControlLabel,
  FormHelperText,
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
import type { ProductDto } from '@farmacia/contracts';
import { ApiError } from '../../../api/http-client';
import { useCategories } from '../hooks/useCategories';
import { useUnitsOfMeasure } from '../hooks/useUnitsOfMeasure';
import { useCreateProduct, useUpdateProduct } from '../hooks/useProducts';
import { productSchema, type ProductFormValues } from '../validation/product.schema';

interface ProductFormDialogProps {
  open: boolean;
  onClose: () => void;
  product?: ProductDto | null;
  onManagePresentations?: (product: ProductDto) => void;
}

export function ProductFormDialog({
  open,
  onClose,
  product,
  onManagePresentations,
}: ProductFormDialogProps) {
  const isEditing = Boolean(product);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: categoriesData, isLoading: isLoadingCategories } = useCategories({
    isActive: true,
    pageSize: 100,
  });

  const { data: unitsData } = useUnitsOfMeasure({
    isActive: true,
    pageSize: 100,
  });
  const units = unitsData?.items || [];

  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      categoryId: '',
      code: '',
      barcode: '',
      name: '',
      genericName: '',
      concentration: '',
      sanitaryRegistry: '',
      manufacturer: '',
      description: '',
      requiresLotControl: true,
      prescriptionRequired: false,
      baseUnit: 'UNIDAD',
      basePrice: 0,
      baseCost: 0,
    },
  });

  useEffect(() => {
    if (open) {
      setSubmitError(null);
      if (product) {
        reset({
          categoryId: product.categoryId,
          code: product.code,
          barcode: product.barcode ?? '',
          name: product.name,
          genericName: product.genericName ?? '',
          concentration: product.concentration ?? '',
          sanitaryRegistry: product.sanitaryRegistry ?? '',
          manufacturer: product.manufacturer ?? '',
          description: product.description ?? '',
          requiresLotControl: product.requiresLotControl,
          prescriptionRequired: product.prescriptionRequired,
          baseUnit: product.baseUnit,
          basePrice: parseFloat(product.basePrice) || 0,
          baseCost: parseFloat(product.baseCost) || 0,
        });
      } else {
        reset({
          categoryId: '',
          code: '',
          barcode: '',
          name: '',
          genericName: '',
          concentration: '',
          sanitaryRegistry: '',
          manufacturer: '',
          description: '',
          requiresLotControl: true,
          prescriptionRequired: false,
          baseUnit: 'UNIDAD',
          basePrice: 0,
          baseCost: 0,
        });
      }
    }
  }, [open, product, reset]);

  const onSubmit = async (values: ProductFormValues) => {
    setSubmitError(null);
    try {
      const payload = {
        categoryId: values.categoryId,
        code: values.code,
        barcode: values.barcode ? values.barcode : null,
        name: values.name,
        genericName: values.genericName ? values.genericName : null,
        concentration: values.concentration ? values.concentration : null,
        sanitaryRegistry: values.sanitaryRegistry ? values.sanitaryRegistry : null,
        manufacturer: values.manufacturer ? values.manufacturer : null,
        description: values.description ? values.description : null,
        requiresLotControl: values.requiresLotControl,
        prescriptionRequired: values.prescriptionRequired,
        baseUnit: values.baseUnit,
        basePrice: values.basePrice,
        baseCost: values.baseCost ?? 0,
      };

      if (isEditing && product) {
        await updateMutation.mutateAsync({
          id: product.id,
          payload,
        });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          if (error.message.includes('código de barras')) {
            setError('barcode', {
              type: 'manual',
              message: 'Ya existe un producto registrado con este código de barras.',
            });
            return;
          }
          setError('code', {
            type: 'manual',
            message: 'Ya existe un producto registrado con este código interno (SKU).',
          });
          return;
        }
        setSubmitError(error.message);
        return;
      }
      setSubmitError('Ocurrió un error inesperado al procesar el producto.');
    }
  };

  const categories = categoriesData?.items ?? [];

  return (
    <Dialog
      open={open}
      onClose={isSubmitting ? undefined : onClose}
      maxWidth="md"
      fullWidth
      aria-labelledby="product-dialog-title"
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogTitle id="product-dialog-title">
          {isEditing ? `Editar Producto: ${product?.name}` : 'Registrar Nuevo Producto'}
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={3}>
            {submitError ? (
              <Alert severity="error" onClose={() => setSubmitError(null)}>
                {submitError}
              </Alert>
            ) : null}

            {isEditing && product && onManagePresentations ? (
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  bgcolor: 'action.hover',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Presentaciones Comerciales y Factores
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Configura cajas, blísteres y equivalencias a unidad base ({product.baseUnit}).
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  color="secondary"
                  size="small"
                  onClick={() => {
                    onClose();
                    onManagePresentations(product);
                  }}
                  data-testid="configure-presentations-shortcut-btn"
                >
                  Configurar
                </Button>
              </Paper>
            ) : null}

            {/* SECCIÓN 1: Identificación y Clasificación */}
            <Box>
              <Typography
                variant="subtitle2"
                color="primary.main"
                sx={{ fontWeight: 700, mb: 1.5 }}
              >
                1. Identificación y Clasificación
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 2,
                }}
              >
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      id="product-name-input"
                      label="Nombre comercial"
                      placeholder="Ej. Acetaminofén 500mg, Amoxicilina"
                      required
                      fullWidth
                      disabled={isSubmitting}
                      error={Boolean(errors.name)}
                      helperText={errors.name?.message}
                      slotProps={{ htmlInput: { maxLength: 150 } }}
                    />
                  )}
                />

                <Controller
                  name="categoryId"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth required error={Boolean(errors.categoryId)}>
                      <InputLabel id="product-category-label">Categoría</InputLabel>
                      <Select
                        {...field}
                        labelId="product-category-label"
                        id="product-category-select"
                        label="Categoría"
                        disabled={isSubmitting || isLoadingCategories}
                      >
                        {categories.map((c) => (
                          <MenuItem key={c.id} value={c.id}>
                            {c.name}
                          </MenuItem>
                        ))}
                      </Select>
                      {errors.categoryId ? (
                        <FormHelperText>{errors.categoryId.message}</FormHelperText>
                      ) : null}
                    </FormControl>
                  )}
                />

                <Controller
                  name="code"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      id="product-code-input"
                      label="Código interno (SKU)"
                      placeholder="Ej. MED-001, AMOX-500"
                      required
                      fullWidth
                      disabled={isSubmitting}
                      error={Boolean(errors.code)}
                      helperText={errors.code?.message}
                      slotProps={{ htmlInput: { maxLength: 50 } }}
                    />
                  )}
                />

                <Controller
                  name="barcode"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      id="product-barcode-input"
                      label="Código de barras (EAN/UPC)"
                      placeholder="Ej. 7701234567890 (opcional)"
                      fullWidth
                      disabled={isSubmitting}
                      error={Boolean(errors.barcode)}
                      helperText={errors.barcode?.message}
                      slotProps={{ htmlInput: { maxLength: 50 } }}
                    />
                  )}
                />
              </Box>
            </Box>

            <Divider />

            {/* SECCIÓN 2: Atributos Farmacéuticos */}
            <Box>
              <Typography
                variant="subtitle2"
                color="primary.main"
                sx={{ fontWeight: 700, mb: 1.5 }}
              >
                2. Atributos Farmacéuticos y Regulatorios
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 2,
                }}
              >
                <Controller
                  name="genericName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      id="product-generic-name-input"
                      label="Principio activo (DCI) (opcional)"
                      placeholder="Ej. Paracetamol, Amoxicilina"
                      fullWidth
                      disabled={isSubmitting}
                      error={Boolean(errors.genericName)}
                      helperText={errors.genericName?.message}
                      slotProps={{ htmlInput: { maxLength: 150 } }}
                    />
                  )}
                />

                <Controller
                  name="concentration"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      id="product-concentration-input"
                      label="Concentración (opcional)"
                      placeholder="Ej. 500 mg, 1 g, 250 mg/5 mL"
                      fullWidth
                      disabled={isSubmitting}
                      error={Boolean(errors.concentration)}
                      helperText={errors.concentration?.message}
                      slotProps={{ htmlInput: { maxLength: 50 } }}
                    />
                  )}
                />

                <Controller
                  name="sanitaryRegistry"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      id="product-sanitary-registry-input"
                      label="Registro Sanitario / INVIMA (opcional)"
                      placeholder="Ej. INVIMA 2021M-001234"
                      fullWidth
                      disabled={isSubmitting}
                      error={Boolean(errors.sanitaryRegistry)}
                      helperText={errors.sanitaryRegistry?.message}
                      slotProps={{ htmlInput: { maxLength: 50 } }}
                    />
                  )}
                />

                <Controller
                  name="manufacturer"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      id="product-manufacturer-input"
                      label="Laboratorio Fabricante"
                      placeholder="Ej. Laboratorios Farmacia, Genfar"
                      fullWidth
                      disabled={isSubmitting}
                      error={Boolean(errors.manufacturer)}
                      helperText={errors.manufacturer?.message}
                      slotProps={{ htmlInput: { maxLength: 100 } }}
                    />
                  )}
                />
              </Box>
            </Box>

            <Divider />

            {/* SECCIÓN 3: Parámetros de Precios e Inventario */}
            <Box>
              <Typography
                variant="subtitle2"
                color="primary.main"
                sx={{ fontWeight: 700, mb: 1.5 }}
              >
                3. Precios y Control de Inventario
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' },
                  gap: 2,
                }}
              >
                <Controller
                  name="basePrice"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      id="product-base-price-input"
                      label="Precio base ($)"
                      type="number"
                      required
                      fullWidth
                      disabled={isSubmitting}
                      error={Boolean(errors.basePrice)}
                      helperText={errors.basePrice?.message}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)
                      }
                      slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
                    />
                  )}
                />

                <Controller
                  name="baseCost"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      id="product-base-cost-input"
                      label="Costo base ($)"
                      type="number"
                      fullWidth
                      disabled={isSubmitting}
                      error={Boolean(errors.baseCost)}
                      helperText={errors.baseCost?.message}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)
                      }
                      slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
                    />
                  )}
                />

                <Controller
                  name="baseUnit"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth required error={Boolean(errors.baseUnit)}>
                      <InputLabel id="product-base-unit-label">Unidad Mínima / Base</InputLabel>
                      <Select
                        {...field}
                        labelId="product-base-unit-label"
                        id="product-base-unit-input"
                        label="Unidad Mínima / Base"
                        disabled={isSubmitting}
                      >
                        {units.length > 0 ? (
                          units.map((u) => (
                            <MenuItem key={u.id} value={u.code}>
                              {u.name} ({u.code}) — {u.category}
                            </MenuItem>
                          ))
                        ) : (
                          <MenuItem value="UNIDAD">UNIDAD (Estándar)</MenuItem>
                        )}
                        {field.value && !units.some((u) => u.code === field.value) && (
                          <MenuItem value={field.value}>{field.value} (Personalizada)</MenuItem>
                        )}
                      </Select>
                      <FormHelperText>
                        {errors.baseUnit?.message ||
                          'Unidad indivisible en la que se cuenta el stock físico (Kardex)'}
                      </FormHelperText>
                    </FormControl>
                  )}
                />
              </Box>

              <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                <Controller
                  name="requiresLotControl"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          disabled={isSubmitting}
                        />
                      }
                      label="Control por lote y vencimiento (FEFO)"
                    />
                  )}
                />

                <Controller
                  name="prescriptionRequired"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          disabled={isSubmitting}
                        />
                      }
                      label="Venta bajo fórmula médica"
                    />
                  )}
                />
              </Box>
            </Box>

            <Divider />

            {/* SECCIÓN 4: Descripción */}
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  id="product-description-input"
                  label="Descripción y notas adicionales (opcional)"
                  placeholder="Detalles sobre presentación, indicaciones o almacenamiento..."
                  multiline
                  rows={2}
                  fullWidth
                  disabled={isSubmitting}
                  error={Boolean(errors.description)}
                  helperText={errors.description?.message}
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                />
              )}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting} color="inherit">
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {isSubmitting ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Registrar producto'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

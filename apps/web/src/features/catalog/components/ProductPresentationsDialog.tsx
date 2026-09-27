import { useState } from 'react';
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
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  SYSTEM_PERMISSIONS,
  type ProductDto,
  type ProductPresentationDto,
} from '@farmacia/contracts';
import { PermissionGate } from '../../auth/components/PermissionGate';
import {
  useConvertPresentation,
  useDeactivatePresentation,
  useProductPresentations,
  useUpdatePresentation,
} from '../hooks/usePresentations';
import { PresentationFormDialog } from './PresentationFormDialog';

interface ProductPresentationsDialogProps {
  open: boolean;
  onClose: () => void;
  product: ProductDto | null;
}

export function ProductPresentationsDialog({
  open,
  onClose,
  product,
}: ProductPresentationsDialogProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedPresentation, setSelectedPresentation] =
    useState<ProductPresentationDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Conversion calculator state
  const [calcPresentationId, setCalcPresentationId] = useState<string>('');
  const [calcDirection, setCalcDirection] = useState<'toBase' | 'fromBase'>('toBase');
  const [calcQuantity, setCalcQuantity] = useState<number>(1);
  const [calcResult, setCalcResult] = useState<string | null>(null);

  const {
    data: presentations = [],
    isLoading,
    isError,
    error,
  } = useProductPresentations(product?.id);

  const deactivateMutation = useDeactivatePresentation(product?.id || '');
  const updateMutation = useUpdatePresentation(product?.id || '');
  const convertMutation = useConvertPresentation(product?.id || '');

  if (!product) return null;

  const handleOpenCreate = () => {
    setSelectedPresentation(null);
    setIsFormOpen(true);
    setActionError(null);
  };

  const handleOpenEdit = (pres: ProductPresentationDto) => {
    setSelectedPresentation(pres);
    setIsFormOpen(true);
    setActionError(null);
  };

  const handleDeactivate = async (pres: ProductPresentationDto) => {
    setActionError(null);
    try {
      await deactivateMutation.mutateAsync(pres.id);
    } catch (err) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('No fue posible inactivar la presentación.');
      }
    }
  };

  const handleReactivate = async (pres: ProductPresentationDto) => {
    setActionError(null);
    try {
      await updateMutation.mutateAsync({
        presentationId: pres.id,
        payload: { isActive: true },
      });
    } catch (err) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('No fue posible reactivar la presentación.');
      }
    }
  };

  const handleSetDefault = async (pres: ProductPresentationDto) => {
    setActionError(null);
    try {
      await updateMutation.mutateAsync({
        presentationId: pres.id,
        payload: { isDefault: true },
      });
    } catch (err) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('No fue posible marcar la presentación como principal.');
      }
    }
  };

  const handleRunConversion = async () => {
    const targetPresentationId = calcPresentationId || presentations[0]?.id;
    if (!targetPresentationId) return;
    try {
      const response = await convertMutation.mutateAsync({
        presentationId: targetPresentationId,
        payload: {
          quantity: calcQuantity,
          direction: calcDirection,
        },
      });

      const pres = presentations.find((p) => p.id === targetPresentationId);
      const presName = pres?.name || 'Presentación';

      if (calcDirection === 'toBase') {
        const baseResult = (response.result as { baseUnits: number }).baseUnits;
        setCalcResult(
          `${calcQuantity} ${presName} = ${baseResult} ${product.baseUnit}(s)`,
        );
      } else {
        const fromResult = response.result as {
          wholePresentations: number;
          remainderBaseUnits: number;
        };
        setCalcResult(
          `${calcQuantity} ${product.baseUnit}(s) = ${fromResult.wholePresentations} ${presName} + ${fromResult.remainderBaseUnits} ${product.baseUnit}(s) sueltas`,
        );
      }
    } catch (err) {
      if (err instanceof Error) {
        setCalcResult(`Error: ${err.message}`);
      }
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
        aria-labelledby="product-presentations-dialog-title"
      >
        <DialogTitle id="product-presentations-dialog-title">
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', sm: 'center' },
              gap: 1,
            }}
          >
            <Box>
              <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
                Presentaciones Comerciales y Equivalencias
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                <Typography variant="body2" color="text.secondary" component="span">
                  {product.name} • SKU: <strong>{product.code}</strong> • Unidad base:
                </Typography>
                <Chip
                  label={product.baseUnit}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
              </Box>
            </Box>

            <PermissionGate permission={SYSTEM_PERMISSIONS.PRODUCTS_MANAGE}>
              <Button
                variant="contained"
                size="small"
                onClick={handleOpenCreate}
                data-testid="add-presentation-btn"
              >
                + Agregar Presentación
              </Button>
            </PermissionGate>
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={3}>
            {actionError ? (
              <Alert severity="error" onClose={() => setActionError(null)}>
                {actionError}
              </Alert>
            ) : null}

            {isError ? (
              <Alert severity="error">
                {error instanceof Error
                  ? error.message
                  : 'No fue posible cargar las presentaciones comerciales.'}
              </Alert>
            ) : null}

            <Alert severity="info" variant="outlined">
              <Typography variant="body2">
                <strong>Control de Unidades Base:</strong> El inventario central, lotes y
                vencimientos se gestionan en unidad base (
                <strong>{product.baseUnit}</strong>). Las presentaciones comerciales permiten
                vender y comprar en cajas, blísteres o frascos usando factores de conversión exactos.
              </Typography>
            </Alert>

            {/* Tabla de presentaciones */}
            <Paper variant="outlined">
              <TableContainer>
                <Table aria-label="Tabla de presentaciones comerciales">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Presentación</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Factor de Conversión</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Código de Barras</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        Precio Venta
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        Costo Ref.
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="center">
                        Principal
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        Acciones
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                          <CircularProgress size={28} />
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            Cargando presentaciones…
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : presentations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            No hay presentaciones comerciales registradas
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            Agrega al menos una presentación (ej: Unidad factor 1 o Caja factor 30)
                            para habilitar ventas.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      presentations.map((pres) => {
                        const priceNum = parseFloat(pres.price) || 0;
                        const costNum = parseFloat(pres.cost) || 0;
                        const margin =
                          priceNum > 0
                            ? (((priceNum - costNum) / priceNum) * 100).toFixed(1)
                            : '0.0';

                        return (
                          <TableRow key={pres.id} hover>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {pres.name}
                              </Typography>
                              {pres.isDefault ? (
                                <Chip
                                  label="Por defecto"
                                  size="small"
                                  color="success"
                                  variant="filled"
                                  sx={{ fontSize: '0.7rem', height: 20, mt: 0.5 }}
                                />
                              ) : null}
                            </TableCell>

                            <TableCell>
                              <Chip
                                label={`x ${pres.conversionFactor} ${product.baseUnit}`}
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ fontWeight: 600 }}
                              />
                            </TableCell>

                            <TableCell sx={{ fontFamily: 'monospace' }}>
                              {pres.barcode || '—'}
                            </TableCell>

                            <TableCell align="right" sx={{ fontWeight: 600 }}>
                              ${priceNum.toLocaleString('es-CO', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>

                            <TableCell align="right" sx={{ color: 'text.secondary' }}>
                              ${costNum.toLocaleString('es-CO', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                              <Typography variant="caption" sx={{ display: 'block' }} color="text.secondary">
                                Margen: {margin}%
                              </Typography>
                            </TableCell>

                            <TableCell align="center">
                              {pres.isDefault ? (
                                <Tooltip title="Presentación principal predeterminada en punto de venta">
                                  <Chip
                                    label="★ Principal"
                                    color="success"
                                    size="small"
                                    sx={{ fontWeight: 700 }}
                                  />
                                </Tooltip>
                              ) : (
                                <PermissionGate permission={SYSTEM_PERMISSIONS.PRODUCTS_MANAGE}>
                                  <Button
                                    size="small"
                                    variant="text"
                                    onClick={() => handleSetDefault(pres)}
                                    disabled={!pres.isActive}
                                    sx={{ fontSize: '0.75rem' }}
                                  >
                                    Fijar principal
                                  </Button>
                                </PermissionGate>
                              )}
                            </TableCell>

                            <TableCell>
                              <Chip
                                label={pres.isActive ? 'Activo' : 'Inactivo'}
                                color={pres.isActive ? 'success' : 'default'}
                                size="small"
                                variant={pres.isActive ? 'filled' : 'outlined'}
                              />
                            </TableCell>

                            <TableCell align="right">
                              <PermissionGate permission={SYSTEM_PERMISSIONS.PRODUCTS_MANAGE}>
                                <Box
                                  sx={{
                                    display: 'flex',
                                    flexDirection: 'row',
                                    gap: 1,
                                    justifyContent: 'flex-end',
                                  }}
                                >
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => handleOpenEdit(pres)}
                                  >
                                    Editar
                                  </Button>
                                  {pres.isActive ? (
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="error"
                                      disabled={pres.isDefault}
                                      onClick={() => handleDeactivate(pres)}
                                    >
                                      Inactivar
                                    </Button>
                                  ) : (
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="success"
                                      onClick={() => handleReactivate(pres)}
                                    >
                                      Reactivar
                                    </Button>
                                  )}
                                </Box>
                              </PermissionGate>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            <Divider />

            {/* Simulador / Calculadora de Equivalencias */}
            {presentations.length > 0 ? (
              <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'background.paper' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  Calculadora de Equivalencia Comercial
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Verifica cómo el motor de conversión transforma las cantidades de empaque en
                  unidades base y calcula sobrantes enteros.
                </Typography>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      sm: '1.5fr 1.5fr 1fr auto',
                    },
                    gap: 2,
                    alignItems: 'center',
                  }}
                >
                  <FormControl size="small" fullWidth>
                    <InputLabel id="calc-pres-label">Presentación</InputLabel>
                    <Select
                      labelId="calc-pres-label"
                      id="calc-pres-select"
                      value={calcPresentationId || presentations[0]?.id || ''}
                      label="Presentación"
                      onChange={(e) => setCalcPresentationId(e.target.value)}
                    >
                      {presentations.map((p) => (
                        <MenuItem key={p.id} value={p.id}>
                          {p.name} (x{p.conversionFactor} {product.baseUnit})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" fullWidth>
                    <InputLabel id="calc-dir-label">Dirección</InputLabel>
                    <Select
                      labelId="calc-dir-label"
                      id="calc-dir-select"
                      value={calcDirection}
                      label="Dirección"
                      onChange={(e) =>
                        setCalcDirection(e.target.value as 'toBase' | 'fromBase')
                      }
                    >
                      <MenuItem value="toBase">
                        Presentación ➔ Unidad base ({product.baseUnit})
                      </MenuItem>
                      <MenuItem value="fromBase">
                        Unidad base ({product.baseUnit}) ➔ Presentación
                      </MenuItem>
                    </Select>
                  </FormControl>

                  <TextField
                    size="small"
                    type="number"
                    label="Cantidad"
                    value={calcQuantity}
                    onChange={(e) => setCalcQuantity(parseInt(e.target.value, 10) || 1)}
                    slotProps={{
                      htmlInput: { min: 1, step: 1 },
                    }}
                  />

                  <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleRunConversion}
                    disabled={convertMutation.isPending}
                    data-testid="calculate-conversion-btn"
                  >
                    {convertMutation.isPending ? 'Calculando…' : 'Calcular'}
                  </Button>
                </Box>

                {calcResult ? (
                  <Alert severity="success" sx={{ mt: 2 }} variant="filled">
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Resultado: {calcResult}
                    </Typography>
                  </Alert>
                ) : null}
              </Paper>
            ) : null}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} variant="outlined">
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Subdialogo de formulario de presentación */}
      <PresentationFormDialog
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        product={product}
        presentation={selectedPresentation}
      />
    </>
  );
}

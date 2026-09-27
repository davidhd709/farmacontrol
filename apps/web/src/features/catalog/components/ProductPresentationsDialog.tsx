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

  const handleSetDefaultSale = async (pres: ProductPresentationDto) => {
    setActionError(null);
    try {
      await updateMutation.mutateAsync({
        presentationId: pres.id,
        payload: { isDefault: true, isDefaultSale: true },
      });
    } catch (err) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('No fue posible marcar la presentación como principal de venta.');
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

      // Manejo seguro tanto si viene plano como si viene en response.result
      const resData = response as any;
      const baseUnitsValue = resData.baseUnits ?? resData.result?.baseUnits;
      const pres = presentations.find((p) => p.id === targetPresentationId);
      const presName = pres?.name || 'Presentación';

      if (calcDirection === 'toBase') {
        const baseUnits = baseUnitsValue !== undefined ? baseUnitsValue : calcQuantity * (pres?.conversionFactor || 1);
        let breakdown = `${calcQuantity} ${presName} = ${baseUnits} ${product.baseUnit}(s)`;
        
        // Si la presentación contiene otra presentación (jerarquía)
        if (pres?.containedPresentationId && pres.containedPresentationName) {
          const intermediateQty = calcQuantity * (pres.quantityContained || 1);
          breakdown = `${calcQuantity} ${presName} = ${intermediateQty} ${pres.containedPresentationName} = ${baseUnits} ${product.baseUnit}(s)`;
        }

        setCalcResult(breakdown);
      } else {
        const whole = resData.wholePresentations ?? Math.floor(calcQuantity / (pres?.conversionFactor || 1));
        const rem = resData.remainderBaseUnits ?? (calcQuantity % (pres?.conversionFactor || 1));
        setCalcResult(
          `${calcQuantity.toLocaleString('es-CO')} ${product.baseUnit}(s) = ${whole.toLocaleString('es-CO')} ${presName}${
            rem > 0 ? ` + ${rem} ${product.baseUnit}(s) sueltas` : ' (empaque exacto)'
          }`,
        );
      }
    } catch (err) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('Ocurrió un error al calcular la equivalencia.');
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
              <Typography variant="h6" component="div">
                Presentaciones Comerciales y Equivalencias
              </Typography>
              <Typography variant="body2" component="div" color="text.secondary">
                Producto: <strong>{product.name}</strong> • SKU: <span>{product.code}</span> • Unidad mínima Kardex:{' '}
                <Chip
                  label={product.baseUnit}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 700, textTransform: 'uppercase', ml: 0.5 }}
                />
              </Typography>
            </Box>

            <PermissionGate permission={SYSTEM_PERMISSIONS.PRODUCTS_MANAGE}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleOpenCreate}
                data-testid="add-presentation-btn"
                id="add-presentation-btn"
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

            {/* UNIDAD BASE DE KARDEX */}
            <Paper
              elevation={0}
              sx={{
                p: 2,
                bgcolor: 'primary.lighter',
                border: '1px solid',
                borderColor: 'primary.light',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5,
              }}
            >
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.dark' }}>
                  Unidad Base de Inventario (Kardex y Lotes): {product.baseUnit}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Todas las compras, existencias físicas, lotes con FEFO y movimientos se gestionan estrictamente en esta unidad mínima.
                </Typography>
              </Box>
              <Chip
                label="Factor Base = 1 (Unidad Indivisible)"
                color="primary"
                size="small"
                sx={{ fontWeight: 600 }}
              />
            </Paper>

            {/* TABLA DE PRESENTACIONES COMERCIALES */}
            <Paper variant="outlined">
              <TableContainer>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Presentación</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Contiene</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Equivalencia Base</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Código de Barras</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        Precio Comercial
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        Costo / Margen
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>
                        Canales
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>
                        Predeterminada
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        Acciones
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                          <CircularProgress size={28} />
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            Cargando presentaciones…
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : isError ? (
                      <TableRow>
                        <TableCell colSpan={10} align="center" sx={{ py: 3 }}>
                          <Alert severity="error">
                            {error instanceof Error
                              ? error.message
                              : 'No fue posible cargar las presentaciones comerciales.'}
                          </Alert>
                        </TableCell>
                      </TableRow>
                    ) : presentations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                          <Typography variant="body2" color="text.secondary">
                            Este producto aún no tiene presentaciones comerciales configuradas.
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Se opera por defecto en su unidad base ({product.baseUnit}).
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

                        // Descripción de lo que contiene físicamente
                        const containsDescription = pres.containedPresentationId && pres.containedPresentationName
                          ? `${pres.quantityContained} ${pres.containedPresentationName}`
                          : `${pres.quantityContained} ${product.baseUnit} (Base)`;

                        return (
                          <TableRow key={pres.id} hover>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {pres.name}
                              </Typography>
                              {pres.unitOfMeasureCode ? (
                                <Chip
                                  label={pres.unitOfMeasureCode}
                                  size="small"
                                  variant="outlined"
                                  sx={{ fontSize: '0.65rem', height: 18, mt: 0.2 }}
                                />
                              ) : null}
                            </TableCell>

                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {containsDescription}
                              </Typography>
                            </TableCell>

                            <TableCell>
                              <Chip
                                label={`x ${pres.conversionFactor.toLocaleString('es-CO')} ${product.baseUnit}`}
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ fontWeight: 700 }}
                              />
                            </TableCell>

                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                              {pres.barcode || '—'}
                            </TableCell>

                            <TableCell align="right" sx={{ fontWeight: 600 }}>
                              ${priceNum.toLocaleString('es-CO', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                              {pres.conversionFactor > 1 && priceNum > 0 ? (
                                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                                  ${(priceNum / pres.conversionFactor).toFixed(2)} / {product.baseUnit}
                                </Typography>
                              ) : null}
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
                              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                {pres.purchaseEnabled ? (
                                  <Chip label="Compra" size="small" color="info" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                                ) : null}
                                {pres.saleEnabled ? (
                                  <Chip label="Venta" size="small" color="success" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                                ) : null}
                              </Box>
                            </TableCell>

                            <TableCell align="center">
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'center' }}>
                                {pres.isDefault || pres.isDefaultSale ? (
                                  <Chip
                                    label="★ Principal"
                                    color="primary"
                                    size="small"
                                    sx={{ fontWeight: 700, fontSize: '0.7rem', height: 22 }}
                                  />
                                ) : (
                                  <PermissionGate permission={SYSTEM_PERMISSIONS.PRODUCTS_MANAGE}>
                                    <Button
                                      size="small"
                                      variant="text"
                                      onClick={() => handleSetDefaultSale(pres)}
                                      disabled={!pres.isActive || !pres.saleEnabled}
                                      sx={{ fontSize: '0.7rem', py: 0 }}
                                    >
                                      Fijar Venta
                                    </Button>
                                  </PermissionGate>
                                )}
                                {pres.isDefaultPurchase ? (
                                  <Chip
                                    label="★ Compra"
                                    color="info"
                                    size="small"
                                    sx={{ fontWeight: 700, fontSize: '0.65rem', height: 20 }}
                                  />
                                ) : null}
                              </Box>
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
                                    id={`edit-pres-${pres.id}`}
                                  >
                                    Editar
                                  </Button>
                                  {pres.isActive ? (
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="error"
                                      disabled={pres.isDefault || pres.isDefaultSale}
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

            {/* CALCULADORA DE EQUIVALENCIAS COMERCIALES */}
            {presentations.length > 0 ? (
              <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'background.paper' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Calculadora de Equivalencia Comercial y Sobrantes
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Verifica en tiempo real cómo el motor calcula la transformación de empaques a unidades base del Kardex y viceversa.
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
                        Empaque ➔ Unidades Base ({product.baseUnit})
                      </MenuItem>
                      <MenuItem value="fromBase">
                        Unidades Base ({product.baseUnit}) ➔ Empaques
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
                    variant="contained"
                    color="primary"
                    onClick={handleRunConversion}
                    disabled={convertMutation.isPending}
                    data-testid="calculate-conversion-btn"
                    id="calculate-conversion-btn"
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
        availablePresentations={presentations}
      />
    </>
  );
}

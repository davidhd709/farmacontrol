import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  Divider,
  MenuItem,
  IconButton,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import type {
  CustomerDto,
  InventoryControlMode,
  ProductDto,
  ProductPresentationDto,
  SaleDto,
  SalePaymentMethod,
} from '@farmacia/contracts';
import { fetchDefaultCustomer } from '../../customers/api/customers.api';
import { CustomerFormDialog } from '../../customers/components/CustomerFormDialog';
import { PosProductSearch } from '../components/PosProductSearch';
import { PosCustomerSelector } from '../components/PosCustomerSelector';
import { fromCents, toCents, formatMoney, lineAmounts } from '../../../utils/money';
import { confirmSale } from '../api/sales.api';
import { PosPaymentDialog } from '../components/PosPaymentDialog';
import { PosSerialPicker } from '../components/PosSerialPicker';
import { SaleReceiptDialog } from '../components/SaleReceiptDialog';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { SweetModal } from '../../../components/SweetModal';

interface CartItem {
  productId: string;
  productCode: string;
  productName: string;
  baseUnit: string;
  inventoryControlMode: InventoryControlMode;
  /** Series elegidas para entregar; solo en productos SERIAL */
  serialNumbers: string[];
  // Monetary fields in this cart are integer cents; API payloads retain major units.
  basePrice: number;
  availableStock?: number;
  availablePresentations?: ProductPresentationDto[];
  presentationId?: string | null;
  presentationName?: string | null;
  presentationFactor: number;
  quantityCommercial: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  /** F6: impuesto nacional al consumo de la línea (porcentaje) */
  incRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export const PosPage: React.FC = () => {
  // Cliente Seleccionado (por defecto Consumidor Final)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDto | null>(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);

  // Búsqueda de Productos
  // Clave de idempotencia estable mientras el contenido de la venta no cambie: un reintento
  // tras un fallo de red no puede registrar la venta dos veces.
  const saleRetryRef = useRef<{ fingerprint: string; key: string } | null>(null);

  // Carrito de Ventas
  const [cart, setCart] = useState<CartItem[]>([]);

  // Modales de Cobro y Comprobante
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [receiptSale, setReceiptSale] = useState<SaleDto | null>(null);

  // Notificaciones y errores
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Una línea SERIAL solo se cobra con una serie por cada unidad base
  const serialsPending = cart.some(
    (item) =>
      item.inventoryControlMode === 'SERIAL' &&
      item.serialNumbers.length !== item.quantityCommercial * item.presentationFactor,
  );
  const canCharge = cart.length > 0 && !serialsPending;

  // Referencia al buscador para autoenfoque
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Atajo de teclado global F2 para liquidar venta rápidamente
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        if (canCharge && !paymentDialogOpen && !receiptSale) {
          setPaymentDialogOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canCharge, paymentDialogOpen, receiptSale]);

  // Cargar cliente por defecto al iniciar
  useEffect(() => {
    const initDefaultCustomer = async () => {
      try {
        const def = await fetchDefaultCustomer();
        setSelectedCustomer((current) => current ?? def);
      } catch (err) {
        console.error('Error al cargar cliente por defecto:', err);
      }
    };
    initDefaultCustomer();
  }, []);

  // Calcular el total de unidades base de un producto ya reservadas en las demás líneas del carrito
  const getCartProductTotalBaseUnits = (
    items: CartItem[],
    productId: string,
    excludeIndex = -1,
  ): number => {
    return items.reduce((acc, it, idx) => {
      if (idx === excludeIndex || it.productId !== productId) return acc;
      return acc + it.quantityCommercial * it.presentationFactor;
    }, 0);
  };

  // Agregar ítem al carrito con validación de existencia vigente (no vencida)
  const handleAddToCart = (product: ProductDto, presentation?: ProductPresentationDto | null) => {
    setErrorMsg(null);

    // F6: sin clasificación de IVA el backend rechaza la venta; se explica antes del cobro
    if (product.saleTax?.missingClassification) {
      const msg = `"${product.name}" no tiene clasificación de IVA para la venta. Clasifíquelo en el catálogo (Impuestos) antes de venderlo.`;
      setErrorMsg(msg);
      setSnackbar({ open: true, message: msg, severity: 'warning' });
      return;
    }

    // Validación P0: Prevenir agregar productos sin existencias vigentes
    if (product.availableStock !== undefined && product.availableStock <= 0) {
      const msg = `El producto "${product.name}" no tiene existencias disponibles o lotes vigentes para la venta.`;
      setErrorMsg(msg);
      setSnackbar({
        open: true,
        message: msg,
        severity: 'warning',
      });
      return;
    }

    const salePresentations = (product.presentations || []).filter(
      (p) => p.isActive && (p.saleEnabled ?? true),
    );
    const defaultSalePres =
      salePresentations.find((p) => p.isDefaultSale) ||
      salePresentations.find((p) => p.isDefault) ||
      null;

    const chosenPres = presentation !== undefined ? presentation : defaultSalePres;
    const factor = chosenPres ? chosenPres.conversionFactor : 1;
    const price = toCents(chosenPres ? chosenPres.price : product.basePrice);
    const presId = chosenPres ? chosenPres.id : null;
    const presName = chosenPres ? chosenPres.name : null;

    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (item) => item.productId === product.id && item.presentationId === presId,
      );

      const otherBase = getCartProductTotalBaseUnits(prev, product.id, existingIdx);
      const newQty = existingIdx >= 0 ? prev[existingIdx].quantityCommercial + 1 : 1;
      const totalBaseRequired = otherBase + newQty * factor;

      if (product.availableStock !== undefined && totalBaseRequired > product.availableStock) {
        setErrorMsg(
          `Stock insuficiente para "${product.name}": requiere ${totalBaseRequired} ${product.baseUnit}, pero sólo hay ${product.availableStock} disponibles.`,
        );
        return prev;
      }

      if (existingIdx >= 0) {
        const updated = [...prev];
        const item = updated[existingIdx];
        const { subtotal, taxAmount, total } = lineAmounts(
          newQty,
          item.unitPrice,
          item.discount,
          item.taxRate,
          item.incRate,
        );
        updated[existingIdx] = {
          ...item,
          quantityCommercial: newQty,
          subtotal,
          taxAmount,
          total,
        };
        return updated;
      }

      const qty = 1;
      // F6: las tarifas vigentes del producto llegan del backend para calcular igual que él
      const taxRate = Number(product.saleTax?.ivaRatePct ?? 0);
      const incRate = Number(product.saleTax?.incRatePct ?? 0);
      const { subtotal, taxAmount, total } = lineAmounts(qty, price, 0, taxRate, incRate);

      return [
        ...prev,
        {
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          baseUnit: product.baseUnit,
          inventoryControlMode: product.inventoryControlMode,
          serialNumbers: [],
          basePrice: toCents(product.basePrice),
          availableStock: product.availableStock,
          availablePresentations: salePresentations,
          presentationId: presId,
          presentationName: presName,
          presentationFactor: factor,
          quantityCommercial: qty,
          unitPrice: price,
          discount: 0,
          taxRate,
          incRate,
          subtotal,
          taxAmount,
          total,
        },
      ];
    });
  };

  // Cambiar presentación de un producto existente en el carrito
  const handleChangePresentation = (index: number, newPresId: string | null) => {
    setCart((prev) => {
      const item = prev[index];
      const pres = item.availablePresentations?.find((p) => p.id === newPresId) || null;
      const factor = pres ? pres.conversionFactor : 1;
      const otherBase = getCartProductTotalBaseUnits(prev, item.productId, index);
      const totalBaseRequired = otherBase + item.quantityCommercial * factor;

      if (item.availableStock !== undefined && totalBaseRequired > item.availableStock) {
        setErrorMsg(
          `Stock insuficiente para "${item.productName}" en esta presentación: requiere ${totalBaseRequired} ${item.baseUnit}, pero sólo hay ${item.availableStock} disponibles.`,
        );
        return prev;
      }

      setErrorMsg(null);
      const unitPrice = pres ? toCents(pres.price) : item.basePrice;
      const presName = pres ? pres.name : null;
      const { subtotal, taxAmount, total } = lineAmounts(
        item.quantityCommercial,
        unitPrice,
        item.discount,
        item.taxRate,
        item.incRate,
      );

      const updated = [...prev];
      updated[index] = {
        ...item,
        presentationId: newPresId,
        presentationName: presName,
        presentationFactor: factor,
        unitPrice,
        subtotal,
        taxAmount,
        total,
      };
      return updated;
    });
  };

  const handleUpdateQty = (index: number, newQty: number) => {
    if (!Number.isSafeInteger(newQty) || newQty <= 0) return;
    setCart((prev) => {
      const item = prev[index];
      const otherBase = getCartProductTotalBaseUnits(prev, item.productId, index);
      const totalBaseRequired = otherBase + newQty * item.presentationFactor;

      if (item.availableStock !== undefined && totalBaseRequired > item.availableStock) {
        setErrorMsg(
          `Stock insuficiente para "${item.productName}": requiere ${totalBaseRequired} ${item.baseUnit}, pero sólo hay ${item.availableStock} disponibles.`,
        );
        return prev;
      }

      setErrorMsg(null);
      const updated = [...prev];
      const { subtotal, taxAmount, total } = lineAmounts(
        newQty,
        item.unitPrice,
        item.discount,
        item.taxRate,
        item.incRate,
      );
      updated[index] = {
        ...item,
        quantityCommercial: newQty,
        subtotal,
        taxAmount,
        total,
      };
      return updated;
    });
  };

  const handleChangeSerials = (index: number, serialNumbers: string[]) => {
    setCart((prev) => prev.map((item, idx) => (idx === index ? { ...item, serialNumbers } : item)));
  };

  const handleRemoveItem = (index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleClearCart = () => {
    setCart([]);
    setErrorMsg(null);
  };

  // Cálculo de totales agregados
  const cartSubtotal = cart.reduce((acc, item) => acc + item.subtotal, 0);
  const cartDiscount = cart.reduce((acc, item) => acc + item.discount, 0);
  const cartTax = cart.reduce((acc, item) => acc + item.taxAmount, 0);
  const cartTotal = cart.reduce((acc, item) => acc + item.total, 0);

  // Proceso de confirmación de venta
  const handleConfirmSale = async (
    paymentMethod: SalePaymentMethod,
    amountPaid: number,
    notes?: string,
    bankAccountId?: string,
  ) => {
    if (cart.length === 0) {
      throw new Error('El carrito de venta está vacío.');
    }

    setPaymentLoading(true);
    setErrorMsg(null);
    try {
      const payload = {
        customerId: selectedCustomer?.id,
        paymentMethod,
        bankAccountId,
        amountPaid,
        notes,
        items: cart.map((item) => ({
          productId: item.productId,
          presentationId: item.presentationId || undefined,
          quantityCommercial: item.quantityCommercial,
          discount: item.discount > 0 ? fromCents(item.discount) : undefined,
          ...(item.inventoryControlMode === 'SERIAL' ? { serialNumbers: item.serialNumbers } : {}),
        })),
      };

      const fingerprint = JSON.stringify(payload);
      if (saleRetryRef.current?.fingerprint !== fingerprint) {
        saleRetryRef.current = { fingerprint, key: crypto.randomUUID() };
      }

      const completedSale = await confirmSale(payload, saleRetryRef.current.key);
      saleRetryRef.current = null;
      setPaymentDialogOpen(false);
      setReceiptSale(completedSale);
      setCart([]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la venta';
      setErrorMsg(msg);
      throw err;
    } finally {
      setPaymentLoading(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, margin: '0 auto' }}>
      {/* Encabezado y Selector de Cliente */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 800, color: 'text.primary' }}>
            Punto de Venta (POS)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Dispensación y facturación rápida con asignación automática FEFO.
          </Typography>
        </Box>

        {/* Tarjeta de Cliente Activo */}
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            maxWidth: '100%',
            gap: 2,
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Cliente Actual:
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {selectedCustomer ? selectedCustomer.name : 'Cargando cliente...'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Doc: {selectedCustomer?.documentNumber}{' '}
              {selectedCustomer?.isDefault && '(Consumidor Final)'}
            </Typography>
          </Box>
          <PosCustomerSelector
            onSelect={setSelectedCustomer}
            onCreate={() => setCustomerModalOpen(true)}
          />
        </Paper>
      </Box>

      {errorMsg && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      {/* Grid Principal: Búsqueda y Carrito vs Totales */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1fr 340px' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Box>
          {/* Barra de Búsqueda Rápida de Productos */}
          <Paper sx={{ p: 2, mb: 2 }} elevation={1}>
            <PosProductSearch
              inputRef={searchInputRef}
              onSelect={(product) => handleAddToCart(product, null)}
            />
          </Paper>

          {/* Tabla de Artículos en el Carrito */}
          <TableContainer component={Paper} elevation={1}>
            <Table size="small" aria-label="carrito de ventas">
              <TableHead sx={{ bgcolor: 'action.hover' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Producto / Unidad de Venta</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, width: 120 }}>
                    Cantidad
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    Precio Unit.
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    Total
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, width: 80 }}>
                    Acción
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cart.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                      <Typography variant="body1" color="text.secondary">
                        El carrito está vacío. Escanee o busque un producto para comenzar la venta.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  cart.map((item, idx) => (
                    <TableRow key={`${item.productId}-${item.presentationId || 'base'}`} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {item.productName}
                        </Typography>
                        {item.availablePresentations && item.availablePresentations.length > 0 ? (
                          <Box sx={{ mt: 0.5, mb: 0.5 }}>
                            <TextField
                              select
                              label={`Presentación de ${item.productName}`}
                              size="small"
                              value={item.presentationId || ''}
                              onChange={(e) =>
                                handleChangePresentation(idx, e.target.value || null)
                              }
                              sx={{ minWidth: 200 }}
                              slotProps={{ select: { sx: { py: 0.4, fontSize: '0.8rem' } } }}
                            >
                              <MenuItem value="" sx={{ fontSize: '0.8rem' }}>
                                Unidad Base ({item.baseUnit}) — {formatMoney(item.basePrice)}
                              </MenuItem>
                              {item.availablePresentations.map((p) => (
                                <MenuItem key={p.id} value={p.id} sx={{ fontSize: '0.8rem' }}>
                                  {p.name} (x{p.conversionFactor} {item.baseUnit}) —{' '}
                                  {formatMoney(toCents(p.price))}
                                </MenuItem>
                              ))}
                            </TextField>
                          </Box>
                        ) : (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block' }}
                          >
                            Unidad base individual ({item.baseUnit})
                          </Typography>
                        )}
                        <Box
                          sx={{
                            display: 'flex',
                            gap: 0.8,
                            alignItems: 'center',
                            mt: 0.5,
                            flexWrap: 'wrap',
                          }}
                        >
                          <Chip
                            label={
                              item.inventoryControlMode === 'SERVICE'
                                ? 'Servicio: no descuenta inventario'
                                : `${item.inventoryControlMode === 'LOT_EXPIRY' ? 'FEFO' : item.inventoryControlMode === 'SERIAL' ? 'Por serie' : 'Orden de entrada'}: descuenta ${item.quantityCommercial * item.presentationFactor} ${item.baseUnit}`
                            }
                            size="small"
                            color={item.presentationFactor > 1 ? 'secondary' : 'info'}
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.65rem' }}
                          />
                          {item.availableStock !== undefined && (
                            <Chip
                              label={`Disp: ${item.availableStock} ${item.baseUnit}`}
                              size="small"
                              color={
                                item.quantityCommercial * item.presentationFactor >
                                item.availableStock
                                  ? 'error'
                                  : 'default'
                              }
                              variant={
                                item.quantityCommercial * item.presentationFactor >
                                item.availableStock
                                  ? 'filled'
                                  : 'outlined'
                              }
                              sx={{ height: 18, fontSize: '0.65rem' }}
                            />
                          )}
                        </Box>
                        {item.inventoryControlMode === 'SERIAL' && (
                          <PosSerialPicker
                            productId={item.productId}
                            productName={item.productName}
                            requiredUnits={item.quantityCommercial * item.presentationFactor}
                            value={item.serialNumbers}
                            excluded={cart.flatMap((other, otherIdx) =>
                              otherIdx !== idx && other.productId === item.productId
                                ? other.serialNumbers
                                : [],
                            )}
                            onChange={(serials) => handleChangeSerials(idx, serials)}
                          />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Box
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 1.5,
                            p: 0.2,
                            bgcolor: 'background.paper',
                          }}
                        >
                          <Button
                            size="small"
                            onClick={() => handleUpdateQty(idx, item.quantityCommercial - 1)}
                            disabled={item.quantityCommercial <= 1}
                            sx={{
                              minWidth: 26,
                              width: 26,
                              height: 26,
                              p: 0,
                              fontSize: '0.95rem',
                              lineHeight: 1,
                              fontWeight: 700,
                            }}
                            aria-label="Disminuir cantidad"
                          >
                            -
                          </Button>
                          <TextField
                            type="number"
                            size="small"
                            value={item.quantityCommercial}
                            onChange={(e) => handleUpdateQty(idx, Number(e.target.value))}
                            slotProps={{
                              htmlInput: {
                                min: 1,
                                step: 1,
                                'aria-label': `Cantidad de ${item.productName}`,
                                style: {
                                  textAlign: 'center',
                                  width: 40,
                                  padding: '2px 4px',
                                  fontSize: '0.875rem',
                                  fontWeight: 700,
                                },
                              },
                            }}
                            variant="standard"
                            sx={{
                              '& .MuiInput-underline:before': { borderBottom: 'none' },
                              '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
                                borderBottom: 'none',
                              },
                              '& .MuiInput-underline:after': { borderBottom: 'none' },
                            }}
                          />
                          <Button
                            size="small"
                            onClick={() => handleUpdateQty(idx, item.quantityCommercial + 1)}
                            sx={{
                              minWidth: 26,
                              width: 26,
                              height: 26,
                              p: 0,
                              fontSize: '0.95rem',
                              lineHeight: 1,
                              fontWeight: 700,
                            }}
                            aria-label="Aumentar cantidad"
                          >
                            +
                          </Button>
                        </Box>
                      </TableCell>
                      <TableCell align="right">{formatMoney(item.unitPrice)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {formatMoney(item.total)}
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Eliminar ítem">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemoveItem(idx)}
                            aria-label={`Eliminar ${item.productName}`}
                            sx={{
                              transition: 'transform 0.1s ease',
                              '&:active': { transform: 'scale(0.92)' },
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* Panel Lateral de Liquidación y Totales */}
        <Paper sx={{ p: 2.5, position: 'sticky', top: 20 }} elevation={2}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Resumen de Venta
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                Artículos:
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {cart.length} líneas
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                Subtotal:
              </Typography>
              <Typography variant="body2">{formatMoney(cartSubtotal)}</Typography>
            </Box>
            {cartDiscount > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'error.main' }}>
                <Typography variant="body2">Descuentos:</Typography>
                <Typography variant="body2">-{formatMoney(cartDiscount)}</Typography>
              </Box>
            )}
            {cartTax > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Impuestos:
                </Typography>
                <Typography variant="body2">{formatMoney(cartTax)}</Typography>
              </Box>
            )}
          </Box>

          <Divider sx={{ my: 1.5 }} />

          <Box
            sx={{ textAlign: 'center', py: 1.5, mb: 2, bgcolor: 'primary.50', borderRadius: 1.5 }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              TOTAL A PAGAR
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.main' }}>
              {formatMoney(cartTotal)}
            </Typography>
          </Box>

          <Button
            variant="contained"
            color="primary"
            fullWidth
            size="large"
            disabled={!canCharge}
            onClick={() => setPaymentDialogOpen(true)}
            sx={{
              fontWeight: 800,
              py: 1.5,
              mb: 1,
              textTransform: 'none',
              fontSize: '1.05rem',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 1.2,
              transition: 'transform 0.1s ease, background-color 0.15s ease',
              '&:active': { transform: 'scale(0.98)' },
            }}
          >
            <span>Cobrar y Liquidar</span>
            <Box
              component="span"
              sx={{
                fontSize: '0.72rem',
                fontWeight: 700,
                opacity: 0.9,
                bgcolor: 'rgba(255,255,255,0.22)',
                px: 0.8,
                py: 0.2,
                borderRadius: 1,
                lineHeight: 1,
              }}
            >
              F2
            </Box>
          </Button>

          <Button
            variant="text"
            color="inherit"
            fullWidth
            size="small"
            disabled={cart.length === 0}
            onClick={() => setConfirmClearOpen(true)}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            Limpiar Carrito
          </Button>
        </Paper>
      </Box>

      {/* Diálogo de Cobro y Medio de Pago */}
      <PosPaymentDialog
        open={paymentDialogOpen}
        total={fromCents(cartTotal)}
        items={cart.map((item) => ({
          productId: item.productId,
          presentationId: item.presentationId,
          quantityCommercial: item.quantityCommercial,
        }))}
        productNames={Object.fromEntries(cart.map((item) => [item.productId, item.productName]))}
        onClose={() => setPaymentDialogOpen(false)}
        onConfirm={handleConfirmSale}
        loading={paymentLoading}
      />

      {/* Diálogo de Comprobante / Recibo Impreso */}
      <SaleReceiptDialog
        open={Boolean(receiptSale)}
        sale={receiptSale}
        onClose={() => {
          setReceiptSale(null);
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }}
        onNewSale={() => {
          setReceiptSale(null);
          handleClearCart();
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }}
      />

      {/* Modal Rápido de Creación / Cambio de Cliente */}
      <CustomerFormDialog
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        onCustomerCreated={(newCust) => {
          setSelectedCustomer(newCust);
          setCustomerModalOpen(false);
          setSnackbar({
            open: true,
            message: `Cliente "${newCust.name}" asignado a la venta.`,
            severity: 'success',
          });
        }}
      />

      {/* Diálogo de Confirmación: Limpiar Carrito */}
      <ConfirmDialog
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          handleClearCart();
          setConfirmClearOpen(false);
          setSnackbar({
            open: true,
            message: 'El carrito de venta ha sido vaciado.',
            severity: 'info',
          });
        }}
        title="Vaciar Carrito de Venta"
        description="¿Estás seguro de que deseas limpiar el carrito? Se descartarán todos los productos y medicamentos agregados a esta transacción."
        confirmText="Vaciar Carrito"
        confirmColor="error"
      />

      {/* Notificación modal estilo SweetAlert2 */}
      <SweetModal
        open={snackbar.open}
        type={
          snackbar.severity === 'error'
            ? 'error'
            : snackbar.severity === 'warning'
              ? 'warning'
              : snackbar.severity === 'info'
                ? 'info'
                : 'success'
        }
        title={
          snackbar.severity === 'error'
            ? '¡Error!'
            : snackbar.severity === 'warning'
              ? '¡Atención!'
              : snackbar.severity === 'info'
                ? 'Información'
                : '¡Buen trabajo!'
        }
        text={snackbar.message}
        confirmText="OK"
        onConfirm={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
};

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
  Autocomplete,
  Divider,
} from '@mui/material';
import type { CustomerDto, ProductDto, ProductPresentationDto, SaleDto, SalePaymentMethod } from '@farmacia/contracts';
import { fetchDefaultCustomer } from '../../customers/api/customers.api';
import { CustomerFormDialog } from '../../customers/components/CustomerFormDialog';
import { fetchProducts } from '../../catalog/api/products.api';
import { confirmSale } from '../api/sales.api';
import { PosPaymentDialog } from '../components/PosPaymentDialog';
import { SaleReceiptDialog } from '../components/SaleReceiptDialog';
import { HomeBackButton } from '../../../components/HomeBackButton';

interface CartItem {
  productId: string;
  productCode: string;
  productName: string;
  baseUnit: string;
  basePrice: number;
  availablePresentations?: ProductPresentationDto[];
  presentationId?: string | null;
  presentationName?: string | null;
  presentationFactor: number;
  quantityCommercial: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export const PosPage: React.FC = () => {
  // Cliente Seleccionado (por defecto Consumidor Final)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDto | null>(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);

  // Búsqueda de Productos
  const [productOptions, setProductOptions] = useState<ProductDto[]>([]);
  const productOptionsRef = useRef<ProductDto[]>([]);
  const [productLoading, setProductLoading] = useState(false);

  // Carrito de Ventas
  const [cart, setCart] = useState<CartItem[]>([]);

  // Modales de Cobro y Comprobante
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [receiptSale, setReceiptSale] = useState<SaleDto | null>(null);

  // Notificaciones y errores
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cargar cliente por defecto al iniciar
  useEffect(() => {
    const initDefaultCustomer = async () => {
      try {
        const def = await fetchDefaultCustomer();
        setSelectedCustomer(def);
      } catch (err) {
        console.error('Error al cargar cliente por defecto:', err);
      }
    };
    initDefaultCustomer();
  }, []);

  // Búsqueda de productos
  const handleSearchProducts = async (term: string) => {
    if (!term || term.trim().length < 2) {
      setProductOptions([]);
      return;
    }
    setProductLoading(true);
    try {
      const res = await fetchProducts({ search: term.trim() });
      const items = res.items.filter((p) => p.isActive);
      productOptionsRef.current = items;
      setProductOptions(items);
    } catch (err) {
      console.error(err);
    } finally {
      setProductLoading(false);
    }
  };

  // Agregar ítem al carrito
  const handleAddToCart = (product: ProductDto, presentation?: ProductPresentationDto | null) => {
    setErrorMsg(null);
    const chosenPres = presentation !== undefined ? presentation : (product.presentations?.find((p) => p.isDefault) || null);
    const factor = chosenPres ? chosenPres.conversionFactor : 1;
    const price = Number(chosenPres ? chosenPres.price : product.basePrice);
    const presId = chosenPres ? chosenPres.id : null;
    const presName = chosenPres ? chosenPres.name : null;

    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (item) => item.productId === product.id && item.presentationId === presId
      );

      if (existingIdx >= 0) {
        const updated = [...prev];
        const item = updated[existingIdx];
        const newQty = item.quantityCommercial + 1;
        const subtotal = newQty * item.unitPrice - item.discount;
        const taxAmount = (subtotal * (item.taxRate / 100));
        updated[existingIdx] = {
          ...item,
          quantityCommercial: newQty,
          subtotal,
          taxAmount,
          total: subtotal + taxAmount,
        };
        return updated;
      }

      const qty = 1;
      const subtotal = qty * price;
      const taxRate = 0;
      const taxAmount = 0;
      const total = subtotal + taxAmount;

      return [
        ...prev,
        {
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          baseUnit: product.baseUnit,
          basePrice: Number(product.basePrice),
          availablePresentations: product.presentations || [],
          presentationId: presId,
          presentationName: presName,
          presentationFactor: factor,
          quantityCommercial: qty,
          unitPrice: price,
          discount: 0,
          taxRate,
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
      const updated = [...prev];
      const item = updated[index];
      const pres = item.availablePresentations?.find((p) => p.id === newPresId) || null;
      const factor = pres ? pres.conversionFactor : 1;
      const unitPrice = pres ? Number(pres.price) : item.basePrice;
      const presName = pres ? pres.name : null;
      const subtotal = Math.max(0, item.quantityCommercial * unitPrice - item.discount);
      const taxAmount = subtotal * (item.taxRate / 100);

      updated[index] = {
        ...item,
        presentationId: newPresId,
        presentationName: presName,
        presentationFactor: factor,
        unitPrice,
        subtotal,
        taxAmount,
        total: subtotal + taxAmount,
      };
      return updated;
    });
  };

  const handleUpdateQty = (index: number, newQty: number) => {
    if (newQty <= 0) return;
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      const subtotal = Math.max(0, newQty * item.unitPrice - item.discount);
      const taxAmount = (subtotal * (item.taxRate / 100));
      updated[index] = {
        ...item,
        quantityCommercial: newQty,
        subtotal,
        taxAmount,
        total: subtotal + taxAmount,
      };
      return updated;
    });
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
    notes?: string
  ) => {
    if (cart.length === 0) {
      throw new Error('El carrito de venta está vacío.');
    }

    setPaymentLoading(true);
    setErrorMsg(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const payload = {
        customerId: selectedCustomer?.id,
        paymentMethod,
        amountPaid,
        notes,
        items: cart.map((item) => ({
          productId: item.productId,
          presentationId: item.presentationId || undefined,
          quantityCommercial: item.quantityCommercial,
          discount: item.discount > 0 ? item.discount : undefined,
        })),
      };

      const completedSale = await confirmSale(payload, idempotencyKey);
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <HomeBackButton />
          <Box>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 800, color: 'text.primary' }}>
              Punto de Venta (POS)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Dispensación y facturación rápida con asignación automática FEFO.
            </Typography>
          </Box>
        </Box>

        {/* Tarjeta de Cliente Activo */}
        <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2, bgcolor: 'background.paper' }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Cliente Actual:</Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {selectedCustomer ? selectedCustomer.name : 'Cargando cliente...'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Doc: {selectedCustomer?.documentNumber} {selectedCustomer?.isDefault && '(Consumidor Final)'}
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            onClick={() => setCustomerModalOpen(true)}
            sx={{ textTransform: 'none' }}
          >
            + Cambiar / Nuevo
          </Button>
        </Paper>
      </Box>

      {errorMsg && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      {/* Grid Principal: Búsqueda y Carrito vs Totales */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 340px' }, gap: 3, alignItems: 'start' }}>
        <Box>
          {/* Barra de Búsqueda Rápida de Productos */}
          <Paper sx={{ p: 2, mb: 2 }} elevation={1}>
            <Autocomplete
              data-testid="pos-product-autocomplete"
              options={productOptions}
              getOptionLabel={(opt) => `${opt.code} - ${opt.name} (${opt.baseUnit})`}
              loading={productLoading}
              onInputChange={(_, value) => handleSearchProducts(value)}
              onChange={(_, value) => {
                if (value) {
                  handleAddToCart(value, null);
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Buscar producto por nombre, código o escáner..."
                  placeholder="Ej: Amoxicilina, MED-001..."
                  size="small"
                  autoFocus
                  onChange={(e) => handleSearchProducts(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && productOptionsRef.current.length > 0) {
                      e.preventDefault();
                      handleAddToCart(productOptionsRef.current[0], null);
                    }
                  }}
                />
              )}
              renderOption={(props, opt) => (
                <li {...props} key={opt.id}>
                  <Box sx={{ width: '100%', py: 0.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{opt.name}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        ${Number(opt.basePrice).toLocaleString('es-CO')} / {opt.baseUnit}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'center', mt: 0.5, flexWrap: 'wrap' }}>
                      <Typography variant="caption" color="text.secondary">
                        SKU: {opt.code} • Base: {opt.baseUnit} {opt.requiresLotControl && '• FEFO'}
                      </Typography>
                      {opt.presentations && opt.presentations.length > 0 && opt.presentations.map((pr) => (
                        <Chip
                          key={pr.id}
                          size="small"
                          label={`${pr.name} (x${pr.conversionFactor}): $${Number(pr.price).toLocaleString('es-CO')}`}
                          variant={pr.isDefault ? 'filled' : 'outlined'}
                          color={pr.isDefault ? 'primary' : 'default'}
                          sx={{ height: 18, fontSize: '0.65rem' }}
                        />
                      ))}
                    </Box>
                  </Box>
                </li>
              )}
            />
          </Paper>

          {/* Tabla de Artículos en el Carrito */}
          <TableContainer component={Paper} elevation={1}>
            <Table size="small" aria-label="carrito de ventas">
              <TableHead sx={{ bgcolor: 'action.hover' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Producto / Unidad de Venta</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, width: 120 }}>Cantidad</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Precio Unit.</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Total</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, width: 80 }}>Acción</TableCell>
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
                              size="small"
                              value={item.presentationId || ''}
                              onChange={(e) => handleChangePresentation(idx, e.target.value || null)}
                              sx={{ minWidth: 200 }}
                              slotProps={{ select: { sx: { py: 0.4, fontSize: '0.8rem' } } }}
                            >
                              <MenuItem value="" sx={{ fontSize: '0.8rem' }}>
                                Unidad Base ({item.baseUnit}) — ${item.basePrice.toLocaleString('es-CO')}
                              </MenuItem>
                              {item.availablePresentations.map((p) => (
                                <MenuItem key={p.id} value={p.id} sx={{ fontSize: '0.8rem' }}>
                                  {p.name} (x{p.conversionFactor} {item.baseUnit}) — ${Number(p.price).toLocaleString('es-CO')}
                                </MenuItem>
                              ))}
                            </TextField>
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Unidad base individual ({item.baseUnit})
                          </Typography>
                        )}
                        <Chip
                          label={`FEFO: descuenta ${item.quantityCommercial * item.presentationFactor} ${item.baseUnit}`}
                          size="small"
                          color={item.presentationFactor > 1 ? 'secondary' : 'info'}
                          variant="outlined"
                          sx={{ height: 18, fontSize: '0.65rem', mt: 0.5 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <TextField
                          type="number"
                          size="small"
                          value={item.quantityCommercial}
                          onChange={(e) => handleUpdateQty(idx, Number(e.target.value))}
                          slotProps={{ htmlInput: { min: 1, step: 1, style: { textAlign: 'center' } } }}
                          sx={{ width: 80 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        ${item.unitPrice.toLocaleString('es-CO')}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        ${item.total.toLocaleString('es-CO')}
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          size="small"
                          color="error"
                          onClick={() => handleRemoveItem(idx)}
                          sx={{ minWidth: 32 }}
                        >
                          ✕
                        </Button>
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
              <Typography variant="body2" color="text.secondary">Artículos:</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{cart.length} líneas</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Subtotal:</Typography>
              <Typography variant="body2">${cartSubtotal.toLocaleString('es-CO')}</Typography>
            </Box>
            {cartDiscount > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'error.main' }}>
                <Typography variant="body2">Descuentos:</Typography>
                <Typography variant="body2">-${cartDiscount.toLocaleString('es-CO')}</Typography>
              </Box>
            )}
            {cartTax > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Impuestos:</Typography>
                <Typography variant="body2">${cartTax.toLocaleString('es-CO')}</Typography>
              </Box>
            )}
          </Box>

          <Divider sx={{ my: 1.5 }} />

          <Box sx={{ textAlign: 'center', py: 1.5, mb: 2, bgcolor: 'primary.50', borderRadius: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>TOTAL A PAGAR</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.main' }}>
              ${cartTotal.toLocaleString('es-CO')}
            </Typography>
          </Box>

          <Button
            variant="contained"
            color="primary"
            fullWidth
            size="large"
            disabled={cart.length === 0}
            onClick={() => setPaymentDialogOpen(true)}
            sx={{ fontWeight: 800, py: 1.5, mb: 1, textTransform: 'none', fontSize: '1.1rem' }}
          >
            Cobrar y Liquidar
          </Button>

          <Button
            variant="text"
            color="inherit"
            fullWidth
            size="small"
            disabled={cart.length === 0}
            onClick={handleClearCart}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            Limpiar Carrito
          </Button>
        </Paper>
      </Box>

      {/* Diálogo de Cobro y Medio de Pago */}
      <PosPaymentDialog
        open={paymentDialogOpen}
        total={cartTotal}
        onClose={() => setPaymentDialogOpen(false)}
        onConfirm={handleConfirmSale}
        loading={paymentLoading}
      />

      {/* Diálogo de Comprobante / Recibo Impreso */}
      <SaleReceiptDialog
        open={Boolean(receiptSale)}
        sale={receiptSale}
        onClose={() => setReceiptSale(null)}
        onNewSale={() => {
          setReceiptSale(null);
          handleClearCart();
        }}
      />

      {/* Modal Rápido de Creación / Cambio de Cliente */}
      <CustomerFormDialog
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        onCustomerCreated={(newCust) => {
          setSelectedCustomer(newCust);
          setCustomerModalOpen(false);
        }}
      />
    </Box>
  );
};

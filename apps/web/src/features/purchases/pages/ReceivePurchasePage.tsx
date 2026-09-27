import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { HomeBackButton } from '../../../components/HomeBackButton';
import {
  Box,
  Typography,
  Paper,
  TextField,
  MenuItem,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import type {
  SupplierDto,
  ProductDto,
  ReceivePurchasePayload,
} from '@farmacia/contracts';
import { fetchSuppliers } from '../../suppliers/api/suppliers.api';
import { fetchProducts } from '../../catalog/api/products.api';
import { receivePurchase } from '../api/purchases.api';

interface PurchaseFormLine {
  productId: string;
  presentationId: string;
  lotNumber: string;
  expirationDate: string;
  quantityCommercial: string;
  unitCost: string;
}

export const ReceivePurchasePage: React.FC = () => {
  const navigate = useNavigate();

  // Datos de apoyo
  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Cabecera del formulario
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [paymentCondition, setPaymentCondition] = useState<'CONTADO' | 'CREDITO'>('CREDITO');
  const [creditDays, setCreditDays] = useState('30');

  const calculateDefaultDueDate = (baseDateStr: string, days: number) => {
    const d = new Date(baseDateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  const [dueDate, setDueDate] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return calculateDefaultDueDate(today, 30);
  });

  const [notes, setNotes] = useState('');

  // Líneas de compra
  const [lines, setLines] = useState<PurchaseFormLine[]>([
    {
      productId: '',
      presentationId: '',
      lotNumber: '',
      expirationDate: '',
      quantityCommercial: '1',
      unitCost: '0',
    },
  ]);

  // Diálogo de confirmación
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [suppliersRes, productsRes] = await Promise.all([
          fetchSuppliers({ isActive: true }),
          fetchProducts({ isActive: true, pageSize: 100 }),
        ]);
        setSuppliers(suppliersRes.items);
        setProducts(productsRes.items);
      } catch (err) {
        setErrorMsg('Error al cargar proveedores o productos.');
      } finally {
        setLoadingInitial(false);
      }
    }
    loadData();
  }, []);

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      {
        productId: '',
        presentationId: '',
        lotNumber: '',
        expirationDate: '',
        quantityCommercial: '1',
        unitCost: '0',
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof PurchaseFormLine, value: string) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'productId') {
        const prod = products.find((p) => p.id === value);
        const defaultPres = prod?.presentations?.find((pr) => pr.isDefault);
        updated[index].presentationId = defaultPres ? defaultPres.id : '';
        if (defaultPres && parseFloat(defaultPres.cost) > 0) {
          updated[index].unitCost = String(defaultPres.cost);
        } else if (prod && parseFloat(prod.baseCost) > 0) {
          updated[index].unitCost = String(prod.baseCost);
        }
      } else if (field === 'presentationId') {
        const prod = products.find((p) => p.id === updated[index].productId);
        const pres = prod?.presentations?.find((pr) => pr.id === value);
        if (pres && parseFloat(pres.cost) > 0) {
          updated[index].unitCost = String(pres.cost);
        } else if (!value && prod && parseFloat(prod.baseCost) > 0) {
          updated[index].unitCost = String(prod.baseCost);
        }
      }
      return updated;
    });
  };

  const calculateSubtotal = (line: PurchaseFormLine): number => {
    const qty = parseFloat(line.quantityCommercial) || 0;
    const cost = parseFloat(line.unitCost) || 0;
    return Math.round(qty * cost * 100) / 100;
  };

  const calculateTotal = (): number => {
    return lines.reduce((sum, line) => sum + calculateSubtotal(line), 0);
  };

  const validateForm = (): boolean => {
    setErrorMsg(null);
    if (!supplierId) {
      setErrorMsg('Debes seleccionar un proveedor.');
      return false;
    }
    if (!invoiceNumber.trim()) {
      setErrorMsg('El número de factura es obligatorio.');
      return false;
    }
    if (!purchaseDate) {
      setErrorMsg('La fecha de compra es obligatoria.');
      return false;
    }

    if (!dueDate) {
      setErrorMsg('La fecha de vencimiento de la factura es obligatoria.');
      return false;
    }

    if (new Date(dueDate + 'T23:59:59') < new Date(purchaseDate + 'T00:00:00')) {
      setErrorMsg('La fecha de vencimiento de la factura no puede ser anterior a la fecha de emisión.');
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.productId) {
        setErrorMsg(`Selecciona un producto en la fila #${i + 1}.`);
        return false;
      }
      if (!line.lotNumber.trim()) {
        setErrorMsg(`Ingresa el número de lote en la fila #${i + 1}.`);
        return false;
      }
      if (!line.expirationDate) {
        setErrorMsg(`Ingresa la fecha de vencimiento en la fila #${i + 1}.`);
        return false;
      }
      const exp = new Date(line.expirationDate);
      exp.setHours(0, 0, 0, 0);
      if (exp <= today) {
        setErrorMsg(
          `La fecha de vencimiento en la fila #${i + 1} (${line.expirationDate}) no puede ser anterior ni igual a hoy.`
        );
        return false;
      }
      const qty = parseFloat(line.quantityCommercial);
      if (isNaN(qty) || qty <= 0) {
        setErrorMsg(`La cantidad comercial debe ser mayor a 0 en la fila #${i + 1}.`);
        return false;
      }
      const cost = parseFloat(line.unitCost);
      if (isNaN(cost) || cost < 0) {
        setErrorMsg(`El costo unitario no puede ser negativo en la fila #${i + 1}.`);
        return false;
      }
    }

    return true;
  };

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setConfirmOpen(true);
    }
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const conditionLabel =
        paymentCondition === 'CONTADO'
          ? 'Contado'
          : `Crédito (${creditDays !== 'manual' ? `${creditDays} días` : 'personalizado'})`;
      const invoiceMeta = `[Factura Vence: ${dueDate} | Condición: ${conditionLabel}]`;
      const fullNotes = notes.trim() ? `${invoiceMeta} ${notes.trim()}` : invoiceMeta;

      const payload: ReceivePurchasePayload = {
        supplierId,
        invoiceNumber: invoiceNumber.trim().toUpperCase(),
        purchaseDate,
        dueDate,
        paymentCondition,
        notes: fullNotes,
        lines: lines.map((l) => ({
          productId: l.productId,
          presentationId: l.presentationId || null,
          lotNumber: l.lotNumber.trim().toUpperCase(),
          expirationDate: l.expirationDate,
          quantityCommercial: parseFloat(l.quantityCommercial),
          unitCost: parseFloat(l.unitCost),
        })),
      };

      await receivePurchase(payload);
      setConfirmOpen(false);
      navigate('/purchases');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al registrar la compra.';
      setErrorMsg(msg);
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInitial) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1400, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <HomeBackButton />
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
              Recepción de Compras e Ingreso de Lotes
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Registra facturas de proveedores con entrada atómica a lotes e inventario (Kardex).
            </Typography>
          </Box>
        </Box>
        <Button variant="outlined" component={Link} to="/purchases">
          Volver a Compras
        </Button>
      </Box>

      {errorMsg && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      <form onSubmit={handlePreSubmit}>
        {/* Datos de Cabecera de la Factura */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
            Datos del Comprobante / Factura
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2.5 }}>
            <TextField
              select
              label="Proveedor *"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              required
              fullWidth
            >
              <MenuItem value="">Selecciona un proveedor...</MenuItem>
              {suppliers.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name} ({s.taxId})
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Número de Factura / Comprobante *"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Ej. FAC-2026-00891"
              required
              fullWidth
            />

            <TextField
              label="Fecha de Emisión / Factura *"
              type="date"
              value={purchaseDate}
              onChange={(e) => {
                const newDate = e.target.value;
                setPurchaseDate(newDate);
                if (paymentCondition === 'CONTADO') {
                  setDueDate(newDate);
                } else if (creditDays !== 'manual') {
                  setDueDate(calculateDefaultDueDate(newDate, Number(creditDays) || 30));
                }
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              required
              fullWidth
            />

            <TextField
              select
              label="Condición de Pago *"
              value={paymentCondition}
              onChange={(e) => {
                const val = e.target.value as 'CONTADO' | 'CREDITO';
                setPaymentCondition(val);
                if (val === 'CONTADO') {
                  setDueDate(purchaseDate);
                } else {
                  setDueDate(calculateDefaultDueDate(purchaseDate, Number(creditDays) || 30));
                }
              }}
              required
              fullWidth
            >
              <MenuItem value="CONTADO">Contado (Pago Inmediato)</MenuItem>
              <MenuItem value="CREDITO">Crédito Comercial</MenuItem>
            </TextField>

            {paymentCondition === 'CREDITO' ? (
              <TextField
                select
                label="Plazo de Crédito"
                value={creditDays}
                onChange={(e) => {
                  const days = e.target.value;
                  setCreditDays(days);
                  if (days !== 'manual') {
                    setDueDate(calculateDefaultDueDate(purchaseDate, Number(days)));
                  }
                }}
                fullWidth
              >
                <MenuItem value="15">15 Días</MenuItem>
                <MenuItem value="30">30 Días (Estándar)</MenuItem>
                <MenuItem value="45">45 Días</MenuItem>
                <MenuItem value="60">60 Días</MenuItem>
                <MenuItem value="manual">Plazo Personalizado</MenuItem>
              </TextField>
            ) : (
              <TextField
                label="Modalidad"
                value="Pago al recibir"
                disabled
                fullWidth
              />
            )}

            <TextField
              label="Fecha de Vencimiento de Factura *"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="Fecha límite para el pago al proveedor"
              required
              fullWidth
            />

            <Box sx={{ gridColumn: '1 / -1' }}>
              <TextField
                label="Observaciones / Notas"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalles sobre entrega, transportadora, número de guía o condiciones especiales..."
                fullWidth
              />
            </Box>
          </Box>
        </Paper>

        {/* Tabla Dinámica de Productos y Lotes */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
              Productos y Lotes a Ingresar ({lines.length})
            </Typography>
            <Button variant="outlined" onClick={handleAddLine} sx={{ fontWeight: 'bold' }}>
              + Agregar Producto
            </Button>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead sx={{ bgcolor: 'action.hover' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', width: '22%' }}>Producto *</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '18%' }}>Presentación / Unidad *</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '11%' }}>Lote *</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '12%' }}>Vence *</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '11%', textAlign: 'right' }}>Cantidad *</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '12%', textAlign: 'right' }}>Costo Presentación *</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '10%', textAlign: 'right' }}>Subtotal</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '4%', textAlign: 'center' }}>Acción</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.map((line, idx) => {
                  const subtotal = calculateSubtotal(line);
                  const p = products.find((prod) => prod.id === line.productId);
                  const selectedPres = p?.presentations?.find((pr) => pr.id === line.presentationId);
                  const factor = selectedPres ? selectedPres.conversionFactor : 1;
                  const qtyCommercial = parseFloat(line.quantityCommercial) || 0;
                  const totalBaseUnits = Math.round(qtyCommercial * factor);
                  const unitCost = parseFloat(line.unitCost) || 0;
                  const costPerBaseUnit = factor > 0 ? unitCost / factor : unitCost;

                  return (
                    <TableRow key={idx}>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          value={line.productId}
                          onChange={(e) => handleLineChange(idx, 'productId', e.target.value)}
                          required
                        >
                          <MenuItem value="">Selecciona...</MenuItem>
                          {products.map((prod) => (
                            <MenuItem key={prod.id} value={prod.id}>
                              {prod.name} ({prod.code})
                            </MenuItem>
                          ))}
                        </TextField>
                        {p && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Unidad Base: <strong>{p.baseUnit}</strong>
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          value={line.presentationId || ''}
                          onChange={(e) => handleLineChange(idx, 'presentationId', e.target.value)}
                          disabled={!line.productId}
                        >
                          <MenuItem value="">
                            <em>Unidad Base ({p?.baseUnit || 'UNIDAD'}) — Factor 1:1</em>
                          </MenuItem>
                          {p?.presentations?.map((pres) => (
                            <MenuItem key={pres.id} value={pres.id}>
                              {pres.name} (Factor: {pres.conversionFactor} {p.baseUnit})
                            </MenuItem>
                          ))}
                        </TextField>
                        {selectedPres && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            1 {selectedPres.name} = {selectedPres.conversionFactor} {p?.baseUnit}
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="LOTE-001"
                          value={line.lotNumber}
                          onChange={(e) => handleLineChange(idx, 'lotNumber', e.target.value)}
                          required
                        />
                      </TableCell>

                      <TableCell>
                        <TextField
                          size="small"
                          type="date"
                          fullWidth
                          value={line.expirationDate}
                          onChange={(e) => handleLineChange(idx, 'expirationDate', e.target.value)}
                          slotProps={{ inputLabel: { shrink: true } }}
                          required
                        />
                      </TableCell>

                      <TableCell sx={{ textAlign: 'right' }}>
                        <TextField
                          size="small"
                          type="number"
                          value={line.quantityCommercial}
                          onChange={(e) => handleLineChange(idx, 'quantityCommercial', e.target.value)}
                          slotProps={{ htmlInput: { min: '1', step: 'any', style: { textAlign: 'right' } } }}
                          required
                        />
                        <Typography variant="caption" color="primary.main" sx={{ display: 'block', mt: 0.5, fontWeight: 'bold' }}>
                          Ingresan: {totalBaseUnits} {p?.baseUnit || 'unidades'}
                        </Typography>
                      </TableCell>

                      <TableCell sx={{ textAlign: 'right' }}>
                        <TextField
                          size="small"
                          type="number"
                          value={line.unitCost}
                          onChange={(e) => handleLineChange(idx, 'unitCost', e.target.value)}
                          slotProps={{ htmlInput: { min: '0', step: 'any', style: { textAlign: 'right' } } }}
                          required
                        />
                        {factor > 1 && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            ${costPerBaseUnit.toFixed(2)} / {p?.baseUnit || 'unid'}
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell sx={{ textAlign: 'right', fontWeight: 'bold' }}>
                        ${subtotal.toLocaleString()}
                      </TableCell>

                      <TableCell sx={{ textAlign: 'center' }}>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => handleRemoveLine(idx)}
                          disabled={lines.length <= 1}
                        >
                          ✕
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Totalizador */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Button variant="outlined" onClick={handleAddLine}>
              + Agregar Otra Línea
            </Button>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
              Total Factura: ${calculateTotal().toLocaleString()}
            </Typography>
          </Box>
        </Paper>

        {/* Botón de Envío */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button variant="outlined" component={Link} to="/purchases" size="large">
            Cancelar
          </Button>
          <Button type="submit" variant="contained" color="primary" size="large" sx={{ fontWeight: 'bold', px: 4 }}>
            Confirmar Recepción de Compra
          </Button>
        </Box>
      </form>

      {/* Diálogo de Confirmación de Impacto en Inventario */}
      <Dialog open={confirmOpen} onClose={() => (submitting ? undefined : setConfirmOpen(false))}>
        <DialogTitle sx={{ fontWeight: 'bold' }}>
          Confirmar Recepción e Ingreso a Inventario
        </DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            ¿Confirmas la recepción de la factura <strong>{invoiceNumber}</strong> por un total de{' '}
            <strong>${calculateTotal().toLocaleString()}</strong>?
            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 2, fontSize: '0.875rem' }}>
              <div><strong>Proveedor:</strong> {suppliers.find(s => s.id === supplierId)?.name ?? '—'}</div>
              <div><strong>N° Factura:</strong> {invoiceNumber}</div>
              <div><strong>Fecha de Emisión:</strong> {purchaseDate}</div>
              <div><strong>Fecha de Vencimiento Factura:</strong> {dueDate}</div>
              <div><strong>Líneas a Ingresar:</strong> {lines.length} productos / lotes ({lines.reduce((acc, l) => {
                const prod = products.find((p) => p.id === l.productId);
                const pr = prod?.presentations?.find((pres) => pres.id === l.presentationId);
                const f = pr ? pr.conversionFactor : 1;
                return acc + Math.round((parseFloat(l.quantityCommercial) || 0) * f);
              }, 0)} unidades base a Kardex)</div>
            </Box>
            <br />
            Esta operación registrará de forma atómica:
            <br />
            • La factura con sus datos comerciales y vencimiento.
            <br />
            • El incremento de existencias en los lotes correspondientes.
            <br />
            • Las entradas inmutables en el Kardex de inventario.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setConfirmOpen(false)} disabled={submitting} color="inherit">
            Modificar
          </Button>
          <Button onClick={handleConfirmSubmit} disabled={submitting} variant="contained" color="primary">
            {submitting ? 'Procesando Transacción...' : 'Sí, Confirmar Recepción'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createReceivePurchaseSchema,
  emptyPurchaseLine,
  parseSerialNumbers,
  type ReceivePurchaseFormValues,
  type PurchaseFormLine,
} from '../validation/receive-purchase.schema';
import { PurchaseFormField } from '../components/PurchaseFormField';
import { fromCents, toCents } from '../../../utils/money';
import { useNavigate, Link } from 'react-router-dom';
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
  Step,
  StepButton,
  Stepper,
  Chip,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ViewAgendaIcon from '@mui/icons-material/ViewAgenda';
import TableRowsIcon from '@mui/icons-material/TableRows';
import AddIcon from '@mui/icons-material/Add';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import type { SupplierDto, ProductDto, ReceivePurchasePayload } from '@farmacia/contracts';
import { fetchSuppliers } from '../../suppliers/api/suppliers.api';
import { fetchProducts, lookupProductByCode } from '../../catalog/api/products.api';
import { BarcodeScanField } from '../../../components/BarcodeScanField';
import { receivePurchase } from '../api/purchases.api';
import { inventoryControlModeLabel } from '../../catalog/utils/inventory-control';
import { addDaysToDate, businessToday } from '../../../utils/business-date';
import { formatDate } from '../../../utils/date-format';
import { formatCop } from '../../../utils/money';

/** Campos del paso 1: si alguno falla al confirmar, el asistente vuelve a ese paso. */
const HEADER_FIELDS = [
  'supplierId',
  'invoiceNumber',
  'purchaseDate',
  'paymentCondition',
  'creditDays',
  'dueDate',
  'notes',
] as const;

const STEPS = ['Datos de la factura', 'Productos y lotes', 'Totales y revisión'];

export const ReceivePurchasePage: React.FC = () => {
  const navigate = useNavigate();

  // Datos de apoyo
  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  const {
    control,
    watch,
    setValue,
    getValues,
    handleSubmit,
    trigger,
    setFocus,
    formState: { errors, isSubmitting: submitting },
  } = useForm<ReceivePurchaseFormValues>({
    resolver: zodResolver(createReceivePurchaseSchema(products)),
    defaultValues: {
      supplierId: '',
      invoiceNumber: '',
      purchaseDate: businessToday(),
      paymentCondition: 'CREDITO',
      creditDays: '30',
      dueDate: addDaysToDate(businessToday(), 30),
      notes: '',
      lines: [emptyPurchaseLine()],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const { supplierId, invoiceNumber, purchaseDate, paymentCondition, creditDays, dueDate, lines } =
    watch();
  const calculateDefaultDueDate = addDaysToDate;
  const submittingRef = useRef(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Asistente en tres pasos; la revisión final hace de confirmación
  const [step, setStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [suppliersRes, productsRes] = await Promise.all([
          fetchSuppliers({ isActive: true }),
          fetchProducts({ isActive: true, pageSize: 100 }),
        ]);
        setSuppliers(suppliersRes.items);
        // Los servicios no se reciben como inventario (ADR-006): sus compras van por egresos
        setProducts(productsRes.items.filter((p) => p.inventoryControlMode !== 'SERVICE'));
      } catch {
        setErrorMsg('Error al cargar proveedores o productos.');
      } finally {
        setLoadingInitial(false);
      }
    }
    loadData();
  }, []);

  const handleAddLine = () => append(emptyPurchaseLine());

  // Pistola lectora: suma una unidad a la línea del mismo producto y presentación sin lote
  // capturado, o lo agrega en una línea nueva (o en la primera vacía)
  const handleScan = async (code: string): Promise<string | null> => {
    const found = await lookupProductByCode(code);
    if (!found) return `El código "${code}" no existe en el catálogo.`;
    const { product, presentationId } = found;
    if (product.inventoryControlMode === 'SERVICE') {
      return `"${product.name}" es un servicio: no se recibe como inventario.`;
    }
    if (!products.some((p) => p.id === product.id)) setProducts((prev) => [...prev, product]);
    const current = getValues('lines');
    const sameIdx = current.findIndex(
      (l) =>
        l.productId === product.id &&
        (!presentationId || l.presentationId === presentationId) &&
        !l.lotNumber &&
        !l.serialNumbers,
    );
    if (sameIdx >= 0) {
      const quantity = Number(current[sameIdx].quantityCommercial) || 0;
      handleLineChange(sameIdx, 'quantityCommercial', String(quantity + 1));
      return null;
    }
    const presentation = presentationId
      ? product.presentations?.find((pr) => pr.id === presentationId)
      : product.presentations?.find(
          (pr) =>
            pr.isActive && (pr.purchaseEnabled ?? true) && (pr.isDefaultPurchase || pr.isDefault),
        );
    const cost =
      presentation && parseFloat(presentation.cost) > 0
        ? String(presentation.cost)
        : parseFloat(product.baseCost) > 0
          ? String(product.baseCost)
          : '0';
    const line = {
      ...emptyPurchaseLine(),
      productId: product.id,
      presentationId: presentation?.id ?? '',
      unitCost: cost,
    };
    const emptyIdx = current.findIndex((l) => !l.productId);
    if (emptyIdx >= 0) setValue(`lines.${emptyIdx}`, line, { shouldDirty: true });
    else append(line);
    return null;
  };
  const handleRemoveLine = (index: number) => {
    if (lines.length > 1) remove(index);
  };

  const handleLineChange = (index: number, field: keyof PurchaseFormLine, value: string) => {
    const updated = { ...getValues(`lines.${index}`), [field]: value };
    const product = products.find((p) => p.id === updated.productId);
    if (field === 'productId' || field === 'presentationId') {
      const presentation =
        field === 'productId'
          ? product?.presentations?.find(
              (pr) => pr.isActive && (pr.purchaseEnabled ?? true) && pr.isDefaultPurchase,
            ) ||
            product?.presentations?.find(
              (pr) => pr.isActive && (pr.purchaseEnabled ?? true) && pr.isDefault,
            )
          : product?.presentations?.find((pr) => pr.id === value);
      if (field === 'productId') {
        updated.presentationId = presentation?.id ?? '';
        // Lo capturado para otro modo de control no aplica al producto nuevo
        updated.lotNumber = '';
        updated.expirationDate = '';
        updated.serialNumbers = '';
      }
      if (presentation && parseFloat(presentation.cost) > 0) {
        updated.unitCost = String(presentation.cost);
      } else if ((field === 'productId' || !value) && product && parseFloat(product.baseCost) > 0) {
        updated.unitCost = String(product.baseCost);
      }
    }
    setValue(`lines.${index}`, updated, {
      shouldDirty: true,
      shouldValidate: Boolean(errors.lines),
    });
  };

  const subtotalCents = (line: PurchaseFormLine): number => {
    const quantity = Number(line.quantityCommercial);
    if (!Number.isFinite(quantity)) return 0;
    try {
      return Math.round(quantity * toCents(line.unitCost));
    } catch {
      return 0;
    }
  };
  const calculateSubtotal = (line: PurchaseFormLine) => fromCents(subtotalCents(line));
  const calculateTotal = () => fromCents(lines.reduce((sum, line) => sum + subtotalCents(line), 0));

  const goToLines = async () => {
    if (await trigger([...HEADER_FIELDS], { shouldFocus: true })) {
      setErrorMsg(null);
      setStep(1);
    }
  };
  const goToReview = async () => {
    if (await trigger('lines', { shouldFocus: true })) {
      setErrorMsg(null);
      setStep(2);
    }
  };

  const productOf = (line: PurchaseFormLine) => products.find((p) => p.id === line.productId);
  const presentationOf = (line: PurchaseFormLine) =>
    productOf(line)?.presentations?.find((pr) => pr.id === line.presentationId);
  const baseUnitsOf = (line: PurchaseFormLine) =>
    Math.round(
      (parseFloat(line.quantityCommercial) || 0) * (presentationOf(line)?.conversionFactor ?? 1),
    );
  const totalBaseUnits = lines.reduce((acc, l) => acc + baseUnitsOf(l), 0);
  const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? '';

  const handleConfirmSubmit = handleSubmit(
    async (values) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      const {
        supplierId,
        invoiceNumber,
        purchaseDate,
        paymentCondition,
        creditDays,
        dueDate,
        notes,
        lines,
      } = values;
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
          lines: lines.map((l) => {
            const mode = products.find((p) => p.id === l.productId)?.inventoryControlMode;
            return {
              productId: l.productId,
              presentationId: l.presentationId || null,
              // Solo se envía lo que el modo del producto admite; el backend lo vuelve a validar
              ...(mode === 'LOT' || mode === 'LOT_EXPIRY'
                ? { lotNumber: l.lotNumber.trim().toUpperCase() }
                : {}),
              ...(mode === 'LOT_EXPIRY' ? { expirationDate: l.expirationDate } : {}),
              ...(mode === 'SERIAL' ? { serialNumbers: parseSerialNumbers(l.serialNumbers) } : {}),
              quantityCommercial: parseFloat(l.quantityCommercial),
              unitCost: parseFloat(l.unitCost),
            };
          }),
        };

        await receivePurchase(payload);
        navigate('/purchases');
      } catch (err) {
        // Se queda en la revisión con los datos intactos; el aviso ofrece volver al paso a corregir
        const msg = err instanceof Error ? err.message : 'Error al registrar la compra.';
        setErrorMsg(msg);
      } finally {
        submittingRef.current = false;
      }
    },
    (formErrors) => {
      const headerError = HEADER_FIELDS.find((field) => formErrors[field]);
      if (headerError) {
        setStep(0);
        setTimeout(() => setFocus(headerError), 0);
      } else {
        setStep(1);
      }
    },
  );

  if (loadingInitial) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ py: { xs: 1, md: 2 }, maxWidth: 1400, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography
            variant="h4"
            component="h1"
            sx={{ fontWeight: 'bold', color: 'primary.main' }}
          >
            Recepción de Compras e Ingreso de Lotes
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Registra facturas de proveedores con entrada atómica a lotes e inventario (Kardex).
          </Typography>
        </Box>
        <Button variant="outlined" component={Link} to="/purchases">
          Volver a Compras
        </Button>
      </Box>

      <Stepper nonLinear activeStep={step} sx={{ mb: 2 }}>
        {STEPS.map((label, index) => (
          <Step key={label} completed={index < step}>
            <StepButton disabled={index > step || submitting} onClick={() => setStep(index)}>
              {label}
            </StepButton>
          </Step>
        ))}
      </Stepper>

      {/* Proveedor, comprobante y total siempre a la vista mientras se captura */}
      <Paper
        component="section"
        aria-label="Resumen de la factura"
        data-testid="purchase-summary"
        variant="outlined"
        sx={{
          position: 'sticky',
          top: 64,
          zIndex: 2,
          mb: 2,
          px: 2,
          py: 1,
          display: 'flex',
          flexWrap: 'wrap',
          gap: { xs: 1, sm: 3 },
          alignItems: 'baseline',
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="body2">
          <Box component="span" sx={{ color: 'text.secondary' }}>
            Proveedor:{' '}
          </Box>
          <strong>{supplierName || 'sin elegir'}</strong>
        </Typography>
        <Typography variant="body2">
          <Box component="span" sx={{ color: 'text.secondary' }}>
            Factura:{' '}
          </Box>
          <strong>
            {invoiceNumber.trim() ? invoiceNumber.trim().toUpperCase() : 'sin número'}
          </strong>
        </Typography>
        <Typography variant="body2">
          <Box component="span" sx={{ color: 'text.secondary' }}>
            Líneas:{' '}
          </Box>
          <strong>{lines.filter((l) => l.productId).length}</strong>
        </Typography>
        <Typography variant="body2" sx={{ ml: { sm: 'auto' } }}>
          <Box component="span" sx={{ color: 'text.secondary' }}>
            Subtotal:{' '}
          </Box>
          <strong>{formatCop(calculateTotal())}</strong>
        </Typography>
      </Paper>

      {errorMsg && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          onClose={() => setErrorMsg(null)}
          action={
            step === 2 ? (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button color="inherit" size="small" onClick={() => setStep(0)}>
                  Revisar factura
                </Button>
                <Button color="inherit" size="small" onClick={() => setStep(1)}>
                  Revisar productos
                </Button>
              </Box>
            ) : undefined
          }
        >
          {errorMsg}
        </Alert>
      )}

      <form
        noValidate
        onSubmit={(event) => {
          if (step === 2) return handleConfirmSubmit(event);
          event.preventDefault();
          if (step === 0) void goToLines();
        }}
      >
        {/* Paso 1: datos de la factura */}
        {step === 0 && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
              Datos del Comprobante / Factura
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'minmax(0, 1fr)',
                  sm: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
                },
                gap: 2.5,
              }}
            >
              <PurchaseFormField
                name="supplierId"
                control={control}
                select
                label="Proveedor *"
                required
                fullWidth
              >
                <MenuItem value="">Selecciona un proveedor...</MenuItem>
                {suppliers.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name} ({s.taxId})
                  </MenuItem>
                ))}
              </PurchaseFormField>

              <PurchaseFormField
                name="invoiceNumber"
                control={control}
                label="Número de Factura / Comprobante *"
                placeholder="Ej. FAC-2026-00891"
                required
                fullWidth
              />

              <PurchaseFormField
                name="purchaseDate"
                control={control}
                label="Fecha de Emisión / Factura *"
                type="date"
                onDateChange={(value) => {
                  const newDate = value;
                  setValue('purchaseDate', newDate);
                  if (paymentCondition === 'CONTADO') {
                    setValue('dueDate', newDate);
                  } else if (creditDays !== 'manual') {
                    setValue('dueDate', calculateDefaultDueDate(newDate, Number(creditDays) || 30));
                  }
                }}
                required
                fullWidth
              />

              <PurchaseFormField
                name="paymentCondition"
                control={control}
                select
                label="Condición de Pago *"
                onChange={(e) => {
                  const val = e.target.value as 'CONTADO' | 'CREDITO';
                  setValue('paymentCondition', val);
                  if (val === 'CONTADO') {
                    setValue('dueDate', purchaseDate);
                  } else {
                    setValue(
                      'dueDate',
                      calculateDefaultDueDate(purchaseDate, Number(creditDays) || 30),
                    );
                  }
                }}
                required
                fullWidth
              >
                <MenuItem value="CONTADO">Contado (Pago Inmediato)</MenuItem>
                <MenuItem value="CREDITO">Crédito Comercial</MenuItem>
              </PurchaseFormField>

              {paymentCondition === 'CREDITO' ? (
                <PurchaseFormField
                  name="creditDays"
                  control={control}
                  select
                  label="Plazo de Crédito"
                  onChange={(e) => {
                    const days = e.target.value;
                    setValue('creditDays', days);
                    if (days !== 'manual') {
                      setValue('dueDate', calculateDefaultDueDate(purchaseDate, Number(days)));
                    }
                  }}
                  fullWidth
                >
                  <MenuItem value="15">15 Días</MenuItem>
                  <MenuItem value="30">30 Días (Estándar)</MenuItem>
                  <MenuItem value="45">45 Días</MenuItem>
                  <MenuItem value="60">60 Días</MenuItem>
                  <MenuItem value="manual">Plazo Personalizado</MenuItem>
                </PurchaseFormField>
              ) : (
                <TextField label="Modalidad" value="Pago al recibir" disabled fullWidth />
              )}

              <PurchaseFormField
                name="dueDate"
                control={control}
                label="Fecha de Vencimiento de Factura *"
                type="date"
                onDateChange={(value) => setValue('dueDate', value)}
                helperText="Fecha límite para el pago al proveedor"
                required
                fullWidth
              />

              <Box sx={{ gridColumn: '1 / -1' }}>
                <PurchaseFormField
                  name="notes"
                  control={control}
                  label="Observaciones / Notas"
                  placeholder="Detalles sobre entrega, transportadora, número de guía o condiciones especiales..."
                  fullWidth
                />
              </Box>
            </Box>
          </Paper>
        )}

        {/* Paso 2: productos y lotes */}
        {step === 1 && (
          <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 2,
                mb: 3,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                  Productos y Lotes a Ingresar
                </Typography>
                <Chip
                  label={`${lines.length} ${lines.length === 1 ? 'línea' : 'líneas'}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 'bold' }}
                />
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <ToggleButtonGroup
                  value={viewMode}
                  exclusive
                  size="small"
                  onChange={(_, next) => next && setViewMode(next)}
                  aria-label="Modo de visualización"
                >
                  <ToggleButton
                    value="cards"
                    sx={{ px: 1.5, py: 0.5, textTransform: 'none', gap: 0.75, fontWeight: 600 }}
                  >
                    <ViewAgendaIcon fontSize="small" />
                    Tarjetas (Espaciosa)
                  </ToggleButton>
                  <ToggleButton
                    value="table"
                    sx={{ px: 1.5, py: 0.5, textTransform: 'none', gap: 0.75, fontWeight: 600 }}
                  >
                    <TableRowsIcon fontSize="small" />
                    Tabla
                  </ToggleButton>
                </ToggleButtonGroup>

                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleAddLine}
                  startIcon={<AddIcon />}
                  sx={{ fontWeight: 'bold' }}
                >
                  Agregar Producto
                </Button>
              </Box>
            </Box>

            <BarcodeScanField onScan={handleScan} />

            {errors.lines?.root?.message && (
              <Alert severity="error">{errors.lines.root.message}</Alert>
            )}
            {viewMode === 'cards' ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                {lines.map((line, idx) => {
                  const subtotal = calculateSubtotal(line);
                  const p = products.find((prod) => prod.id === line.productId);
                  const selectedPres = p?.presentations?.find(
                    (pr) => pr.id === line.presentationId,
                  );
                  const factor = selectedPres ? selectedPres.conversionFactor : 1;
                  const qtyCommercial = parseFloat(line.quantityCommercial) || 0;
                  const totalBaseUnits = Math.round(qtyCommercial * factor);
                  const unitCost = parseFloat(line.unitCost) || 0;
                  const costPerBaseUnit = factor > 0 ? unitCost / factor : unitCost;

                  return (
                    <Paper
                      key={fields[idx].id}
                      variant="outlined"
                      sx={{
                        p: 2.5,
                        borderRadius: 2,
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        transition: 'all 0.2s ease-in-out',
                        '&:hover': {
                          borderColor: 'primary.main',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        },
                      }}
                    >
                      {/* Encabezado de la Tarjeta */}
                      <Box
                        sx={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          mb: 2.5,
                          pb: 1.5,
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                          gap: 1,
                        }}
                      >
                        <Box
                          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}
                        >
                          <Chip
                            label={`#${idx + 1}`}
                            size="small"
                            color="primary"
                            sx={{ fontWeight: 'bold', borderRadius: 1 }}
                          />
                          <Typography
                            variant="subtitle1"
                            sx={{ fontWeight: 'bold', color: 'text.primary' }}
                          >
                            {p ? `${p.name} (${p.code})` : 'Nuevo Producto a Ingresar'}
                          </Typography>
                          {p && (
                            <Chip
                              label={`Unidad Base: ${p.baseUnit}`}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '0.75rem', fontWeight: 600, height: 24 }}
                            />
                          )}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                display: 'block',
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                              }}
                            >
                              Subtotal Línea
                            </Typography>
                            <Typography
                              variant="h6"
                              sx={{ fontWeight: 'bold', color: 'primary.main', lineHeight: 1.2 }}
                            >
                              ${subtotal.toLocaleString('es-CO')}
                            </Typography>
                          </Box>
                          <Tooltip title="Eliminar este producto">
                            <span>
                              <IconButton
                                aria-label={`Eliminar línea ${idx + 1}`}
                                color="error"
                                size="small"
                                onClick={() => handleRemoveLine(idx)}
                                disabled={lines.length <= 1}
                                sx={{
                                  border: '1px solid',
                                  borderColor: 'error.light',
                                  borderRadius: 1.5,
                                }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      </Box>

                      {/* Fila 1: Producto y Presentación */}
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '1.2fr minmax(0, 1fr)' },
                          gap: 2.5,
                          mb: 2,
                        }}
                      >
                        <PurchaseFormField
                          name={`lines.${idx}.productId`}
                          control={control}
                          select
                          size="small"
                          label="Producto *"
                          fullWidth
                          onChange={(e) => handleLineChange(idx, 'productId', e.target.value)}
                          required
                          helperText={
                            p
                              ? `Código/SKU: ${p.code} | Unidad mínima: ${p.baseUnit}`
                              : 'Seleccione el medicamento o artículo'
                          }
                        >
                          <MenuItem value="">Selecciona un producto...</MenuItem>
                          {products.map((prod) => (
                            <MenuItem key={prod.id} value={prod.id}>
                              {prod.name} ({prod.code}) — [{prod.baseUnit}]
                            </MenuItem>
                          ))}
                        </PurchaseFormField>

                        <PurchaseFormField
                          name={`lines.${idx}.presentationId`}
                          control={control}
                          select
                          size="small"
                          label="Presentación / Empaque Recibido *"
                          fullWidth
                          onChange={(e) => handleLineChange(idx, 'presentationId', e.target.value)}
                          disabled={!line.productId}
                          helperText={
                            selectedPres
                              ? `1 ${selectedPres.name} = ${
                                  selectedPres.containedPresentationId &&
                                  selectedPres.containedPresentationName
                                    ? `${selectedPres.quantityContained} ${selectedPres.containedPresentationName} = `
                                    : ''
                                }${selectedPres.conversionFactor} ${p?.baseUnit}`
                              : p
                                ? `Ingreso directo en unidad base (${p.baseUnit})`
                                : 'Primero elija un producto'
                          }
                        >
                          <MenuItem value="">
                            <em>[Unidad Base] {p?.baseUnit || 'UNIDAD'} (Factor 1:1)</em>
                          </MenuItem>
                          {p?.presentations
                            ?.filter((pres) => pres.isActive && (pres.purchaseEnabled ?? true))
                            .map((pres) => (
                              <MenuItem key={pres.id} value={pres.id}>
                                {pres.name} (x{pres.conversionFactor} {p.baseUnit})
                              </MenuItem>
                            ))}
                        </PurchaseFormField>
                      </Box>

                      {/* Fila 2: Lote, Vencimiento, Cantidad y Costo */}
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: {
                            xs: 'minmax(0, 1fr)',
                            sm: 'minmax(0, 1fr) minmax(0, 1fr)',
                            md: '1.2fr 1.2fr minmax(0, 1fr) 1.2fr',
                          },
                          gap: 2.5,
                        }}
                      >
                        {p?.inventoryControlMode === 'SERIAL' ? (
                          <PurchaseFormField
                            name={`lines.${idx}.serialNumbers`}
                            control={control}
                            size="small"
                            label="Series *"
                            fullWidth
                            multiline
                            minRows={1}
                            placeholder="Una por línea o separadas por coma"
                            onChange={(e) => handleLineChange(idx, 'serialNumbers', e.target.value)}
                            helperText="Una serie por cada unidad recibida"
                            required
                            sx={{ gridColumn: { md: 'span 2' } }}
                          />
                        ) : p?.inventoryControlMode === 'LOT' ||
                          p?.inventoryControlMode === 'LOT_EXPIRY' ? (
                          <>
                            <PurchaseFormField
                              name={`lines.${idx}.lotNumber`}
                              control={control}
                              size="small"
                              label="Número de Lote *"
                              fullWidth
                              placeholder="Ej. LOT-2026-X"
                              onChange={(e) => handleLineChange(idx, 'lotNumber', e.target.value)}
                              helperText="Identificador del lote del fabricante"
                              required
                            />
                            {p.inventoryControlMode === 'LOT_EXPIRY' ? (
                              <PurchaseFormField
                                name={`lines.${idx}.expirationDate`}
                                control={control}
                                size="small"
                                type="date"
                                label="Fecha de Vencimiento *"
                                fullWidth
                                onDateChange={(value) =>
                                  handleLineChange(idx, 'expirationDate', value)
                                }
                                helperText="Vencimiento sanitario (FEFO)"
                                required
                              />
                            ) : (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ alignSelf: 'center' }}
                              >
                                Sin vencimiento: sale por orden de entrada
                              </Typography>
                            )}
                          </>
                        ) : (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ alignSelf: 'center', gridColumn: { md: 'span 2' } }}
                          >
                            {p
                              ? `${inventoryControlModeLabel(p.inventoryControlMode)}: no requiere lote ni vencimiento`
                              : 'Seleccione un producto para ver si requiere lote'}
                          </Typography>
                        )}

                        <PurchaseFormField
                          name={`lines.${idx}.quantityCommercial`}
                          control={control}
                          size="small"
                          type="number"
                          label={`Cantidad (${selectedPres ? selectedPres.name : p?.baseUnit || 'Unid.'}) *`}
                          fullWidth
                          onChange={(e) =>
                            handleLineChange(idx, 'quantityCommercial', e.target.value)
                          }
                          slotProps={{ htmlInput: { min: '1', step: 'any' } }}
                          helperText="Unidades o empaques recibidos"
                          required
                        />

                        <PurchaseFormField
                          name={`lines.${idx}.unitCost`}
                          control={control}
                          size="small"
                          type="number"
                          label={`Costo por ${selectedPres ? selectedPres.name : p?.baseUnit || 'Unid.'} *`}
                          fullWidth
                          onChange={(e) => handleLineChange(idx, 'unitCost', e.target.value)}
                          slotProps={{
                            htmlInput: { min: '0', step: 'any' },
                            input: {
                              startAdornment: (
                                <Typography
                                  sx={{ mr: 0.5, color: 'text.secondary', fontWeight: 'bold' }}
                                >
                                  $
                                </Typography>
                              ),
                            },
                          }}
                          helperText="Precio de compra facturado"
                          required
                        />
                      </Box>

                      {/* Fila 3: Banner de Impacto en Inventario / Kardex */}
                      {p && (
                        <Box
                          sx={{
                            mt: 2,
                            p: 1.5,
                            bgcolor: 'rgba(22, 163, 74, 0.06)',
                            border: '1px solid rgba(22, 163, 74, 0.25)',
                            borderRadius: 1.5,
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 1.5,
                          }}
                        >
                          <Box
                            sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
                          >
                            <Inventory2Icon sx={{ color: 'success.main', fontSize: 20 }} />
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600, color: 'success.dark' }}
                            >
                              Ingreso a Kardex: +{totalBaseUnits.toLocaleString('es-CO')}{' '}
                              {p.baseUnit}
                            </Typography>
                            {selectedPres && (
                              <Typography
                                variant="caption"
                                sx={{
                                  color: 'text.secondary',
                                  bgcolor: 'background.paper',
                                  px: 1,
                                  py: 0.25,
                                  borderRadius: 1,
                                  border: '1px solid',
                                  borderColor: 'divider',
                                }}
                              >
                                {qtyCommercial} {selectedPres.name}
                                {selectedPres.containedPresentationId &&
                                  selectedPres.containedPresentationName && (
                                    <>
                                      {' '}
                                      ={' '}
                                      {(
                                        qtyCommercial * (selectedPres.quantityContained || 1)
                                      ).toLocaleString('es-CO')}{' '}
                                      {selectedPres.containedPresentationName}
                                    </>
                                  )}{' '}
                                = {totalBaseUnits.toLocaleString('es-CO')} {p.baseUnit}
                              </Typography>
                            )}
                          </Box>
                          <Box>
                            <Typography variant="body2" color="text.secondary">
                              Costo unitario base:{' '}
                              <strong style={{ color: '#16a34a' }}>
                                $
                                {costPerBaseUnit.toLocaleString('es-CO', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </strong>{' '}
                              / {p.baseUnit}
                            </Typography>
                          </Box>
                        </Box>
                      )}
                    </Paper>
                  );
                })}
              </Box>
            ) : (
              /* Vista de Tabla Corregida con Anchos Fijos y Alineación Superior */
              <TableContainer
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  overflowX: 'auto',
                }}
              >
                <Table
                  size="small"
                  sx={{ minWidth: 1250, '& td, & th': { verticalAlign: 'top', py: 1.5 } }}
                >
                  <TableHead sx={{ bgcolor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', minWidth: 260 }}>Producto *</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', minWidth: 220 }}>
                        Presentación / Unidad *
                      </TableCell>
                      <TableCell sx={{ fontWeight: 'bold', minWidth: 140 }}>
                        Lote / Series
                      </TableCell>
                      <TableCell sx={{ fontWeight: 'bold', minWidth: 165 }}>Vence</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', minWidth: 140, textAlign: 'right' }}>
                        Cantidad *
                      </TableCell>
                      <TableCell sx={{ fontWeight: 'bold', minWidth: 140, textAlign: 'right' }}>
                        Costo Presentación *
                      </TableCell>
                      <TableCell sx={{ fontWeight: 'bold', minWidth: 120, textAlign: 'right' }}>
                        Subtotal
                      </TableCell>
                      <TableCell sx={{ fontWeight: 'bold', minWidth: 60, textAlign: 'center' }}>
                        Acción
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {lines.map((line, idx) => {
                      const subtotal = calculateSubtotal(line);
                      const p = products.find((prod) => prod.id === line.productId);
                      const selectedPres = p?.presentations?.find(
                        (pr) => pr.id === line.presentationId,
                      );
                      const factor = selectedPres ? selectedPres.conversionFactor : 1;
                      const qtyCommercial = parseFloat(line.quantityCommercial) || 0;
                      const totalBaseUnits = Math.round(qtyCommercial * factor);
                      const unitCost = parseFloat(line.unitCost) || 0;
                      const costPerBaseUnit = factor > 0 ? unitCost / factor : unitCost;

                      return (
                        <TableRow
                          key={fields[idx].id}
                          sx={{ '&:hover': { bgcolor: 'action.hover' } }}
                        >
                          <TableCell sx={{ minWidth: 260 }}>
                            <PurchaseFormField
                              name={`lines.${idx}.productId`}
                              control={control}
                              select
                              size="small"
                              fullWidth
                              onChange={(e) => handleLineChange(idx, 'productId', e.target.value)}
                              required
                            >
                              <MenuItem value="">Selecciona...</MenuItem>
                              {products.map((prod) => (
                                <MenuItem key={prod.id} value={prod.id}>
                                  {prod.name} ({prod.code})
                                </MenuItem>
                              ))}
                            </PurchaseFormField>
                            {p && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block', mt: 0.75 }}
                              >
                                Unidad Base: <strong>{p.baseUnit}</strong>
                              </Typography>
                            )}
                          </TableCell>

                          <TableCell sx={{ minWidth: 220 }}>
                            <PurchaseFormField
                              name={`lines.${idx}.presentationId`}
                              control={control}
                              select
                              size="small"
                              fullWidth
                              onChange={(e) =>
                                handleLineChange(idx, 'presentationId', e.target.value)
                              }
                              disabled={!line.productId}
                            >
                              <MenuItem value="">
                                <em>[Unidad Base] {p?.baseUnit || 'UNIDAD'} (Factor 1:1)</em>
                              </MenuItem>
                              {p?.presentations
                                ?.filter((pres) => pres.isActive && (pres.purchaseEnabled ?? true))
                                .map((pres) => (
                                  <MenuItem key={pres.id} value={pres.id}>
                                    {pres.name} (x{pres.conversionFactor} {p.baseUnit})
                                  </MenuItem>
                                ))}
                            </PurchaseFormField>
                            {selectedPres && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block', mt: 0.75 }}
                              >
                                1 {selectedPres.name} ={' '}
                                {selectedPres.containedPresentationId &&
                                selectedPres.containedPresentationName
                                  ? `${selectedPres.quantityContained} ${selectedPres.containedPresentationName} = `
                                  : ''}
                                {selectedPres.conversionFactor} {p?.baseUnit}
                              </Typography>
                            )}
                          </TableCell>

                          {p?.inventoryControlMode === 'SERIAL' ? (
                            <TableCell colSpan={2} sx={{ minWidth: 305 }}>
                              <PurchaseFormField
                                name={`lines.${idx}.serialNumbers`}
                                control={control}
                                size="small"
                                fullWidth
                                multiline
                                placeholder="Series: una por línea o separadas por coma"
                                onChange={(e) =>
                                  handleLineChange(idx, 'serialNumbers', e.target.value)
                                }
                                required
                              />
                            </TableCell>
                          ) : (
                            <>
                              <TableCell sx={{ minWidth: 140 }}>
                                {p?.inventoryControlMode === 'LOT' ||
                                p?.inventoryControlMode === 'LOT_EXPIRY' ? (
                                  <PurchaseFormField
                                    name={`lines.${idx}.lotNumber`}
                                    control={control}
                                    size="small"
                                    fullWidth
                                    placeholder="LOTE-001"
                                    onChange={(e) =>
                                      handleLineChange(idx, 'lotNumber', e.target.value)
                                    }
                                    required
                                  />
                                ) : (
                                  <Typography variant="body2" color="text.secondary">
                                    {p ? 'Sin lote' : '—'}
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell sx={{ minWidth: 165 }}>
                                {p?.inventoryControlMode === 'LOT_EXPIRY' ? (
                                  <PurchaseFormField
                                    name={`lines.${idx}.expirationDate`}
                                    control={control}
                                    size="small"
                                    type="date"
                                    fullWidth
                                    onDateChange={(value) =>
                                      handleLineChange(idx, 'expirationDate', value)
                                    }
                                    required
                                  />
                                ) : (
                                  <Typography variant="body2" color="text.secondary">
                                    {p ? 'No vence' : '—'}
                                  </Typography>
                                )}
                              </TableCell>
                            </>
                          )}

                          <TableCell sx={{ minWidth: 140, textAlign: 'right' }}>
                            <PurchaseFormField
                              name={`lines.${idx}.quantityCommercial`}
                              control={control}
                              size="small"
                              type="number"
                              fullWidth
                              onChange={(e) =>
                                handleLineChange(idx, 'quantityCommercial', e.target.value)
                              }
                              slotProps={{
                                htmlInput: { min: '1', step: 'any', style: { textAlign: 'right' } },
                              }}
                              required
                            />
                            <Box sx={{ mt: 0.75, textAlign: 'right' }}>
                              {selectedPres?.containedPresentationId &&
                                selectedPres?.containedPresentationName && (
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: 'block' }}
                                  >
                                    Equivale a:{' '}
                                    {(
                                      qtyCommercial * (selectedPres.quantityContained || 1)
                                    ).toLocaleString('es-CO')}{' '}
                                    {selectedPres.containedPresentationName}
                                  </Typography>
                                )}
                              <Typography
                                variant="caption"
                                color="primary.main"
                                sx={{ display: 'block', fontWeight: 'bold' }}
                              >
                                Ingreso Kardex: +{totalBaseUnits.toLocaleString('es-CO')}{' '}
                                {p?.baseUnit || 'unidades'}
                              </Typography>
                            </Box>
                          </TableCell>

                          <TableCell sx={{ minWidth: 140, textAlign: 'right' }}>
                            <PurchaseFormField
                              name={`lines.${idx}.unitCost`}
                              control={control}
                              size="small"
                              type="number"
                              fullWidth
                              onChange={(e) => handleLineChange(idx, 'unitCost', e.target.value)}
                              slotProps={{
                                htmlInput: { min: '0', step: 'any', style: { textAlign: 'right' } },
                              }}
                              required
                            />
                            {factor > 1 && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block', mt: 0.75 }}
                              >
                                Costo base: ${costPerBaseUnit.toFixed(2)} / {p?.baseUnit || 'unid'}
                              </Typography>
                            )}
                          </TableCell>

                          <TableCell
                            sx={{ minWidth: 120, textAlign: 'right', fontWeight: 'bold', pt: 2.2 }}
                          >
                            ${subtotal.toLocaleString('es-CO')}
                          </TableCell>

                          <TableCell sx={{ minWidth: 60, textAlign: 'center', pt: 1.5 }}>
                            <Tooltip title="Eliminar línea">
                              <span>
                                <IconButton
                                  aria-label={`Eliminar línea ${idx + 1}`}
                                  size="small"
                                  color="error"
                                  onClick={() => handleRemoveLine(idx)}
                                  disabled={lines.length <= 1}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* Totalizador */}
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                mt: 3,
                pt: 2.5,
                borderTop: 1,
                borderColor: 'divider',
                gap: 2,
              }}
            >
              <Button variant="outlined" onClick={handleAddLine} startIcon={<AddIcon />}>
                Agregar Otra Línea
              </Button>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Total Unidades Base a Ingresar:{' '}
                  <strong>
                    {lines
                      .reduce((acc, l) => {
                        const prod = products.find((p) => p.id === l.productId);
                        const pr = prod?.presentations?.find(
                          (pres) => pres.id === l.presentationId,
                        );
                        const f = pr ? pr.conversionFactor : 1;
                        return acc + Math.round((parseFloat(l.quantityCommercial) || 0) * f);
                      }, 0)
                      .toLocaleString('es-CO')}
                  </strong>
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                  Subtotal de líneas: {formatCop(calculateTotal())}
                </Typography>
              </Box>
            </Box>
          </Paper>
        )}

        {/* Paso 3: totales y revisión. Esta pantalla es la confirmación */}
        {step === 2 && (
          <Paper sx={{ p: 3, mb: 3 }} component="section" aria-labelledby="purchase-review-title">
            <Typography id="purchase-review-title" variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
              Revisar y confirmar la recepción
            </Typography>
            <Box
              component="dl"
              sx={{
                m: 0,
                mb: 2,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '180px 1fr' },
                columnGap: 2,
                rowGap: 0.5,
                '& dt': { color: 'text.secondary', fontSize: '0.875rem' },
                '& dd': { m: 0, fontWeight: 600, fontSize: '0.875rem', mb: { xs: 0.75, sm: 0 } },
              }}
            >
              <dt>Proveedor</dt>
              <dd>{supplierName}</dd>
              <dt>Factura</dt>
              <dd>{invoiceNumber.trim().toUpperCase()}</dd>
              <dt>Fecha de la factura</dt>
              <dd>{formatDate(purchaseDate)}</dd>
              <dt>Condición de pago</dt>
              <dd>
                {paymentCondition === 'CONTADO' ? 'Contado' : 'Crédito'} · vence{' '}
                {formatDate(dueDate)}
              </dd>
            </Box>

            <TableContainer sx={{ mb: 2 }}>
              <Table size="small" aria-label="Líneas a recibir" sx={{ minWidth: 760 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Producto</TableCell>
                    <TableCell>Presentación</TableCell>
                    <TableCell align="right">Cantidad</TableCell>
                    <TableCell align="right">Unidades base</TableCell>
                    <TableCell align="right">Costo unitario</TableCell>
                    <TableCell>Lote / serie</TableCell>
                    <TableCell align="right">Subtotal</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((line, idx) => {
                    const product = productOf(line);
                    const presentation = presentationOf(line);
                    const serials = parseSerialNumbers(line.serialNumbers);
                    return (
                      <TableRow key={fields[idx]?.id ?? idx}>
                        <TableCell sx={{ fontWeight: 600 }}>{product?.name ?? '—'}</TableCell>
                        <TableCell>
                          {presentation
                            ? `${presentation.name} (x${presentation.conversionFactor} ${product?.baseUnit ?? ''})`
                            : `Unidad base (${product?.baseUnit ?? ''})`}
                        </TableCell>
                        <TableCell align="right">{line.quantityCommercial}</TableCell>
                        <TableCell align="right">{baseUnitsOf(line)}</TableCell>
                        <TableCell align="right">{formatCop(line.unitCost)}</TableCell>
                        <TableCell>
                          {line.lotNumber.trim()
                            ? `${line.lotNumber.trim().toUpperCase()}${line.expirationDate ? ` · vence ${formatDate(line.expirationDate)}` : ''}`
                            : serials.length > 0
                              ? `${serials.length} series`
                              : 'Sin lote'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {formatCop(calculateSubtotal(line))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            <Typography variant="h6" component="p" sx={{ textAlign: 'right', mb: 2 }}>
              Subtotal de líneas: <strong>{formatCop(calculateTotal())}</strong>
            </Typography>

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Qué registra el sistema al confirmar
            </Typography>
            <Box
              component="dl"
              data-testid="purchase-effects"
              sx={{
                m: 0,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '130px 1fr' },
                columnGap: 2,
                rowGap: 0.5,
                '& dt': { fontWeight: 700, fontSize: '0.875rem' },
                '& dd': { m: 0, fontSize: '0.875rem', mb: { xs: 0.75, sm: 0 } },
              }}
            >
              <dt>Inventario</dt>
              <dd>
                Entran {totalBaseUnits.toLocaleString('es-CO')} unidades base. Cada lote queda con
                su vencimiento y la entrada se registra en el Kardex como compra.
              </dd>
              <dt>Proveedor</dt>
              <dd>
                Se abre una cuenta por pagar a {supplierName} que vence el {formatDate(dueDate)}.
              </dd>
              <dt>Contabilidad</dt>
              <dd>
                Se registra el asiento de la compra (inventario contra proveedores). Si la empresa
                tiene perfil tributario, el IVA y las retenciones se calculan al registrar y el
                total definitivo queda en el detalle de la compra.
              </dd>
            </Box>
          </Paper>
        )}

        {/* Navegación del asistente */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          {step === 0 ? (
            <Button variant="outlined" component={Link} to="/purchases" size="large">
              Cancelar
            </Button>
          ) : (
            <Button
              variant="outlined"
              size="large"
              disabled={submitting}
              onClick={() => setStep(step - 1)}
            >
              Volver
            </Button>
          )}
          {step === 0 && (
            <Button variant="contained" size="large" onClick={() => void goToLines()}>
              Continuar a productos
            </Button>
          )}
          {step === 1 && (
            <Button variant="contained" size="large" onClick={() => void goToReview()}>
              Revisar totales
            </Button>
          )}
          {step === 2 && (
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={submitting}
              sx={{ fontWeight: 700 }}
            >
              {submitting ? 'Registrando compra…' : 'Confirmar recepción de compra'}
            </Button>
          )}
        </Box>
      </form>
    </Box>
  );
};

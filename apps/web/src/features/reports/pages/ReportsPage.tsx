import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HomeBackButton } from '../../../components/HomeBackButton';
import {
  Alert,
  Chip,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  downloadReportCsv,
  fetchCashSummaryReport,
  fetchExpirationsReport,
  fetchSupplierReturnsReport,
  fetchInventoryValuationReport,
  fetchSalesReport,
} from '../api/reports.api';
import { QuickDateRange } from '../../../components/QuickDateRange';
import type { SupplierReturnStatus } from '@farmacia/contracts';

type ReportTab = 'valuation' | 'expirations' | 'supplier-returns' | 'sales' | 'cash';

const RETURN_STATUS: Record<SupplierReturnStatus, { label: string; color: 'warning' | 'error' | 'default' }> = {
  AVISAR_AHORA: { label: 'Avisar al proveedor', color: 'warning' },
  AVISO_ATRASADO: { label: 'Aviso atrasado', color: 'error' },
  FUERA_DE_PLAZO: { label: 'Fuera del plazo de devolución', color: 'default' },
};

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('valuation');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // 1. Inventario Valorizado
  const valuationQuery = useQuery({
    queryKey: ['reports', 'valuation'],
    queryFn: fetchInventoryValuationReport,
    enabled: activeTab === 'valuation',
  });

  // 2. Vencimientos
  const expirationsQuery = useQuery({
    queryKey: ['reports', 'expirations'],
    queryFn: fetchExpirationsReport,
    enabled: activeTab === 'expirations',
  });

  // 2b. Devoluciones a proveedor por vencimiento (acuerdo del 4 de octubre)
  const supplierReturnsQuery = useQuery({
    queryKey: ['reports', 'supplier-returns'],
    queryFn: fetchSupplierReturnsReport,
    enabled: activeTab === 'supplier-returns',
  });

  // 3. Ventas por período
  const salesQuery = useQuery({
    queryKey: ['reports', 'sales', fromDate, toDate],
    queryFn: () => fetchSalesReport({ fromDate: fromDate || undefined, toDate: toDate || undefined }),
    enabled: activeTab === 'sales',
  });

  // 4. Movimientos de Caja
  const cashQuery = useQuery({
    queryKey: ['reports', 'cash', fromDate, toDate],
    queryFn: () => fetchCashSummaryReport({ fromDate: fromDate || undefined, toDate: toDate || undefined }),
    enabled: activeTab === 'cash',
  });

  const handleExportCsv = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      let reportKey: 'inventory-valuation' | 'expirations' | 'sales' | 'cash-summary' | 'supplier-returns';
      if (activeTab === 'valuation') reportKey = 'inventory-valuation';
      else if (activeTab === 'expirations') reportKey = 'expirations';
      else if (activeTab === 'supplier-returns') reportKey = 'supplier-returns';
      else if (activeTab === 'sales') reportKey = 'sales';
      else reportKey = 'cash-summary';

      await downloadReportCsv(reportKey, {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
    } catch {
      setExportError('No fue posible generar la exportación en archivo CSV. Verifica tu conexión.');
    } finally {
      setIsExporting(false);
    }
  };

  const formatCurrency = (val?: number | null) => {
    return `$ ${(val ?? 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        {/* Cabecera y Navegación */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
              Reportes Operativos y Exportación
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Consultas consolidadas, análisis de existencias, auditoría de ventas y movimientos de caja en tiempo real.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <HomeBackButton />
            <Button
              variant="contained"
              color="primary"
              onClick={() => void handleExportCsv()}
              disabled={isExporting}
              data-testid="export-csv-btn"
            >
              {isExporting ? 'Exportando…' : '📥 Exportar a CSV / Excel'}
            </Button>
          </Box>
        </Box>

        {exportError ? (
          <Alert severity="error" onClose={() => setExportError(null)}>
            {exportError}
          </Alert>
        ) : null}

        {/* Barra de Pestañas de Reportes */}
        <Paper variant="outlined">
          <Tabs
            value={activeTab}
            onChange={(_, val) => setActiveTab(val as ReportTab)}
            variant="scrollable"
            scrollButtons="auto"
            data-testid="reports-tabs"
          >
            <Tab label="📦 Inventario Valorizado" value="valuation" data-testid="tab-valuation" />
            <Tab label="⏳ Lotes y Vencimientos" value="expirations" data-testid="tab-expirations" />
            <Tab label="Devoluciones a proveedor" value="supplier-returns" data-testid="tab-supplier-returns" />
            <Tab label="💰 Ventas por Período" value="sales" data-testid="tab-sales" />
            <Tab label="💵 Movimientos de Caja" value="cash" data-testid="tab-cash" />
          </Tabs>
        </Paper>

        {/* Filtros de Fecha (para Ventas y Caja) */}
        {(activeTab === 'sales' || activeTab === 'cash') && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Rango de fechas:
              </Typography>
              <TextField
                size="small"
                label="Desde"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                data-testid="from-date-input"
              />
              <TextField
                size="small"
                label="Hasta"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                data-testid="to-date-input"
              />
              {(fromDate || toDate) && (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => {
                    setFromDate('');
                    setToDate('');
                  }}
                  data-testid="clear-dates-btn"
                >
                  Limpiar fechas
                </Button>
              )}
            </Stack>
            <QuickDateRange
              onSelect={({ from, to }) => {
                setFromDate(from);
                setToDate(to);
              }}
            />
          </Paper>
        )}

        {/* ========================================================================= */}
        {/* PESTAÑA 1: INVENTARIO VALORIZADO                                          */}
        {/* ========================================================================= */}
        {activeTab === 'valuation' && (
          <Stack spacing={3}>
            {/* Tarjetas de Resumen */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
                gap: 2,
              }}
            >
              <Card variant="outlined">
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    PRODUCTOS ACTIVOS
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5 }}>
                    {valuationQuery.data?.totalProducts ?? 0}
                  </Typography>
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    EXISTENCIAS TOTALES
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5 }}>
                    {valuationQuery.data?.totalUnits.toLocaleString('es-CO') ?? 0} unid.
                  </Typography>
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    VALORIZACIÓN AL COSTO
                  </Typography>
                  <Typography variant="h5" color="primary.main" sx={{ fontWeight: 800, mt: 0.5 }}>
                    {formatCurrency(valuationQuery.data?.totalCostValuation ?? 0)}
                  </Typography>
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    VALORIZACIÓN A LA VENTA
                  </Typography>
                  <Typography variant="h5" color="success.main" sx={{ fontWeight: 800, mt: 0.5 }}>
                    {formatCurrency(valuationQuery.data?.totalPriceValuation ?? 0)}
                  </Typography>
                </CardContent>
              </Card>
            </Box>

            {/* Tabla */}
            <Paper variant="outlined">
              <TableContainer>
                <Table size="medium">
                  <TableHead sx={{ bgcolor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Código</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Medicamento / Producto</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Categoría</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Stock Actual</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Costo Unitario</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Precio Unitario</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Valor al Costo</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Valor a la Venta</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {valuationQuery.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                          <CircularProgress size={32} />
                        </TableCell>
                      </TableRow>
                    ) : valuationQuery.data?.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                          <Typography color="text.secondary">No hay productos en inventario.</Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      valuationQuery.data?.items.map((row) => (
                        <TableRow key={row.productId} hover data-testid={`val-row-${row.productCode}`}>
                          <TableCell sx={{ fontWeight: 600 }}>{row.productCode}</TableCell>
                          <TableCell>{row.productName}</TableCell>
                          <TableCell>{row.categoryName}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {row.currentStock} {row.baseUnit}
                          </TableCell>
                          <TableCell align="right">{formatCurrency(row.baseCost)}</TableCell>
                          <TableCell align="right">{formatCurrency(row.basePrice)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(row.totalCostValue)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>
                            {formatCurrency(row.totalPriceValue)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Stack>
        )}

        {/* ========================================================================= */}
        {/* PESTAÑA 2: LOTES Y PRÓXIMOS VENCIMIENTOS                                   */}
        {/* ========================================================================= */}
        {activeTab === 'supplier-returns' && (
          <Paper sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Lotes con existencias que vencen en 120 días o menos. Se avisa al proveedor entre 120 y 110 días antes
                del vencimiento para que retire la mercancía; la devolución se acepta hasta 90 días antes.
              </Typography>
              {supplierReturnsQuery.isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={32} />
                </Box>
              ) : supplierReturnsQuery.isError ? (
                <Alert severity="error">No fue posible cargar el reporte de devoluciones a proveedor.</Alert>
              ) : (
                <>
                  <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                    <Chip color="warning" label={`Avisar ahora: ${supplierReturnsQuery.data?.notifyNowCount ?? 0}`} />
                    <Chip color="error" label={`Aviso atrasado: ${supplierReturnsQuery.data?.lateNoticeCount ?? 0}`} />
                    <Chip label={`Fuera de plazo: ${supplierReturnsQuery.data?.outOfWindowCount ?? 0}`} />
                  </Stack>
                  <TableContainer>
                    <Table size="small" aria-label="Lotes para devolución a proveedor">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Proveedor</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Producto</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Lote</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Vence</TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="right">Días</TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="right">Existencia</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {!supplierReturnsQuery.data?.items.length ? (
                          <TableRow>
                            <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                              No hay lotes en la ventana de aviso.
                            </TableCell>
                          </TableRow>
                        ) : (
                          supplierReturnsQuery.data.items.map((item) => (
                            <TableRow key={item.lotId} hover>
                              <TableCell>
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  color={RETURN_STATUS[item.status].color}
                                  label={RETURN_STATUS[item.status].label}
                                />
                              </TableCell>
                              <TableCell>
                                {item.supplierName ?? 'Sin compra registrada'}
                                {item.supplierPhone && (
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    Tel. {item.supplierPhone} · Factura {item.lastPurchaseInvoice}
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell>
                                {item.productCode} — {item.productName}
                              </TableCell>
                              <TableCell sx={{ fontFamily: 'monospace' }}>{item.lotNumber}</TableCell>
                              <TableCell>{item.expirationDate}</TableCell>
                              <TableCell align="right">{item.daysRemaining}</TableCell>
                              <TableCell align="right">
                                {item.currentQuantity} {item.baseUnit}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}
            </Stack>
          </Paper>
        )}

        {activeTab === 'expirations' && (
          <Stack spacing={3}>
            {/* Tarjetas de Resumen */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
                gap: 2,
              }}
            >
              <Card variant="outlined" sx={{ borderColor: 'error.main' }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="error.main" sx={{ fontWeight: 700 }}>
                    🔴 VENCIDOS (≤ 0d)
                  </Typography>
                  <Typography variant="h5" color="error.main" sx={{ fontWeight: 800, mt: 0.5 }}>
                    {expirationsQuery.data?.vencidosCount ?? 0}
                  </Typography>
                </CardContent>
              </Card>

              <Card variant="outlined" sx={{ borderColor: '#ed6c02' }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" sx={{ color: '#ed6c02', fontWeight: 700 }}>
                    🟠 CRÍTICOS (&lt; 30d)
                  </Typography>
                  <Typography variant="h5" sx={{ color: '#ed6c02', fontWeight: 800, mt: 0.5 }}>
                    {expirationsQuery.data?.criticosCount ?? 0}
                  </Typography>
                </CardContent>
              </Card>

              <Card variant="outlined" sx={{ borderColor: 'warning.main' }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="warning.dark" sx={{ fontWeight: 700 }}>
                    🟡 EN ALERTA (31-60d)
                  </Typography>
                  <Typography variant="h5" color="warning.dark" sx={{ fontWeight: 800, mt: 0.5 }}>
                    {expirationsQuery.data?.alertasCount ?? 0}
                  </Typography>
                </CardContent>
              </Card>

              <Card variant="outlined" sx={{ borderColor: 'info.main' }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="info.main" sx={{ fontWeight: 700 }}>
                    🔵 PRÓXIMOS (61-90d)
                  </Typography>
                  <Typography variant="h5" color="info.main" sx={{ fontWeight: 800, mt: 0.5 }}>
                    {expirationsQuery.data?.proximosCount ?? 0}
                  </Typography>
                </CardContent>
              </Card>
            </Box>

            {/* Tabla */}
            <Paper variant="outlined">
              <TableContainer>
                <Table size="medium">
                  <TableHead sx={{ bgcolor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Lote</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Medicamento</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Categoría</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Fecha Vencimiento</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Días Restantes</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Severidad</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Stock Actual</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Ubicación</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {expirationsQuery.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                          <CircularProgress size={32} />
                        </TableCell>
                      </TableRow>
                    ) : expirationsQuery.data?.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                          <Typography color="text.secondary">No hay lotes en riesgo de vencimiento.</Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      expirationsQuery.data?.items.map((row) => (
                        <TableRow key={row.lotId} hover data-testid={`exp-row-${row.lotNumber}`}>
                          <TableCell sx={{ fontWeight: 700 }}>{row.lotNumber}</TableCell>
                          <TableCell>{row.productName}</TableCell>
                          <TableCell>{row.categoryName}</TableCell>
                          <TableCell>{row.expirationDate}</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {row.daysRemaining <= 0 ? `Vencido (${Math.abs(row.daysRemaining)}d)` : `${row.daysRemaining} días`}
                          </TableCell>
                          <TableCell>{row.severity}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {row.currentQuantity} {row.baseUnit}
                          </TableCell>
                          <TableCell>{row.locationName}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Stack>
        )}

        {/* ========================================================================= */}
        {/* PESTAÑA 3: VENTAS POR PERÍODO                                              */}
        {/* ========================================================================= */}
        {activeTab === 'sales' && (
          <Stack spacing={3}>
            {/* Tarjetas de Resumen */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                gap: 2,
              }}
            >
              <Card variant="outlined">
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    TOTAL VENTAS
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5 }}>
                    {salesQuery.data?.totalSales ?? 0} transacciones
                  </Typography>
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    MONTO TOTAL FACTURADO
                  </Typography>
                  <Typography variant="h5" color="success.main" sx={{ fontWeight: 800, mt: 0.5 }}>
                    {formatCurrency(salesQuery.data?.totalAmount ?? 0)}
                  </Typography>
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    MEDIOS DE PAGO
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {salesQuery.data?.byPaymentMethod
                      ? Object.entries(salesQuery.data.byPaymentMethod)
                          .map(([m, val]) => `${m}: ${formatCurrency(val)}`)
                          .join(' | ')
                      : 'Sin ventas'}
                  </Typography>
                </CardContent>
              </Card>
            </Box>

            {/* Tabla */}
            <Paper variant="outlined">
              <TableContainer>
                <Table size="medium">
                  <TableHead sx={{ bgcolor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Comprobante</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Fecha y Hora</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Cliente</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Medio Pago</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="center">Líneas</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Subtotal</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Impuesto</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Total</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {salesQuery.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                          <CircularProgress size={32} />
                        </TableCell>
                      </TableRow>
                    ) : salesQuery.data?.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                          <Typography color="text.secondary">No hay ventas registradas en el período seleccionado.</Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      salesQuery.data?.items.map((row) => (
                        <TableRow key={row.saleId} hover data-testid={`sale-row-${row.invoiceNumber}`}>
                          <TableCell sx={{ fontWeight: 700 }}>{row.invoiceNumber}</TableCell>
                          <TableCell>{new Date(row.soldAt).toLocaleString('es-CO')}</TableCell>
                          <TableCell>{row.customerName}</TableCell>
                          <TableCell>{row.paymentMethod}</TableCell>
                          <TableCell align="center">{row.itemsCount}</TableCell>
                          <TableCell align="right">{formatCurrency(row.subtotal)}</TableCell>
                          <TableCell align="right">{formatCurrency(row.taxAmount)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(row.totalAmount)}</TableCell>
                          <TableCell>{row.status}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Stack>
        )}

        {/* ========================================================================= */}
        {/* PESTAÑA 4: MOVIMIENTOS DE CAJA                                            */}
        {/* ========================================================================= */}
        {activeTab === 'cash' && (
          <Stack spacing={3}>
            {/* Tarjetas de Resumen */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
                gap: 2,
              }}
            >
              <Card variant="outlined">
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    TOTAL MOVIMIENTOS
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5 }}>
                    {cashQuery.data?.totalMovements ?? 0}
                  </Typography>
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="success.main" sx={{ fontWeight: 700 }}>
                    INGRESOS (+)
                  </Typography>
                  <Typography variant="h5" color="success.main" sx={{ fontWeight: 800, mt: 0.5 }}>
                    {formatCurrency(cashQuery.data?.totalInflows ?? 0)}
                  </Typography>
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="error.main" sx={{ fontWeight: 700 }}>
                    EGRESOS (-)
                  </Typography>
                  <Typography variant="h5" color="error.main" sx={{ fontWeight: 800, mt: 0.5 }}>
                    {formatCurrency(cashQuery.data?.totalOutflows ?? 0)}
                  </Typography>
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="primary.main" sx={{ fontWeight: 700 }}>
                    FLUJO NETO
                  </Typography>
                  <Typography variant="h5" color="primary.main" sx={{ fontWeight: 800, mt: 0.5 }}>
                    {formatCurrency(cashQuery.data?.netCashFlow ?? 0)}
                  </Typography>
                </CardContent>
              </Card>
            </Box>

            {/* Tabla */}
            <Paper variant="outlined">
              <TableContainer>
                <Table size="medium">
                  <TableHead sx={{ bgcolor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Fecha y Hora</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Tipo Flujo</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Concepto</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Débito</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Crédito</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Saldo</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Medio Pago</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Doc. Referencia</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Usuario</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cashQuery.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                          <CircularProgress size={32} />
                        </TableCell>
                      </TableRow>
                    ) : cashQuery.data?.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                          <Typography color="text.secondary">No hay movimientos de caja en el período.</Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      cashQuery.data?.items.map((row) => (
                        <TableRow key={row.id} hover data-testid={`cash-row-${row.id}`}>
                          <TableCell>{new Date(row.createdAt).toLocaleString('es-CO')}</TableCell>
                          <TableCell>
                            <Typography
                              component="span"
                              sx={{
                                fontWeight: 700,
                                color: row.movementType === 'IN' ? 'success.main' : 'error.main',
                              }}
                            >
                              {row.movementType === 'IN' ? 'INGRESO (+)' : 'EGRESO (-)'}
                            </Typography>
                          </TableCell>
                          <TableCell>{row.concept}</TableCell>
                          {/* Débitos positivos y créditos negativos (acuerdo del 4 de octubre) */}
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {row.debit ? formatCurrency(row.debit) : ''}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {row.credit ? `-${formatCurrency(-row.credit)}` : ''}
                          </TableCell>
                          <TableCell align="right">{formatCurrency(row.balanceAfter)}</TableCell>
                          <TableCell>{row.paymentMethod}</TableCell>
                          <TableCell>
                            {row.referenceDocumentType ? `${row.referenceDocumentType} ${row.referenceDocumentId || ''}` : 'N/A'}
                          </TableCell>
                          <TableCell>{row.userName || 'Sistema'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}

export default ReportsPage;

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  Paper,
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
import { useQuery } from '@tanstack/react-query';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { usePermissions } from '../../auth/hooks/usePermissions';
import { fetchIncomeStatement, exportIncomeStatementExcel } from '../api/accounting.api';

function formatMoney(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '$0.00';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return '$0.00';
  return `$${num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const IncomeStatementPage = () => {
  const { hasPermission } = usePermissions();

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(today);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['income-statement', fromDate, toDate],
    queryFn: () => fetchIncomeStatement(fromDate, toDate),
    enabled: Boolean(fromDate && toDate),
  });

  const handleShortcut = (type: 'today' | 'this_month' | 'last_month' | 'ytd') => {
    const d = new Date();
    if (type === 'today') {
      const t = d.toISOString().slice(0, 10);
      setFromDate(t);
      setToDate(t);
    } else if (type === 'this_month') {
      const f = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
      const t = d.toISOString().slice(0, 10);
      setFromDate(f);
      setToDate(t);
    } else if (type === 'last_month') {
      const f = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
      const t = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
      setFromDate(f);
      setToDate(t);
    } else if (type === 'ytd') {
      const f = new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
      const t = d.toISOString().slice(0, 10);
      setFromDate(f);
      setToDate(t);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setExportError(null);
      await exportIncomeStatementExcel(fromDate, toDate);
    } catch (err: any) {
      setExportError(err?.message || 'Error al exportar el Estado de Resultados a Excel.');
    } finally {
      setIsExporting(false);
    }
  };

  if (!hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_READ)) {
    return (
      <Container component="main" sx={{ py: 4 }}>
        <Alert severity="warning">No tienes permiso para consultar reportes contables.</Alert>
      </Container>
    );
  }

  const isNetIncomePositive = data ? Number(data.netIncome) >= 0 : true;

  return (
    <Container component="main" maxWidth="xl" sx={{ py: 4 }}>
      <Stack spacing={3}>
        {/* Cabecera y Título */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
              Estado de Resultados (PyG)
            </Typography>
            <Typography color="text.secondary">
              Rendimiento financiero operativo: ingresos por ventas, costos FEFO reales y gastos operacionales.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            color="primary"
            onClick={handleExport}
            disabled={isExporting || isLoading || !data}
          >
            {isExporting ? 'Generando Excel...' : 'Exportar a Excel (.xlsx)'}
          </Button>
        </Box>

        {exportError && <Alert severity="error">{exportError}</Alert>}

        {/* Barra de Filtros y Atajos */}
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
              <TextField
                label="Fecha Desde"
                type="date"
                size="small"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Fecha Hasta"
                type="date"
                size="small"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <Button variant="contained" onClick={() => refetch()} disabled={isLoading}>
                Consultar
              </Button>
            </Stack>

            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button size="small" variant="text" onClick={() => handleShortcut('today')}>
                Hoy
              </Button>
              <Button size="small" variant="text" onClick={() => handleShortcut('this_month')}>
                Este Mes
              </Button>
              <Button size="small" variant="text" onClick={() => handleShortcut('last_month')}>
                Mes Anterior
              </Button>
              <Button size="small" variant="text" onClick={() => handleShortcut('ytd')}>
                Año a la Fecha
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {isError && (
          <Alert severity="error">
            Ocurrió un error al cargar el Estado de Resultados. Por favor intenta de nuevo.
          </Alert>
        )}

        {data && (
          <>
            {/* Tarjetas KPI de Resumen Financiero */}
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                      Ventas Netas
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, mt: 1 }}>
                      {formatMoney(data.netSales)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Brutas: {formatMoney(data.grossSales)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                      Costo de Ventas
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, mt: 1, color: 'text.primary' }}>
                      {formatMoney(data.costOfGoodsSold)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Trazabilidad FEFO
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                      Utilidad Bruta
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, mt: 1, color: 'success.main' }}>
                      {formatMoney(data.grossProfit)}
                    </Typography>
                    <Chip
                      size="small"
                      label={`Margen: ${data.grossMarginPercentage}%`}
                      color="success"
                      variant="outlined"
                      sx={{ mt: 0.5, height: 20, fontSize: '0.75rem' }}
                    />
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                      Gastos Operativos
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, mt: 1, color: 'warning.main' }}>
                      {formatMoney(data.totalOperatingExpenses)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {data.operatingExpenses.length} cuentas de gasto
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <Card variant="outlined" sx={{ bgcolor: isNetIncomePositive ? 'success.50' : 'error.50' }}>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                      Resultado Neto
                    </Typography>
                    <Typography
                      variant="h5"
                      sx={{
                        fontWeight: 700,
                        mt: 1,
                        color: isNetIncomePositive ? 'success.dark' : 'error.dark',
                      }}
                    >
                      {formatMoney(data.netIncome)}
                    </Typography>
                    <Chip
                      size="small"
                      label={`Margen: ${data.operatingMarginPercentage}%`}
                      color={isNetIncomePositive ? 'success' : 'error'}
                      sx={{ mt: 0.5, height: 20, fontSize: '0.75rem' }}
                    />
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Estructura Cascada Contable */}
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                Estructura Detallada de Pérdidas y Ganancias
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Concepto Contable</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Valor Parcial</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Total Rubro</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {/* 1. Ingresos */}
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>
                        1. INGRESOS DE ACTIVIDADES ORDINARIAS (VENTAS)
                      </TableCell>
                      <TableCell align="right"></TableCell>
                      <TableCell align="right"></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ pl: 4 }}>Ventas Brutas Totales</TableCell>
                      <TableCell align="right">{formatMoney(data.grossSales)}</TableCell>
                      <TableCell align="right"></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ pl: 4, color: 'text.secondary' }}>(-) Devoluciones en Ventas</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary' }}>({formatMoney(data.returns)})</TableCell>
                      <TableCell align="right"></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ pl: 4, color: 'text.secondary' }}>(-) Descuentos Comerciales Concedidos</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary' }}>({formatMoney(data.discounts)})</TableCell>
                      <TableCell align="right"></TableCell>
                    </TableRow>
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                      <TableCell sx={{ pl: 4, fontWeight: 700 }}>(=) VENTAS NETAS TOTALES</TableCell>
                      <TableCell align="right"></TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{formatMoney(data.netSales)}</TableCell>
                    </TableRow>

                    {/* 2. Costo de Ventas */}
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, color: 'primary.main', pt: 3 }}>
                        2. COSTO DE VENTAS (FEFO)
                      </TableCell>
                      <TableCell align="right"></TableCell>
                      <TableCell align="right"></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ pl: 4 }}>(-) Costo de Mercancía Vendida</TableCell>
                      <TableCell align="right"></TableCell>
                      <TableCell align="right" sx={{ color: 'error.main' }}>({formatMoney(data.costOfGoodsSold)})</TableCell>
                    </TableRow>

                    {/* 3. Utilidad Bruta */}
                    <TableRow sx={{ bgcolor: 'success.50' }}>
                      <TableCell sx={{ fontWeight: 700, color: 'success.dark', py: 1.5 }}>
                        (=) UTILIDAD BRUTA (Margen Bruto: {data.grossMarginPercentage}%)
                      </TableCell>
                      <TableCell align="right"></TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'success.dark', fontSize: '1.05rem' }}>
                        {formatMoney(data.grossProfit)}
                      </TableCell>
                    </TableRow>

                    {/* 4. Gastos Operacionales */}
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, color: 'primary.main', pt: 3 }}>
                        3. GASTOS OPERACIONALES DE ADMINISTRACIÓN Y VENTAS
                      </TableCell>
                      <TableCell align="right"></TableCell>
                      <TableCell align="right"></TableCell>
                    </TableRow>

                    {data.operatingExpenses.length === 0 ? (
                      <TableRow>
                        <TableCell sx={{ pl: 4, color: 'text.secondary', fontStyle: 'italic' }}>
                          No se registraron gastos operacionales en este período.
                        </TableCell>
                        <TableCell align="right">$0.00</TableCell>
                        <TableCell align="right"></TableCell>
                      </TableRow>
                    ) : (
                      data.operatingExpenses.map((exp) => (
                        <TableRow key={exp.accountId}>
                          <TableCell sx={{ pl: 4 }}>
                            <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', fontWeight: 600, mr: 1 }}>
                              {exp.accountCode}
                            </Typography>
                            {exp.accountName}
                          </TableCell>
                          <TableCell align="right">{formatMoney(exp.amount)}</TableCell>
                          <TableCell align="right"></TableCell>
                        </TableRow>
                      ))
                    )}

                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                      <TableCell sx={{ pl: 4, fontWeight: 700 }}>(-) TOTAL GASTOS OPERACIONALES</TableCell>
                      <TableCell align="right"></TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'warning.dark' }}>
                        ({formatMoney(data.totalOperatingExpenses)})
                      </TableCell>
                    </TableRow>

                    {/* 5. Utilidad Operacional / Resultado Neto */}
                    <TableRow sx={{ bgcolor: isNetIncomePositive ? 'success.100' : 'error.100' }}>
                      <TableCell sx={{ fontWeight: 800, color: isNetIncomePositive ? 'success.dark' : 'error.dark', py: 2, fontSize: '1rem' }}>
                        (=) UTILIDAD OPERACIONAL / RESULTADO NETO (Margen Neto: {data.operatingMarginPercentage}%)
                      </TableCell>
                      <TableCell align="right"></TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 800,
                          color: isNetIncomePositive ? 'success.dark' : 'error.dark',
                          fontSize: '1.15rem',
                        }}
                      >
                        {formatMoney(data.netIncome)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </>
        )}
      </Stack>
    </Container>
  );
};

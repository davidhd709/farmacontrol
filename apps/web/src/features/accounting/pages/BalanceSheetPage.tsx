import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { SYSTEM_PERMISSIONS, type BalanceSheetCategoryGroupDto } from '@farmacia/contracts';
import { usePermissions } from '../../auth/hooks/usePermissions';
import { fetchBalanceSheet, exportBalanceSheetExcel } from '../api/accounting.api';
import { localIsoDate } from '../../../components/QuickDateRange';

function formatMoney(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '$0.00';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return '$0.00';
  return `$${num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface GroupTableProps {
  group: BalanceSheetCategoryGroupDto;
}

const CategoryGroupTable = ({ group }: GroupTableProps) => {
  if (!group || group.accounts.length === 0) return null;

  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
        {group.title}
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableBody>
            {group.accounts.map((acc) => (
              <TableRow key={acc.accountId} hover>
                <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, width: 90, py: 0.5 }}>
                  {acc.accountCode}
                </TableCell>
                <TableCell sx={{ py: 0.5 }}>{acc.accountName}</TableCell>
                <TableCell align="right" sx={{ width: 130, py: 0.5 }}>
                  {formatMoney(acc.balance)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              <TableCell colSpan={2} sx={{ fontWeight: 600, py: 0.5 }}>
                Subtotal {group.title}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, py: 0.5 }}>
                {formatMoney(group.total)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export const BalanceSheetPage = () => {
  const { hasPermission } = usePermissions();

  const today = localIsoDate(new Date());
  const [asOfDate, setAsOfDate] = useState(today);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['balance-sheet', asOfDate],
    queryFn: () => fetchBalanceSheet(asOfDate),
    enabled: Boolean(asOfDate),
  });

  const handleShortcut = (type: 'today' | 'last_month_end' | 'last_year_end') => {
    const d = new Date();
    if (type === 'today') {
      setAsOfDate(localIsoDate(d));
    } else if (type === 'last_month_end') {
      const endLastMonth = localIsoDate(new Date(d.getFullYear(), d.getMonth(), 0));
      setAsOfDate(endLastMonth);
    } else if (type === 'last_year_end') {
      const endLastYear = localIsoDate(new Date(d.getFullYear() - 1, 11, 31));
      setAsOfDate(endLastYear);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setExportError(null);
      await exportBalanceSheetExcel(asOfDate);
    } catch (err: any) {
      setExportError(err?.message || 'Error al exportar el Balance General a Excel.');
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

  return (
    <Container component="main" maxWidth="xl" sx={{ py: 4 }}>
      <Stack spacing={3}>
        {/* Cabecera y Título */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
              Estado de Situación Financiera (Balance General)
            </Typography>
            <Typography color="text.secondary">
              Estructura patrimonial a una fecha de corte: Activo = Pasivo + Patrimonio.
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

        {/* Filtro de Fecha de Corte */}
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <TextField
                label="Fecha de Corte"
                type="date"
                size="small"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
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
              <Button size="small" variant="text" onClick={() => handleShortcut('last_month_end')}>
                Fin Mes Anterior
              </Button>
              <Button size="small" variant="text" onClick={() => handleShortcut('last_year_end')}>
                Cierre Año Anterior
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
            Ocurrió un error al cargar el Balance General. Por favor intenta de nuevo.
          </Alert>
        )}

        {data && (
          <>
            {/* Banner de Verificación de Ecuación Contable */}
            {data.isBalanced ? (
              <Alert severity="success" sx={{ fontSize: '0.95rem', fontWeight: 600 }}>
                Ecuación Contable Cuadrada: Total Activo ({formatMoney(data.assets.totalAssets)}) = Total Pasivo + Patrimonio ({formatMoney(data.totalLiabilitiesAndEquity)}) | Diferencia: $0.00
              </Alert>
            ) : (
              <Alert severity="error" sx={{ fontSize: '0.95rem', fontWeight: 600 }}>
                ¡Atención! Desbalance Contable Detectado: Total Activo ({formatMoney(data.assets.totalAssets)}) ≠ Total Pasivo + Patrimonio ({formatMoney(data.totalLiabilitiesAndEquity)}) | Diferencia: {formatMoney(data.difference)}
              </Alert>
            )}

            {/* Tarjetas KPI de Resumen */}
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                      Total Activos
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, mt: 1, color: 'primary.main' }}>
                      {formatMoney(data.assets.totalAssets)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Corrientes: {formatMoney(data.assets.current.total)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                      Total Pasivos
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, mt: 1, color: 'warning.main' }}>
                      {formatMoney(data.liabilities.totalLiabilities)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Corrientes: {formatMoney(data.liabilities.current.total)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                      Total Patrimonio
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, mt: 1, color: 'info.main' }}>
                      {formatMoney(data.equity.totalEquity)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Resultado Ejercicio: {formatMoney(data.equity.currentPeriodResult)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card variant="outlined" sx={{ bgcolor: data.isBalanced ? 'success.50' : 'error.50' }}>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                      Pasivo + Patrimonio
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, mt: 1, color: data.isBalanced ? 'success.dark' : 'error.dark' }}>
                      {formatMoney(data.totalLiabilitiesAndEquity)}
                    </Typography>
                    <Typography variant="caption" color={data.isBalanced ? 'success.dark' : 'error.dark'} sx={{ fontWeight: 600 }}>
                      {data.isBalanced ? 'Cuadrado (100%)' : `Diferencia: ${formatMoney(data.difference)}`}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Columnas Divididas: Activo vs Pasivo & Patrimonio */}
            <Grid container spacing={3}>
              {/* Columna Izquierda: ACTIVOS */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main', mb: 2 }}>
                    1. ACTIVOS
                  </Typography>

                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.dark', mb: 1 }}>
                    1.1 ACTIVO CORRIENTE
                  </Typography>
                  <CategoryGroupTable group={data.assets.current.cashAndBanks} />
                  <CategoryGroupTable group={data.assets.current.receivables} />
                  <CategoryGroupTable group={data.assets.current.inventory} />
                  <CategoryGroupTable group={data.assets.current.otherCurrent} />

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1, bgcolor: 'grey.100', borderRadius: 1, mb: 3 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Total Activo Corriente
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {formatMoney(data.assets.current.total)}
                    </Typography>
                  </Box>

                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.dark', mb: 1 }}>
                    1.2 ACTIVO NO CORRIENTE
                  </Typography>
                  <CategoryGroupTable group={data.assets.nonCurrent.propertyPlantEquipment} />
                  <CategoryGroupTable group={data.assets.nonCurrent.otherNonCurrent} />

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1, bgcolor: 'grey.100', borderRadius: 1, mb: 3 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Total Activo No Corriente
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {formatMoney(data.assets.nonCurrent.total)}
                    </Typography>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5, bgcolor: 'primary.50', borderRadius: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'primary.dark' }}>
                      TOTAL ACTIVOS
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.dark' }}>
                      {formatMoney(data.assets.totalAssets)}
                    </Typography>
                  </Box>
                </Paper>
              </Grid>

              {/* Columna Derecha: PASIVOS Y PATRIMONIO */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                  {/* Pasivos */}
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.dark', mb: 2 }}>
                    2. PASIVOS
                  </Typography>

                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'warning.dark', mb: 1 }}>
                    2.1 PASIVO CORRIENTE
                  </Typography>
                  <CategoryGroupTable group={data.liabilities.current.suppliers} />
                  <CategoryGroupTable group={data.liabilities.current.taxes} />
                  <CategoryGroupTable group={data.liabilities.current.otherPayables} />

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1, bgcolor: 'grey.100', borderRadius: 1, mb: 3 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Total Pasivo Corriente
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {formatMoney(data.liabilities.current.total)}
                    </Typography>
                  </Box>

                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'warning.dark', mb: 1 }}>
                    2.2 PASIVO NO CORRIENTE
                  </Typography>
                  <CategoryGroupTable group={data.liabilities.nonCurrent.longTermPayables} />

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1, bgcolor: 'grey.100', borderRadius: 1, mb: 3 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Total Pasivo No Corriente
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {formatMoney(data.liabilities.nonCurrent.total)}
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5, bgcolor: 'warning.50', borderRadius: 1, mb: 3 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'warning.dark' }}>
                      TOTAL PASIVOS
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'warning.dark' }}>
                      {formatMoney(data.liabilities.totalLiabilities)}
                    </Typography>
                  </Box>

                  {/* Patrimonio */}
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'info.dark', mb: 2 }}>
                    3. PATRIMONIO
                  </Typography>

                  <CategoryGroupTable group={data.equity.capital} />
                  <CategoryGroupTable group={data.equity.retainedEarnings} />

                  {/* Resultado del Ejercicio Actual */}
                  <TableContainer component={Paper} variant="outlined" sx={{ mb: 1.5 }}>
                    <Table size="small">
                      <TableBody>
                        <TableRow sx={{ bgcolor: 'info.50' }}>
                          <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, width: 90, py: 0.5 }}>
                            3605
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, color: 'info.dark', py: 0.5 }}>
                            Resultado del Ejercicio (Ganancia / Pérdida del Periodo)
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, color: 'info.dark', width: 130, py: 0.5 }}>
                            {formatMoney(data.equity.currentPeriodResult)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1, bgcolor: 'grey.100', borderRadius: 1, mb: 3 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Total Patrimonio
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {formatMoney(data.equity.totalEquity)}
                    </Typography>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  {/* Total Pasivo + Patrimonio */}
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      p: 1.5,
                      bgcolor: data.isBalanced ? 'success.50' : 'error.50',
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, color: data.isBalanced ? 'success.dark' : 'error.dark' }}>
                      TOTAL PASIVO Y PATRIMONIO
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: data.isBalanced ? 'success.dark' : 'error.dark' }}>
                      {formatMoney(data.totalLiabilitiesAndEquity)}
                    </Typography>
                  </Box>
                </Paper>
              </Grid>
            </Grid>
          </>
        )}
      </Stack>
    </Container>
  );
};

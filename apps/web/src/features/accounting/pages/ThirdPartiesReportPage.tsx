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
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PeopleIcon from '@mui/icons-material/People';
import { useQuery } from '@tanstack/react-query';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { usePermissions } from '../../auth/hooks/usePermissions';
import {
  fetchThirdPartyReport,
  exportThirdPartyReportExcel,
  type ThirdPartyRowDto,
} from '../api/accounting.api';

function formatMoney(value: string | number): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return '$0.00';
  return `$${num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const roleLabels: Record<string, { label: string; color: 'primary' | 'secondary' | 'info' | 'default' }> = {
  CUSTOMER: { label: 'Cliente', color: 'primary' },
  SUPPLIER: { label: 'Proveedor', color: 'secondary' },
  BENEFICIARY: { label: 'Beneficiario', color: 'info' },
  OTHER: { label: 'Otro / General', color: 'default' },
};

export const ThirdPartiesReportPage = () => {
  const { hasPermission } = usePermissions();

  const now = new Date();
  const firstDayOfYear = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [fromDate, setFromDate] = useState(firstDayOfYear);
  const [toDate, setToDate] = useState(today);
  const [search, setSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['third-parties-report', fromDate, toDate, search],
    queryFn: () => fetchThirdPartyReport({ fromDate, toDate, search }),
    enabled: Boolean(fromDate && toDate),
  });

  const handleExport = async () => {
    try {
      setIsExporting(true);
      await exportThirdPartyReportExcel({ fromDate, toDate, search });
    } catch (e) {
      console.error('Error al exportar reporte de terceros:', e);
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
        {/* Cabecera */}
        <Box>
          <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
            Auxiliar de Terceros / Medios Magnéticos
          </Typography>
          <Typography color="text.secondary">
            Consolidado contable de movimientos y saldos discriminados por Cédula / NIT (Información Exógena DIAN).
          </Typography>
        </Box>

        {/* Filtros */}
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
            <TextField
              label="Buscar por NIT o Nombre"
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ej: 900123456 o Distribuidora..."
              sx={{ minWidth: 260 }}
            />
            <TextField
              label="Fecha Desde"
              type="date"
              size="small"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 170 }}
            />
            <TextField
              label="Fecha Hasta"
              type="date"
              size="small"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 170 }}
            />
            <Box sx={{ flexGrow: 1 }} />
            <Button
              variant="contained"
              color="success"
              startIcon={isExporting ? <CircularProgress size={20} color="inherit" /> : <FileDownloadIcon />}
              onClick={handleExport}
              disabled={isExporting || isLoading || !data || data.rows.length === 0}
            >
              Exportar a Excel (.xlsx)
            </Button>
          </Stack>
        </Paper>

        {/* Tarjetas de Resumen */}
        {data && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
              gap: 2,
            }}
          >
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                  Terceros Registrados
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PeopleIcon color="primary" /> {data.rows.length}
                </Typography>
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                  Total Débitos del Período
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: 'info.main' }}>
                  {formatMoney(data.totalDebit)}
                </Typography>
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                  Total Créditos del Período
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: 'success.main' }}>
                  {formatMoney(data.totalCredit)}
                </Typography>
              </CardContent>
            </Card>
          </Box>
        )}

        {/* Tabla */}
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {isError && (
          <Alert severity="error">
            Error al consultar el reporte de terceros.{' '}
            <Button onClick={() => void refetch()}>Reintentar</Button>
          </Alert>
        )}

        {data && (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Documento / NIT</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Tercero / Razón Social</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Tipo</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Saldo Anterior</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Débitos Período</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Créditos Período</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Saldo Final</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        No se encontraron movimientos contables por terceros en el período seleccionado.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.rows.map((row: ThirdPartyRowDto) => {
                    const roleCfg = roleLabels[row.role] || roleLabels.OTHER;
                    return (
                      <TableRow key={`${row.documentNumber}_${row.name}`} hover>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          {row.documentNumber}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 500 }}>{row.name}</TableCell>
                        <TableCell>
                          <Chip label={roleCfg.label} color={roleCfg.color} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell align="right">{formatMoney(row.initialBalance)}</TableCell>
                        <TableCell align="right" sx={{ color: 'info.main', fontWeight: 600 }}>
                          {formatMoney(row.totalDebit)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: 'success.main', fontWeight: 600 }}>
                          {formatMoney(row.totalCredit)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {formatMoney(row.finalBalance)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
                {data.rows.length > 0 && (
                  <TableRow sx={{ bgcolor: 'action.selected', '& td': { fontWeight: 700 } }}>
                    <TableCell colSpan={4}>TOTALES CONSOLIDADOS</TableCell>
                    <TableCell align="right" sx={{ color: 'info.main' }}>
                      {formatMoney(data.totalDebit)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'success.main' }}>
                      {formatMoney(data.totalCredit)}
                    </TableCell>
                    <TableCell align="right">-</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>
    </Container>
  );
};

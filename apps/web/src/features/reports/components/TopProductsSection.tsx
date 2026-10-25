import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  CircularProgress,
  MenuItem,
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
import type { TopProductsSortBy } from '@farmacia/contracts';
import { QuickDateRange } from '../../../components/QuickDateRange';
import { downloadReportCsv, fetchTopProductsReport } from '../api/reports.api';

const currency = (value: number) =>
  `$ ${value.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function TopProductsSection() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortBy, setSortBy] = useState<TopProductsSortBy>('units');
  const [limit, setLimit] = useState('20');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const validLimit = /^\d+$/.test(limit) && Number(limit) >= 1 && Number(limit) <= 100;
  const validDates = !fromDate || !toDate || fromDate <= toDate;
  const valid = validLimit && validDates;
  const filter = {
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    sortBy,
    limit: Number(limit),
  };
  const query = useQuery({
    queryKey: ['reports', 'top-products', filter],
    queryFn: () => fetchTopProductsReport(filter),
    enabled: valid,
  });

  async function exportCsv() {
    setExporting(true);
    setExportError(false);
    try {
      await downloadReportCsv('top-products', filter);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h6" component="h2">
        Productos más vendidos
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <TextField
            label="Desde"
            type="date"
            size="small"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Hasta"
            type="date"
            size="small"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            select
            label="Ordenar por"
            size="small"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as TopProductsSortBy)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="units">Unidades</MenuItem>
            <MenuItem value="value">Valor</MenuItem>
          </TextField>
          <TextField
            label="Límite"
            type="number"
            size="small"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            error={!validLimit}
            helperText={!validLimit ? 'Entre 1 y 100, sin decimales' : undefined}
            slotProps={{ htmlInput: { min: 1, max: 100, step: 1 } }}
            sx={{ width: 160 }}
          />
          <Button
            onClick={() => {
              setFromDate('');
              setToDate('');
            }}
          >
            Limpiar fechas
          </Button>
        </Stack>
        <QuickDateRange
          onSelect={({ from, to }) => {
            setFromDate(from);
            setToDate(to);
          }}
        />
      </Paper>
      {!validDates && (
        <Alert severity="warning">La fecha inicial debe ser anterior o igual a la final.</Alert>
      )}
      <Button
        variant="contained"
        onClick={() => void exportCsv()}
        disabled={!valid || exporting}
        sx={{ alignSelf: 'flex-start' }}
      >
        {' '}
        {exporting ? 'Exportando…' : 'Exportar productos más vendidos a CSV'}
      </Button>
      {exportError && (
        <Alert severity="error">
          No fue posible exportar los productos más vendidos. Intenta nuevamente.
        </Alert>
      )}
      {valid &&
        (query.isError ? (
          <Alert
            severity="error"
            action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
          >
            No fue posible cargar los productos más vendidos.
          </Alert>
        ) : query.isPending ? (
          <Stack direction="row" spacing={2} role="status">
            <CircularProgress size={24} />
            <Typography>Cargando productos más vendidos…</Typography>
          </Stack>
        ) : !query.data.items.length ? (
          <Paper variant="outlined" sx={{ p: 4 }}>
            <Typography>Sin ventas en el período</Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Productos más vendidos">
              <TableHead>
                <TableRow>
                  {[
                    'Posición',
                    'Código',
                    'Producto',
                    'Unidades vendidas',
                    'Unidades devueltas',
                    'Unidades netas',
                    'Valor vendido',
                    'Valor devuelto',
                    'Valor neto',
                    'Número de ventas',
                  ].map((label, i) => (
                    <TableCell key={label} align={i >= 3 ? 'right' : 'left'}>
                      {label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((row) => (
                  <TableRow key={row.productId}>
                    <TableCell>{row.rank}</TableCell>
                    <TableCell>{row.productCode}</TableCell>
                    <TableCell>{row.productName}</TableCell>
                    <TableCell align="right">
                      {row.soldBaseUnits} {row.baseUnit}
                    </TableCell>
                    <TableCell align="right">
                      {row.returnedBaseUnits} {row.baseUnit}
                    </TableCell>
                    <TableCell align="right">
                      {row.netBaseUnits} {row.baseUnit}
                    </TableCell>
                    <TableCell align="right">{currency(row.soldValue)}</TableCell>
                    <TableCell align="right">{currency(row.returnedValue)}</TableCell>
                    <TableCell align="right">{currency(row.netValue)}</TableCell>
                    <TableCell align="right">{row.salesCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ))}
    </Stack>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  TablePagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
} from '@mui/material';
import type {
  CashMovementDto,
  CashBalanceDto,
  CashMovementType,
} from '@farmacia/contracts';
import { fetchCashBalance, fetchCashMovements } from '../api/cash.api';
import { CreateCashMovementDialog } from '../components/CreateCashMovementDialog';
import { PermissionGate } from '../../auth/components/PermissionGate';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { SweetModal } from '../../../components/SweetModal';

export const CashPage: React.FC = () => {
  const [balance, setBalance] = useState<CashBalanceDto>({
    currentBalance: 0,
    totalIncomeToday: 0,
    totalExpenseToday: 0,
    movementsCountToday: 0,
    lastMovementAt: null,
  });

  const [movements, setMovements] = useState<CashMovementDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15);

  const [selectedType, setSelectedType] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);

  // Notificación flotante (Snackbar)
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const [balanceRes, movementsRes] = await Promise.all([
        fetchCashBalance(),
        fetchCashMovements({
          movementType: selectedType ? (selectedType as CashMovementType) : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          page: page + 1,
          limit: pageSize,
        }),
      ]);

      setBalance(balanceRes);
      setMovements(movementsRes.items);
      setTotal(movementsRes.total);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cargar los datos de caja');
    } finally {
      setLoading(false);
    }
  }, [selectedType, startDate, endDate, page, pageSize]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCurrency = (val: number) => {
    return `$${val.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString('es-CO')} ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getMovementTypeChip = (type: CashMovementType) => {
    switch (type) {
      case 'INGRESO_VENTA':
        return <Chip label="Venta POS" color="success" size="small" variant="filled" />;
      case 'INGRESO_MANUAL':
        return <Chip label="Ingreso Manual" color="success" size="small" variant="outlined" />;
      case 'EGRESO_MANUAL':
        return <Chip label="Egreso Manual" color="error" size="small" variant="outlined" />;
      case 'EGRESO_PAGO_PROVEEDOR':
        return <Chip label="Pago Proveedor" color="error" size="small" variant="filled" />;
      default:
        return <Chip label={type} size="small" />;
    }
  };

  const isIncome = (type: CashMovementType) => {
    return type === 'INGRESO_VENTA' || type === 'INGRESO_MANUAL';
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Encabezado */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <HomeBackButton />
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700, color: 'text.primary' }}>
              Control de Caja y Movimientos
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Trazabilidad continua y arqueo de entradas y salidas de efectivo en tiempo real.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={loadData}
            disabled={loading}
          >
            Actualizar
          </Button>

          <PermissionGate permission="cash:movements">
            <Button
              variant="contained"
              color="primary"
              onClick={() => setDialogOpen(true)}
              sx={{ fontWeight: 600 }}
            >
              + Registrar Movimiento
            </Button>
          </PermissionGate>
        </Box>
      </Box>

      {errorMsg && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorMsg}
        </Alert>
      )}

      {/* Tarjetas KPI Superiores */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2.5, mb: 4 }}>
        <Card sx={{ bgcolor: 'primary.dark', color: 'primary.contrastText', borderRadius: 2, boxShadow: 2 }}>
          <CardContent>
            <Typography variant="overline" sx={{ opacity: 0.85, fontWeight: 600 }}>
              Saldo Actual en Caja
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
              {formatCurrency(balance.currentBalance)}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.75, display: 'block', mt: 0.5 }}>
              Efectivo disponible en caja física
            </Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: 2, bgcolor: 'background.paper' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
                Ingresos de Hoy
              </Typography>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main', mt: 0.5 }}>
              {`+${formatCurrency(balance.totalIncomeToday)}`}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Total recaudado hoy
            </Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: 2, bgcolor: 'background.paper' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
                Egresos de Hoy
              </Typography>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'error.main' }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'error.main', mt: 0.5 }}>
              {`-${formatCurrency(balance.totalExpenseToday)}`}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Total egresado hoy
            </Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: 2, bgcolor: 'background.paper' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
                Operaciones de Hoy
              </Typography>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'info.main' }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mt: 0.5 }}>
              {balance.movementsCountToday}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Movimientos registrados hoy
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Barra de Filtros */}
      <Card sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="filter-type-label">Tipo de Movimiento</InputLabel>
            <Select
              labelId="filter-type-label"
              value={selectedType}
              label="Tipo de Movimiento"
              onChange={(e) => {
                setSelectedType(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">Todos los tipos</MenuItem>
              <MenuItem value="INGRESO_VENTA">Venta POS (Ingreso)</MenuItem>
              <MenuItem value="INGRESO_MANUAL">Ingreso Manual</MenuItem>
              <MenuItem value="EGRESO_MANUAL">Egreso Manual</MenuItem>
              <MenuItem value="EGRESO_PAGO_PROVEEDOR">Pago a Proveedor (Egreso)</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Desde"
            type="date"
            size="small"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(0);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 160 }}
          />

          <TextField
            label="Hasta"
            type="date"
            size="small"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(0);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 160 }}
          />

          {(selectedType || startDate || endDate) && (
            <Button
              variant="text"
              size="small"
              onClick={() => {
                setSelectedType('');
                setStartDate('');
                setEndDate('');
                setPage(0);
              }}
            >
              Limpiar Filtros
            </Button>
          )}
        </Box>
      </Card>

      {/* Tabla de Movimientos */}
      <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 1 }}>
        <Table aria-label="tabla de movimientos de caja">
          <TableHead sx={{ bgcolor: 'action.hover' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Fecha / Hora</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Tipo</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Motivo / Justificación</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Medio de Pago</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Usuario</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>Monto</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>Saldo Resultante</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={36} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                    Cargando movimientos de caja...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : movements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <Typography variant="body1" color="text.secondary">
                    No se encontraron movimientos de caja registrados con los filtros seleccionados.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              movements.map((mov) => {
                const income = isIncome(mov.movementType);
                return (
                  <TableRow key={mov.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {formatDateTime(mov.createdAt)}
                    </TableCell>
                    <TableCell>
                      {getMovementTypeChip(mov.movementType)}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 300 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {mov.reason}
                      </Typography>
                      {mov.referenceDocumentId && (
                        <Typography variant="caption" color="text.secondary">
                          Ref: {mov.referenceDocumentType || 'DOC'} #{mov.referenceDocumentId}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip label={mov.paymentMethod} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      {mov.createdByUsername || 'Sistema'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: income ? 'success.main' : 'error.main' }}>
                      {`${income ? '+' : '-'}${formatCurrency(mov.amount)}`}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatCurrency(mov.balanceAfter)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[10, 15, 25, 50]}
          component="div"
          count={total}
          rowsPerPage={pageSize}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setPageSize(parseInt(e.target.value, 10));
            setPage(0);
          }}
          labelRowsPerPage="Filas por página:"
        />
      </TableContainer>

      {/* Diálogo de Registro de Movimiento */}
      <CreateCashMovementDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={(isIncome, amount) => {
          setPage(0);
          loadData();
          setSnackbar({
            open: true,
            message: `${isIncome ? 'Ingreso' : 'Egreso'} de caja registrado con éxito por $${amount.toLocaleString('es-CO')}.`,
            severity: 'success',
          });
        }}
        currentBalance={balance.currentBalance}
      />

      {/* Notificación modal estilo SweetAlert2 */}
      <SweetModal
        open={snackbar.open}
        type={snackbar.severity === 'error' ? 'error' : snackbar.severity === 'warning' ? 'warning' : 'success'}
        title={snackbar.severity === 'error' ? '¡Error!' : '¡Buen trabajo!'}
        text={snackbar.message}
        confirmText="OK"
        onConfirm={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
};

import { ExpenseFormDialog } from '../components/ExpenseFormDialog';
import { ExpensePaymentDialog } from '../components/ExpensePaymentDialog';
import { ExpenseReasonDialog } from '../components/ExpenseReasonDialog';
import type { ExpenseReasonFormData } from '../validation/expense-reason.schema';
import { toCents } from '../../../utils/money';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  TextField,
  MenuItem,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Pagination,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CategoryIcon from '@mui/icons-material/Category';
import PaymentIcon from '@mui/icons-material/Payment';
import BlockIcon from '@mui/icons-material/Block';
import VisibilityIcon from '@mui/icons-material/Visibility';
import UndoIcon from '@mui/icons-material/Undo';
import SearchIcon from '@mui/icons-material/Search';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import {
  ExpenseDto,
  ExpenseCategoryDto,
  ExpenseStatus,
  ExpensePaymentMethod,
  ExpensesSummaryDto,
  BankAccountDto,
} from '@farmacia/contracts';

import {
  fetchExpenses,
  fetchExpensesSummary,
  cancelExpense,
  reverseExpensePayment,
  fetchExpenseCategories,
  fetchActiveBankAccounts,
} from '../api/expenses.api';
import { ExpenseCategoriesModal } from '../components/ExpenseCategoriesModal';
import { localIsoDate } from '../../../components/QuickDateRange';

function formatCurrency(val: string | number | undefined): string {
  if (val === undefined || val === null) return '$0.00';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '$0.00';
  return `$${num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const ExpensesPage: React.FC = () => {
  // Filtros
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  // Datos
  const [expenses, setExpenses] = useState<ExpenseDto[]>([]);
  const [summary, setSummary] = useState<ExpensesSummaryDto | null>(null);
  const [categories, setCategories] = useState<ExpenseCategoryDto[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountDto[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modales
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [reversePaymentModalOpen, setReversePaymentModalOpen] = useState(false);

  // Registro activo para modales
  const [selectedExpense, setSelectedExpense] = useState<ExpenseDto | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

  // Carga de categorías y bancos auxiliares
  const loadAuxData = useCallback(async () => {
    try {
      const [cats, banks] = await Promise.all([
        fetchExpenseCategories(),
        fetchActiveBankAccounts(),
      ]);
      setCategories(cats);
      setBankAccounts(banks);
    } catch (err: any) {
      console.error('Error al cargar datos auxiliares:', err);
    }
  }, []);

  // Carga principal de lista y KPIs
  const loadExpenses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        categoryId: categoryId || undefined,
        status: (status as ExpenseStatus) || undefined,
        paymentMethod: (paymentMethod as ExpensePaymentMethod) || undefined,
        search: searchTerm.trim() || undefined,
        page,
        limit: 15,
      };

      const [resList, resSummary] = await Promise.all([
        fetchExpenses(filters),
        fetchExpensesSummary(filters),
      ]);

      setExpenses(resList.items);
      setTotalPages(resList.totalPages);
      setSummary(resSummary);
    } catch (err: any) {
      setError(err?.message || 'Error al consultar gastos.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, categoryId, status, paymentMethod, searchTerm, page]);

  useEffect(() => {
    loadAuxData();
  }, [loadAuxData]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Acciones de presets de fechas
  const setTodayPreset = () => {
    const today = localIsoDate(new Date());
    setStartDate(today);
    setEndDate(today);
    setPage(1);
  };

  const setMonthPreset = () => {
    const now = new Date();
    const firstDay = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const lastDay = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    setStartDate(firstDay);
    setEndDate(lastDay);
    setPage(1);
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setCategoryId('');
    setStatus('');
    setPaymentMethod('');
    setSearchTerm('');
    setPage(1);
  };

  const handleOpenCreate = () => {
    setCreateModalOpen(true);
    setError(null);
  };
  const handleOpenPay = (exp: ExpenseDto) => {
    setSelectedExpense(exp);
    setPayModalOpen(true);
    setError(null);
  };

  // Manejo de Anulación de Gasto
  const handleOpenCancel = (exp: ExpenseDto) => {
    setSelectedExpense(exp);
    setCancelModalOpen(true);
    setError(null);
  };

  const handleCancelSubmit = async ({ reason }: ExpenseReasonFormData) => {
    if (!selectedExpense) return;

    setError(null);
    try {
      await cancelExpense(selectedExpense.id, {
        cancellationReason: reason.trim(),
      });
      setSuccess('Gasto anulado exitosamente con reversión contable y reintegro a tesorería.');
      setCancelModalOpen(false);
      await loadExpenses();
    } catch (err: any) {
      throw new Error(err?.message || 'Error al anular el gasto.');
    }
  };

  // Manejo de Reversión de Pago de Gasto
  const handleOpenReversePayment = (paymentId: string) => {
    setSelectedPaymentId(paymentId);
    setReversePaymentModalOpen(true);
    setError(null);
  };

  const handleReversePaymentSubmit = async ({ reason }: ExpenseReasonFormData) => {
    if (!selectedPaymentId) return;

    setError(null);
    try {
      const updated = await reverseExpensePayment(selectedPaymentId, {
        reversalReason: reason.trim(),
      });
      setSuccess('Pago revertido exitosamente.');
      setSelectedExpense(updated);
      setReversePaymentModalOpen(false);
      await loadExpenses();
    } catch (err: any) {
      throw new Error(err?.message || 'Error al revertir el pago.');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
            Causación de Gastos
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Causación, control presupuestal, registro de desembolsos y contabilidad automática
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<CategoryIcon />}
            onClick={() => setCategoriesModalOpen(true)}
          >
            Categorías
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
          >
            Causar Gasto
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card elevation={1}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <ReceiptLongIcon color="primary" sx={{ fontSize: 38 }} />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                  TOTAL GASTOS (PERIODO)
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                  {formatCurrency(summary?.totalAmount)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card elevation={1}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <CheckCircleIcon color="success" sx={{ fontSize: 38 }} />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                  PAGADOS (CONTADO / ABONOS)
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                  {formatCurrency(summary?.totalPaid)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card elevation={1}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <HourglassEmptyIcon color="warning" sx={{ fontSize: 38 }} />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                  PENDIENTES POR PAGAR
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'warning.main' }}>
                  {formatCurrency(summary?.totalPending)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card elevation={1}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <AttachMoneyIcon color="info" sx={{ fontSize: 38 }} />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                  COMPROBANTES
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                  {summary?.count || 0}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Barra de Filtros */}
      <Card elevation={1} sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2} sx={{ alignItems: 'center' }}>
          <Grid size={{ xs: 12, sm: 6, md: 2.5 }}>
            <TextField
              label="Desde"
              type="date"
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2.5 }}>
            <TextField
              label="Hasta"
              type="date"
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2.5 }}>
            <TextField
              select
              label="Categoría"
              size="small"
              fullWidth
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
            >
              <MenuItem value="">Todas las Categorías</MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <TextField
              select
              label="Estado"
              size="small"
              fullWidth
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <MenuItem value="">Todos los Estados</MenuItem>
              <MenuItem value="PAGADO">Pagado</MenuItem>
              <MenuItem value="PENDIENTE">Pendiente</MenuItem>
              <MenuItem value="ANULADO">Anulado</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2.5 }}>
            <TextField
              select
              label="Forma de Pago"
              size="small"
              fullWidth
              value={paymentMethod}
              onChange={(e) => {
                setPaymentMethod(e.target.value);
                setPage(1);
              }}
            >
              <MenuItem value="">Todos los Medios</MenuItem>
              <MenuItem value="EFECTIVO">Efectivo</MenuItem>
              <MenuItem value="TRANSFERENCIA">Transferencia / Banco</MenuItem>
              <MenuItem value="CREDITO">Crédito</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Buscar por Beneficiario, Documento o Concepto"
              size="small"
              fullWidth
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Grid>
          <Grid
            size={{ xs: 12, md: 8 }}
            sx={{ display: 'flex', gap: 1, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}
          >
            <Button size="small" variant="outlined" onClick={setTodayPreset}>
              Hoy
            </Button>
            <Button size="small" variant="outlined" onClick={setMonthPreset}>
              Este Mes
            </Button>
            <Button size="small" color="inherit" onClick={clearFilters}>
              Limpiar Filtros
            </Button>
          </Grid>
        </Grid>
      </Card>

      {/* Tabla de Gastos */}
      <Card elevation={1}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: 'action.hover' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>Fecha</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Categoría</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Beneficiario</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Concepto & Comprobante</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Medio de Pago</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>Estado</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>Total ($)</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>
                Saldo Pendiente ($)
              </TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} sx={{ textAlign: 'center', py: 4 }}>
                  <CircularProgress size={32} />
                </TableCell>
              </TableRow>
            ) : expenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} sx={{ textAlign: 'center', py: 4 }}>
                  No se encontraron registros de gastos con los filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              expenses.map((e) => {
                const isPaid = e.status === 'PAGADO';
                const isPending = e.status === 'PENDIENTE';
                const isCancelled = e.status === 'ANULADO';

                return (
                  <TableRow
                    key={e.id}
                    hover
                    sx={isCancelled ? { opacity: 0.6, backgroundColor: 'action.hover' } : {}}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{e.expenseDate}</TableCell>
                    <TableCell>
                      <Chip label={e.categoryName} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{e.beneficiary}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{e.description}</Typography>
                      {e.documentNumber && (
                        <Typography variant="caption" color="text.secondary">
                          Doc: {e.documentNumber}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{e.paymentMethod}</Typography>
                      {e.bankAccountName && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block' }}
                        >
                          {e.bankAccountName}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      <Chip
                        label={e.status}
                        color={isPaid ? 'success' : isPending ? 'warning' : 'error'}
                        size="small"
                      />
                      {isPending && e.dueDate && (
                        <Typography
                          variant="caption"
                          sx={{ color: 'warning.main', display: 'block' }}
                        >
                          Vence: {e.dueDate}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right', fontWeight: 'bold' }}>
                      {formatCurrency(e.amount)}
                    </TableCell>
                    <TableCell
                      sx={{
                        textAlign: 'right',
                        fontWeight: 'bold',
                        color: isPending ? 'warning.main' : 'text.secondary',
                      }}
                    >
                      {formatCurrency(e.balance)}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      <Tooltip title="Ver Detalle / Historial">
                        <IconButton
                          aria-label="Ver detalle del gasto"
                          size="small"
                          color="primary"
                          onClick={() => {
                            setSelectedExpense(e);
                            setDetailModalOpen(true);
                          }}
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {isPending && (
                        <Tooltip title="Pagar / Abonar">
                          <IconButton
                            aria-label="Pagar gasto"
                            size="small"
                            color="success"
                            onClick={() => handleOpenPay(e)}
                          >
                            <PaymentIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {!isCancelled && (
                        <Tooltip title="Anular Gasto">
                          <IconButton
                            aria-label="Anular gasto"
                            size="small"
                            color="error"
                            onClick={() => handleOpenCancel(e)}
                          >
                            <BlockIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_, p) => setPage(p)}
              color="primary"
              size="small"
            />
          </Box>
        )}
      </Card>

      {createModalOpen && (
        <ExpenseFormDialog
          categories={categories}
          bankAccounts={bankAccounts}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={async () => {
            setSuccess('Gasto registrado exitosamente con partida doble y tesorería.');
            setCreateModalOpen(false);
            await loadExpenses();
          }}
        />
      )}
      {payModalOpen && selectedExpense && (
        <ExpensePaymentDialog
          expense={selectedExpense}
          bankAccounts={bankAccounts}
          onClose={() => setPayModalOpen(false)}
          onSuccess={async () => {
            setSuccess('Pago de gasto registrado exitosamente.');
            setPayModalOpen(false);
            await loadExpenses();
          }}
        />
      )}

      {/* Modal Detalle de Gasto */}
      <Dialog
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 'bold' }}>Detalle de Gasto e Historial de Pagos</DialogTitle>
        <DialogContent dividers>
          {selectedExpense && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Fecha del Gasto
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                    {selectedExpense.expenseDate}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Categoría
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                    {selectedExpense.categoryName}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Cuenta Contable PUC
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                    {selectedExpense.accountCode} - {selectedExpense.accountName}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Beneficiario
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                    {selectedExpense.beneficiary}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Comprobante
                  </Typography>
                  <Typography variant="body1">{selectedExpense.documentNumber || '—'}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Total
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                    {formatCurrency(selectedExpense.amount)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Saldo Pendiente
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{
                      fontWeight: 'bold',
                      color: toCents(selectedExpense.balance) > 0 ? 'warning.main' : 'text.primary',
                    }}
                  >
                    {formatCurrency(selectedExpense.balance)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Registrado Por
                  </Typography>
                  <Typography variant="body2">{selectedExpense.createdByName || '—'}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Estado
                  </Typography>
                  <Box>
                    <Chip
                      label={selectedExpense.status}
                      color={
                        selectedExpense.status === 'PAGADO'
                          ? 'success'
                          : selectedExpense.status === 'PENDIENTE'
                            ? 'warning'
                            : 'error'
                      }
                      size="small"
                    />
                  </Box>
                </Grid>
              </Grid>

              {selectedExpense.cancellationReason && (
                <Alert severity="error">
                  <strong>Anulado por {selectedExpense.cancelledByName}:</strong>{' '}
                  {selectedExpense.cancellationReason}
                </Alert>
              )}

              {/* Historial de Pagos / Abonos */}
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Historial de Pagos y Abonos
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>Fecha</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Medio</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Cuenta / Origen</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>
                        Valor Pagado
                      </TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Registrado Por</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>Estado</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>Acción</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedExpense.payments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} sx={{ textAlign: 'center', py: 2 }}>
                          No hay pagos o abonos registrados para este gasto.
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectedExpense.payments.map((p) => (
                        <TableRow key={p.id} hover sx={p.isReversed ? { opacity: 0.5 } : {}}>
                          <TableCell>{p.paymentDate}</TableCell>
                          <TableCell>{p.paymentMethod}</TableCell>
                          <TableCell>{p.bankAccountName || 'Caja General'}</TableCell>
                          <TableCell sx={{ textAlign: 'right', fontWeight: 'bold' }}>
                            {formatCurrency(p.amount)}
                          </TableCell>
                          <TableCell>{p.createdByName || '—'}</TableCell>
                          <TableCell sx={{ textAlign: 'center' }}>
                            <Chip
                              label={p.isReversed ? 'Revertido' : 'Activo'}
                              size="small"
                              color={p.isReversed ? 'default' : 'success'}
                              variant={p.isReversed ? 'outlined' : 'filled'}
                            />
                            {p.reversalReason && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block' }}
                              >
                                {p.reversalReason}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ textAlign: 'right' }}>
                            {!p.isReversed && (
                              <Tooltip title="Revertir Pago">
                                <IconButton
                                  aria-label="Revertir pago"
                                  size="small"
                                  color="warning"
                                  onClick={() => handleOpenReversePayment(p.id)}
                                >
                                  <UndoIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailModalOpen(false)} variant="outlined">
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      {cancelModalOpen && (
        <ExpenseReasonDialog
          kind="cancel"
          onClose={() => setCancelModalOpen(false)}
          onSubmit={handleCancelSubmit}
        />
      )}
      {reversePaymentModalOpen && (
        <ExpenseReasonDialog
          kind="reverse"
          onClose={() => setReversePaymentModalOpen(false)}
          onSubmit={handleReversePaymentSubmit}
        />
      )}

      {/* Modal de Gestión de Categorías */}
      <ExpenseCategoriesModal
        open={categoriesModalOpen}
        onClose={() => setCategoriesModalOpen(false)}
        onCategoriesChanged={() => {
          loadAuxData();
          loadExpenses();
        }}
      />
    </Box>
  );
};

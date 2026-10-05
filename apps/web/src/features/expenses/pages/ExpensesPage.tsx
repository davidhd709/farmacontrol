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
  ThirdPartyDto,
} from '@farmacia/contracts';
import { ThirdPartyAutocomplete } from '../../third-parties/components/ThirdPartyAutocomplete';
import {
  fetchExpenses,
  fetchExpensesSummary,
  createExpense,
  payExpense,
  cancelExpense,
  reverseExpensePayment,
  fetchExpenseCategories,
  fetchActiveBankAccounts,
} from '../api/expenses.api';
import { ExpenseCategoriesModal } from '../components/ExpenseCategoriesModal';

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

  // Campos para crear gasto
  const [newCatId, setNewCatId] = useState('');
  const [newThirdParty, setNewThirdParty] = useState<ThirdPartyDto | null>(null);
  const [newBeneficiary, setNewBeneficiary] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDocumentNumber, setNewDocumentNumber] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newExpenseDate, setNewExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [newDueDate, setNewDueDate] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState<ExpensePaymentMethod>('EFECTIVO');
  const [newBankAccountId, setNewBankAccountId] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Campos para pagar gasto
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<'EFECTIVO' | 'TRANSFERENCIA'>('EFECTIVO');
  const [payBankAccountId, setPayBankAccountId] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Campos para cancelación / reversión
  const [reasonInput, setReasonInput] = useState('');

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
    const today = new Date().toISOString().slice(0, 10);
    setStartDate(today);
    setEndDate(today);
    setPage(1);
  };

  const setMonthPreset = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
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

  // Manejo de Creación de Gasto
  const handleOpenCreate = () => {
    setNewCatId(categories.length > 0 ? categories[0].id : '');
    setNewThirdParty(null);
    setNewBeneficiary('');
    setNewDescription('');
    setNewDocumentNumber('');
    setNewAmount('');
    setNewExpenseDate(new Date().toISOString().slice(0, 10));
    setNewDueDate('');
    setNewPaymentMethod('EFECTIVO');
    setNewBankAccountId(bankAccounts.length > 0 ? bankAccounts[0].id : '');
    setNewNotes('');
    setCreateModalOpen(true);
    setError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatId) {
      setError('Debe seleccionar una categoría de gasto.');
      return;
    }
    if (!newBeneficiary.trim() || !newDescription.trim()) {
      setError('El beneficiario y la descripción son obligatorios.');
      return;
    }
    if (!newAmount || parseFloat(newAmount) <= 0) {
      setError('El monto debe ser mayor a cero.');
      return;
    }
    if (newPaymentMethod === 'CREDITO' && !newDueDate) {
      setError('La fecha de vencimiento es obligatoria para gastos a crédito.');
      return;
    }
    if (newPaymentMethod === 'TRANSFERENCIA' && !newBankAccountId) {
      setError('Debe seleccionar una cuenta bancaria para pago por transferencia.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createExpense({
        categoryId: newCatId,
        beneficiary: newBeneficiary.trim(),
        description: newDescription.trim(),
        documentNumber: newDocumentNumber.trim() || undefined,
        amount: newAmount,
        expenseDate: newExpenseDate,
        dueDate: newPaymentMethod === 'CREDITO' ? newDueDate : undefined,
        paymentMethod: newPaymentMethod,
        bankAccountId: newPaymentMethod === 'TRANSFERENCIA' ? newBankAccountId : undefined,
        notes: newNotes.trim() || undefined,
      });
      setSuccess('Gasto registrado exitosamente con partida doble y tesorería.');
      setCreateModalOpen(false);
      await loadExpenses();
    } catch (err: any) {
      setError(err?.message || 'Error al registrar el gasto.');
    } finally {
      setSubmitting(false);
    }
  };

  // Manejo de Pago Posterior de Gasto
  const handleOpenPay = (exp: ExpenseDto) => {
    setSelectedExpense(exp);
    setPayAmount(exp.balance);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod('EFECTIVO');
    setPayBankAccountId(bankAccounts.length > 0 ? bankAccounts[0].id : '');
    setPayNotes('');
    setPayModalOpen(true);
    setError(null);
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpense) return;
    if (!payAmount || parseFloat(payAmount) <= 0) {
      setError('El monto a pagar debe ser mayor a cero.');
      return;
    }
    if (parseFloat(payAmount) > parseFloat(selectedExpense.balance)) {
      setError('El monto a pagar no puede superar el saldo pendiente.');
      return;
    }
    if (payMethod === 'TRANSFERENCIA' && !payBankAccountId) {
      setError('Debe seleccionar una cuenta bancaria para transferencia.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await payExpense(selectedExpense.id, {
        amount: payAmount,
        paymentDate: payDate,
        paymentMethod: payMethod,
        bankAccountId: payMethod === 'TRANSFERENCIA' ? payBankAccountId : undefined,
        notes: payNotes.trim() || undefined,
      });
      setSuccess('Pago de gasto registrado exitosamente.');
      setPayModalOpen(false);
      await loadExpenses();
    } catch (err: any) {
      setError(err?.message || 'Error al procesar el pago.');
    } finally {
      setSubmitting(false);
    }
  };

  // Manejo de Anulación de Gasto
  const handleOpenCancel = (exp: ExpenseDto) => {
    setSelectedExpense(exp);
    setReasonInput('');
    setCancelModalOpen(true);
    setError(null);
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpense) return;
    if (reasonInput.trim().length < 5) {
      setError('El motivo de anulación es obligatorio (mínimo 5 caracteres).');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await cancelExpense(selectedExpense.id, {
        cancellationReason: reasonInput.trim(),
      });
      setSuccess('Gasto anulado exitosamente con reversión contable y reintegro a tesorería.');
      setCancelModalOpen(false);
      await loadExpenses();
    } catch (err: any) {
      setError(err?.message || 'Error al anular el gasto.');
    } finally {
      setSubmitting(false);
    }
  };

  // Manejo de Reversión de Pago de Gasto
  const handleOpenReversePayment = (paymentId: string) => {
    setSelectedPaymentId(paymentId);
    setReasonInput('');
    setReversePaymentModalOpen(true);
    setError(null);
  };

  const handleReversePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPaymentId) return;
    if (reasonInput.trim().length < 5) {
      setError('El motivo de reversión es obligatorio (mínimo 5 caracteres).');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const updated = await reverseExpensePayment(selectedPaymentId, {
        reversalReason: reasonInput.trim(),
      });
      setSuccess('Pago revertido exitosamente.');
      setSelectedExpense(updated);
      setReversePaymentModalOpen(false);
      await loadExpenses();
    } catch (err: any) {
      setError(err?.message || 'Error al revertir el pago.');
    } finally {
      setSubmitting(false);
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
          <Grid size={{ xs: 12, md: 8 }} sx={{ display: 'flex', gap: 1, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
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
              <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>Saldo Pendiente ($)</TableCell>
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
                  <TableRow key={e.id} hover sx={isCancelled ? { opacity: 0.6, backgroundColor: 'action.hover' } : {}}>
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
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
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
                        <Typography variant="caption" sx={{ color: 'warning.main', display: 'block' }}>
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

      {/* Modal Registrar Nuevo Gasto */}
      <Dialog open={createModalOpen} onClose={() => setCreateModalOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleCreateSubmit}>
          <DialogTitle sx={{ fontWeight: 'bold' }}>Registrar Causación de Gasto</DialogTitle>
          <DialogContent dividers>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                select
                label="Categoría de Gasto"
                value={newCatId}
                onChange={(e) => setNewCatId(e.target.value)}
                required
                fullWidth
                size="small"
              >
                {categories.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name} ({c.accountCode} - {c.accountName})
                  </MenuItem>
                ))}
              </TextField>

              <ThirdPartyAutocomplete
                value={newThirdParty}
                onChange={(tp, raw) => {
                  setNewThirdParty(tp);
                  if (tp) {
                    setNewBeneficiary(tp.name);
                    if (tp.documentNumber && !newDocumentNumber) {
                      setNewDocumentNumber(tp.documentNumber);
                    }
                  } else if (raw !== undefined) {
                    setNewBeneficiary(raw);
                  }
                }}
                label="Beneficiario / Tercero / Proveedor"
                placeholder="Buscar en el directorio o escribir nombre..."
                required
                freeSolo
                showQuickCreate
              />

              <TextField
                label="Concepto / Descripción del Gasto"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                required
                fullWidth
                placeholder="Ej. Servicio de energía eléctrica mes de septiembre"
                size="small"
              />

              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Nº Factura / Documento Soporte"
                    value={newDocumentNumber}
                    onChange={(e) => setNewDocumentNumber(e.target.value)}
                    fullWidth
                    size="small"
                    placeholder="Ej. FAC-1029"
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Valor Total ($)"
                    type="number"
                    slotProps={{ htmlInput: { step: '0.01', min: '0.01' } }}
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    required
                    fullWidth
                    size="small"
                  />
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Fecha de Gasto"
                    type="date"
                    value={newExpenseDate}
                    onChange={(e) => setNewExpenseDate(e.target.value)}
                    required
                    fullWidth
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    select
                    label="Forma de Pago"
                    value={newPaymentMethod}
                    onChange={(e) => setNewPaymentMethod(e.target.value as ExpensePaymentMethod)}
                    required
                    fullWidth
                    size="small"
                  >
                    <MenuItem value="EFECTIVO">Efectivo (Caja General)</MenuItem>
                    <MenuItem value="TRANSFERENCIA">Transferencia (Cuenta Bancaria)</MenuItem>
                    <MenuItem value="CREDITO">A Crédito (Pendiente por Pagar)</MenuItem>
                  </TextField>
                </Grid>
              </Grid>

              {newPaymentMethod === 'TRANSFERENCIA' && (
                <TextField
                  select
                  label="Cuenta Bancaria de Origen"
                  value={newBankAccountId}
                  onChange={(e) => setNewBankAccountId(e.target.value)}
                  required
                  fullWidth
                  size="small"
                >
                  {bankAccounts.map((b) => (
                    <MenuItem key={b.id} value={b.id}>
                      {b.bankName} - {b.accountNumber} ({formatCurrency(b.currentBalance)})
                    </MenuItem>
                  ))}
                </TextField>
              )}

              {newPaymentMethod === 'CREDITO' && (
                <TextField
                  label="Fecha de Vencimiento de Pago"
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  required
                  fullWidth
                  size="small"
                  slotProps={{ inputLabel: { shrink: true } }}
                  helperText="Fecha límite para cancelar la obligación"
                />
              )}

              <TextField
                label="Notas / Observaciones"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                fullWidth
                multiline
                rows={2}
                size="small"
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateModalOpen(false)} color="inherit">
              Cancelar
            </Button>
            <Button type="submit" variant="contained" color="primary" disabled={submitting}>
              {submitting ? 'Guardando...' : 'Confirmar Gasto'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Modal Pagar Gasto Pendiente */}
      <Dialog open={payModalOpen} onClose={() => setPayModalOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handlePaySubmit}>
          <DialogTitle sx={{ fontWeight: 'bold' }}>Pagar / Abonar Gasto</DialogTitle>
          <DialogContent dividers>
            {selectedExpense && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                <Box sx={{ p: 2, backgroundColor: 'action.hover', borderRadius: 1 }}>
                  <Typography variant="body2">
                    <strong>Beneficiario:</strong> {selectedExpense.beneficiary}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Concepto:</strong> {selectedExpense.description}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Total Obligación:</strong> {formatCurrency(selectedExpense.amount)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Monto Pagado:</strong> {formatCurrency(selectedExpense.amountPaid)}
                  </Typography>
                  <Typography variant="h6" sx={{ color: 'warning.main', fontWeight: 'bold', mt: 1 }}>
                    Saldo Pendiente: {formatCurrency(selectedExpense.balance)}
                  </Typography>
                </Box>

                <TextField
                  label="Monto a Pagar ($)"
                  type="number"
                  slotProps={{ htmlInput: { step: '0.01', min: '0.01', max: selectedExpense.balance } }}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  required
                  fullWidth
                  size="small"
                />

                <TextField
                  label="Fecha del Pago"
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  required
                  fullWidth
                  size="small"
                  slotProps={{ inputLabel: { shrink: true } }}
                />

                <TextField
                  select
                  label="Medio de Pago"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                  required
                  fullWidth
                  size="small"
                >
                  <MenuItem value="EFECTIVO">Efectivo (Caja General)</MenuItem>
                  <MenuItem value="TRANSFERENCIA">Transferencia (Cuenta Bancaria)</MenuItem>
                </TextField>

                {payMethod === 'TRANSFERENCIA' && (
                  <TextField
                    select
                    label="Cuenta Bancaria de Origen"
                    value={payBankAccountId}
                    onChange={(e) => setPayBankAccountId(e.target.value)}
                    required
                    fullWidth
                    size="small"
                  >
                    {bankAccounts.map((b) => (
                      <MenuItem key={b.id} value={b.id}>
                        {b.bankName} - {b.accountNumber} ({formatCurrency(b.currentBalance)})
                      </MenuItem>
                    ))}
                  </TextField>
                )}

                <TextField
                  label="Notas / Referencia del Pago"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  fullWidth
                  size="small"
                  placeholder="Ej. Recibo de caja menor, comprobante N° 123"
                />
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPayModalOpen(false)} color="inherit">
              Cancelar
            </Button>
            <Button type="submit" variant="contained" color="success" disabled={submitting}>
              {submitting ? 'Procesando...' : 'Confirmar Pago'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Modal Detalle de Gasto */}
      <Dialog open={detailModalOpen} onClose={() => setDetailModalOpen(false)} maxWidth="md" fullWidth>
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
                  <Typography variant="body1">
                    {selectedExpense.documentNumber || '—'}
                  </Typography>
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
                  <Typography variant="body1" sx={{ fontWeight: 'bold', color: parseFloat(selectedExpense.balance) > 0 ? 'warning.main' : 'text.primary' }}>
                    {formatCurrency(selectedExpense.balance)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Registrado Por
                  </Typography>
                  <Typography variant="body2">
                    {selectedExpense.createdByName || '—'}
                  </Typography>
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
                      <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>Valor Pagado</TableCell>
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
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                {p.reversalReason}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ textAlign: 'right' }}>
                            {!p.isReversed && (
                              <Tooltip title="Revertir Pago">
                                <IconButton
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

      {/* Modal Confirmar Anulación de Gasto */}
      <Dialog open={cancelModalOpen} onClose={() => setCancelModalOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleCancelSubmit}>
          <DialogTitle sx={{ color: 'error.main', fontWeight: 'bold' }}>
            Anular Gasto Operativo
          </DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2" sx={{ mb: 2 }}>
              ¿Está seguro de anular este gasto? Se generará un asiento contable de reversión y se devolverán los fondos a tesorería si fue pagado de contado.
            </Typography>
            <TextField
              label="Motivo de la Anulación (Obligatorio)"
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              required
              fullWidth
              multiline
              rows={3}
              size="small"
              placeholder="Describa la razón de la anulación (mínimo 5 caracteres)..."
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCancelModalOpen(false)} color="inherit">
              Cancelar
            </Button>
            <Button type="submit" variant="contained" color="error" disabled={submitting}>
              {submitting ? 'Anulando...' : 'Confirmar Anulación'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Modal Confirmar Reversión de Pago */}
      <Dialog open={reversePaymentModalOpen} onClose={() => setReversePaymentModalOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleReversePaymentSubmit}>
          <DialogTitle sx={{ color: 'warning.main', fontWeight: 'bold' }}>
            Revertir Pago de Gasto
          </DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Esta operación revertirá el pago, reintegrará el saldo pendiente a la obligación y registrará una entrada compensatoria en tesorería.
            </Typography>
            <TextField
              label="Motivo de la Reversión (Obligatorio)"
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              required
              fullWidth
              multiline
              rows={3}
              size="small"
              placeholder="Describa la razón de la reversión..."
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setReversePaymentModalOpen(false)} color="inherit">
              Cancelar
            </Button>
            <Button type="submit" variant="contained" color="warning" disabled={submitting}>
              {submitting ? 'Revirtiendo...' : 'Confirmar Reversión'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

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

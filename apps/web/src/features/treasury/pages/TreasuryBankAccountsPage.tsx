import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import type {
  BankAccountDto,
  CreateBankAccountDto,
  CreateBankMovementDto,
  UpdateBankAccountDto,
} from '@farmacia/contracts';
import { usePermissions } from '../../auth/hooks/usePermissions';
import {
  useBankAccountSummary,
  useBankAccounts,
  useBankMovements,
  useCreateBankAccount,
  useCreateBankMovement,
  useUpdateBankAccount,
} from '../hooks/useTreasury';
import { BankAccountDialog } from '../components/BankAccountDialog';
import { BankMovementDialog } from '../components/BankMovementDialog';
import { SweetModal } from '../../../components/SweetModal';

export function TreasuryBankAccountsPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(SYSTEM_PERMISSIONS.TREASURY_MANAGE);
  const canRead = hasPermission(SYSTEM_PERMISSIONS.TREASURY_READ);

  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Modals state
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccountDto | null>(null);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [movementAccount, setMovementAccount] = useState<BankAccountDto | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Filter state for movements
  const [movementTypeFilter, setMovementTypeFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');

  // Queries & Mutations
  const { data: accounts = [], isLoading: isLoadingAccounts } = useBankAccounts(includeInactive);
  const { data: summary, isLoading: isLoadingSummary } = useBankAccountSummary();

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0] ?? null;
  const activeAccountId = selectedAccount?.id ?? '';

  const { data: movementsData, isLoading: isLoadingMovements } = useBankMovements(activeAccountId, {
    movementType: movementTypeFilter || undefined,
    search: searchFilter || undefined,
    fromDate: fromDateFilter || undefined,
    toDate: toDateFilter || undefined,
  });

  const createAccountMutation = useCreateBankAccount();
  const updateAccountMutation = useUpdateBankAccount();
  const createMovementMutation = useCreateBankMovement();

  if (!canRead) {
    return (
      <Container component="main" sx={{ py: 4 }}>
        <Alert severity="warning">
          No tienes permisos para consultar la tesorería ni las cuentas bancarias.
        </Alert>
      </Container>
    );
  }

  const handleOpenCreateAccount = () => {
    setEditingAccount(null);
    setAccountDialogOpen(true);
  };

  const handleOpenEditAccount = (account: BankAccountDto) => {
    setEditingAccount(account);
    setAccountDialogOpen(true);
  };

  const handleOpenCreateMovement = (account: BankAccountDto) => {
    setMovementAccount(account);
    setMovementDialogOpen(true);
  };

  const handleSaveAccount = async (data: CreateBankAccountDto | UpdateBankAccountDto) => {
    if (editingAccount) {
      await updateAccountMutation.mutateAsync({
        id: editingAccount.id,
        data: data as UpdateBankAccountDto,
      });
      setToastMsg('Cuenta bancaria actualizada correctamente.');
    } else {
      await createAccountMutation.mutateAsync(data as CreateBankAccountDto);
      setToastMsg('Cuenta bancaria registrada exitosamente.');
    }
  };

  const handleSaveMovement = async (data: CreateBankMovementDto) => {
    if (!movementAccount) return;
    await createMovementMutation.mutateAsync({
      accountId: movementAccount.id,
      data,
    });
    setToastMsg('Movimiento de tesorería registrado correctamente.');
  };

  const totalBalanceNumber = parseFloat(summary?.totalBalance ?? '0');

  return (
    <Container component="main" maxWidth="xl" sx={{ py: 3 }}>
      {/* Encabezado y Acción */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Tesorería y Cuentas Bancarias
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gestión independiente de bancos, transferencias y medios digitales (separado de Caja física).
          </Typography>
        </Box>
        {canManage && (
          <Button
            variant="contained"
            color="primary"
            onClick={handleOpenCreateAccount}
            data-testid="new-bank-account-btn"
          >
            Nueva Cuenta Bancaria
          </Button>
        )}
      </Stack>

      {/* Tarjetas KPI de Resumen */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Paper sx={{ p: 2.5, borderRadius: 2, borderLeft: 4, borderColor: 'primary.main' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Saldo Total Disponible en Bancos
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5, color: 'primary.main' }}>
              {isLoadingSummary ? '...' : `$${totalBalanceNumber.toLocaleString('es-CO')} COP`}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Paper sx={{ p: 2.5, borderRadius: 2, borderLeft: 4, borderColor: 'success.main' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Cuentas Bancarias Activas
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5, color: 'success.dark' }}>
              {isLoadingSummary ? '...' : `${summary?.activeAccountsCount ?? 0} Cuentas`}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Paper sx={{ p: 2.5, borderRadius: 2, borderLeft: 4, borderColor: 'info.main' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Total Cuentas Registradas
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5, color: 'text.primary' }}>
              {isLoadingSummary ? '...' : `${summary?.totalAccountsCount ?? 0} Cuentas`}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Filtro de inactivas */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
          }
          label="Mostrar cuentas inactivas"
        />
      </Box>

      {/* Grid de Cuentas */}
      {isLoadingAccounts ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : accounts.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            No hay cuentas bancarias registradas actualmente.
          </Typography>
          {canManage && (
            <Button variant="outlined" sx={{ mt: 2 }} onClick={handleOpenCreateAccount}>
              Registrar Primera Cuenta
            </Button>
          )}
        </Paper>
      ) : (
        <Grid container spacing={2.5} sx={{ mb: 4 }}>
          {accounts.map((acc) => {
            const isSelected = selectedAccount?.id === acc.id;
            const currentBal = parseFloat(acc.currentBalance);
            return (
              <Grid size={{ xs: 12, md: 4 }} key={acc.id}>
                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 2,
                    borderColor: isSelected ? 'primary.main' : 'divider',
                    borderWidth: isSelected ? 2 : 1,
                    boxShadow: isSelected ? 2 : 0,
                    transition: 'all 0.2s ease',
                  }}
                  data-testid={`bank-account-card-${acc.id}`}
                >
                  <CardContent>
                    <Stack
                      direction="row"
                      sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
                    >
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                          {acc.bankName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {acc.accountNumber} • {acc.accountType}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {acc.ledgerAccountCode
                            ? `PUC ${acc.ledgerAccountCode}`
                            : 'Sin subcuenta del PUC: edítela para vincularla'}
                        </Typography>
                      </Box>
                      <Chip
                        label={acc.isActive ? 'Activa' : 'Inactiva'}
                        color={acc.isActive ? 'success' : 'default'}
                        size="small"
                      />
                    </Stack>

                    <Typography variant="body2" sx={{ mt: 1.5, fontWeight: 500 }}>
                      {acc.name}
                    </Typography>

                    <Box sx={{ mt: 2, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
                      <Typography variant="caption" color="text.secondary">
                        Saldo Actual
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main' }}>
                        ${currentBal.toLocaleString('es-CO')} COP
                      </Typography>
                    </Box>
                  </CardContent>
                  <CardActions sx={{ p: 1.5, pt: 0, justifyContent: 'space-between' }}>
                    <Button
                      size="small"
                      variant={isSelected ? 'contained' : 'outlined'}
                      onClick={() => setSelectedAccountId(acc.id)}
                      data-testid={`view-movements-btn-${acc.id}`}
                    >
                      {isSelected ? 'Viendo Movimientos' : 'Ver Movimientos'}
                    </Button>
                    {canManage && (
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          color="secondary"
                          onClick={() => handleOpenCreateMovement(acc)}
                          disabled={!acc.isActive}
                          data-testid={`new-movement-btn-${acc.id}`}
                        >
                          Movimiento
                        </Button>
                        <Button size="small" onClick={() => handleOpenEditAccount(acc)}>
                          Editar
                        </Button>
                      </Stack>
                    )}
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Sección Detalle de Movimientos de la Cuenta Seleccionada */}
      {selectedAccount && (
        <Paper sx={{ p: 3, borderRadius: 2 }} data-testid="account-movements-section">
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', md: 'center' },
              mb: 2.5,
            }}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Movimientos: {selectedAccount.name} ({selectedAccount.bankName})
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Historial transaccional auditable e inmutable.
              </Typography>
            </Box>

            {/* Filtros de movimientos */}
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <TextField
                size="small"
                type="date"
                label="Desde"
                slotProps={{ inputLabel: { shrink: true } }}
                value={fromDateFilter}
                onChange={(e) => setFromDateFilter(e.target.value)}
              />
              <TextField
                size="small"
                type="date"
                label="Hasta"
                slotProps={{ inputLabel: { shrink: true } }}
                value={toDateFilter}
                onChange={(e) => setToDateFilter(e.target.value)}
              />

              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="filter-type-label">Tipo de Movimiento</InputLabel>
                <Select
                  labelId="filter-type-label"
                  value={movementTypeFilter}
                  label="Tipo de Movimiento"
                  onChange={(e) => setMovementTypeFilter(e.target.value)}
                >
                  <MenuItem value="">Todos los tipos</MenuItem>
                  <MenuItem value="DEPOSIT">Depósitos / Consignaciones</MenuItem>
                  <MenuItem value="TRANSFER_IN">Transferencias Recibidas</MenuItem>
                  <MenuItem value="WITHDRAWAL">Retiros</MenuItem>
                  <MenuItem value="TRANSFER_OUT">Transferencias Enviadas</MenuItem>
                  <MenuItem value="FEE">Comisiones Bancarias</MenuItem>
                  <MenuItem value="ADJUSTMENT">Ajustes</MenuItem>
                </Select>
              </FormControl>

              <TextField
                size="small"
                placeholder="Buscar concepto o comprobante..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
            </Stack>
          </Stack>

          {/* Tabla de movimientos */}
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Fecha</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Tipo</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Concepto</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Referencia / Voucher</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Entrada (+)
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Salida (-)
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Saldo Resultante
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoadingMovements ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                      <CircularProgress size={24} />
                    </TableCell>
                  </TableRow>
                ) : !movementsData?.items || movementsData.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      No se encontraron movimientos para esta cuenta bancaria.
                    </TableCell>
                  </TableRow>
                ) : (
                  movementsData.items.map((mov) => {
                    const isCredit = ['DEPOSIT', 'TRANSFER_IN', 'ADJUSTMENT'].includes(
                      mov.movementType,
                    );
                    const amountNum = parseFloat(mov.amount);
                    const balAfterNum = parseFloat(mov.balanceAfter);

                    return (
                      <TableRow key={mov.id} hover>
                        <TableCell>
                          {new Date(mov.movementDate).toLocaleDateString('es-CO', {
                            year: 'numeric',
                            month: 'short',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={mov.movementType}
                            size="small"
                            color={isCredit ? 'success' : 'error'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>{mov.concept}</TableCell>
                        <TableCell>
                          {mov.externalReference || mov.referenceDocumentId || '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ color: 'success.main', fontWeight: 600 }}>
                          {isCredit ? `+$${amountNum.toLocaleString('es-CO')}` : '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ color: 'error.main', fontWeight: 600 }}>
                          {!isCredit ? `-$${amountNum.toLocaleString('es-CO')}` : '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          ${balAfterNum.toLocaleString('es-CO')}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Diálogos modales */}
      <BankAccountDialog
        open={accountDialogOpen}
        onClose={() => setAccountDialogOpen(false)}
        onSubmit={handleSaveAccount}
        accountToEdit={editingAccount}
        isSubmitting={createAccountMutation.isPending || updateAccountMutation.isPending}
      />

      <BankMovementDialog
        open={movementDialogOpen}
        onClose={() => setMovementDialogOpen(false)}
        account={movementAccount}
        onSubmit={handleSaveMovement}
        isSubmitting={createMovementMutation.isPending}
      />

      <SweetModal
        open={Boolean(toastMsg)}
        type="success"
        title="¡Buen trabajo!"
        text={toastMsg || ''}
        confirmText="OK"
        onConfirm={() => setToastMsg(null)}
        onClose={() => setToastMsg(null)}
      />
    </Container>
  );
}

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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { SYSTEM_PERMISSIONS, type AccountType } from '@farmacia/contracts';
import { usePermissions } from '../../auth/hooks/usePermissions';
import { fetchTrialBalance, fetchGeneralLedger } from '../api/accounting.api';

const accountTypeNames: Record<AccountType, string> = {
  ASSET: 'Activo',
  LIABILITY: 'Pasivo',
  EQUITY: 'Patrimonio',
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
  COST: 'Costo',
  ORDER_DEBTOR: 'Cuentas de orden deudoras',
  ORDER_CREDITOR: 'Cuentas de orden acreedoras',
};

function formatMoney(value: string | number): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return '$0.00';
  return `$${num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const TrialBalancePage = () => {
  const { hasPermission } = usePermissions();

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(today);

  // Auxiliar / Libro Mayor modal
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['trial-balance', fromDate, toDate],
    queryFn: () => fetchTrialBalance(fromDate, toDate),
    enabled: Boolean(fromDate && toDate),
  });

  const { data: ledgerData, isLoading: isLoadingLedger } = useQuery({
    queryKey: ['general-ledger', selectedAccountId, fromDate, toDate],
    queryFn: () =>
      selectedAccountId ? fetchGeneralLedger(selectedAccountId, fromDate, toDate) : null,
    enabled: Boolean(selectedAccountId && fromDate && toDate),
  });

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
            Balance de Comprobación
          </Typography>
          <Typography color="text.secondary">
            Comprobación de sumas y saldos para verificar la partida doble en el período contable.
          </Typography>
        </Box>

        {/* Filtros de Período */}
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
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
            <Button variant="contained" onClick={() => refetch()}>
              Consultar Balance
            </Button>
          </Stack>
        </Paper>

        {/* Estado de Partida Doble */}
        {data && (
          <Alert
            severity={data.isBalanced ? 'success' : 'error'}
            variant="outlined"
            sx={{ fontWeight: 600 }}
          >
            {data.isBalanced
              ? `Balance Cuadrado: Los débitos (${formatMoney(data.totalDebit)}) y créditos (${formatMoney(data.totalCredit)}) son exactamente iguales.`
              : `Alerta: El balance presenta descuadre entre débitos (${formatMoney(data.totalDebit)}) y créditos (${formatMoney(data.totalCredit)}).`}
          </Alert>
        )}

        {/* Tabla de Sumas y Saldos */}
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : isError ? (
            <Alert severity="error" sx={{ m: 2 }}>
              Error al consultar el Balance de Comprobación. Verifica que las fechas sean válidas.
            </Alert>
          ) : (
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Código</TableCell>
                    <TableCell>Cuenta</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell align="right">Saldo Inicial</TableCell>
                    <TableCell align="right">Débitos Período</TableCell>
                    <TableCell align="right">Créditos Período</TableCell>
                    <TableCell align="right">Saldo Final</TableCell>
                    <TableCell align="center">Auxiliar</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data?.rows && data.rows.length > 0 ? (
                    <>
                      {data.rows.map((row) => (
                        <TableRow key={row.accountId} hover>
                          <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {row.accountCode}
                          </TableCell>
                          <TableCell>{row.accountName}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              variant="outlined"
                              label={accountTypeNames[row.accountType] || row.accountType}
                            />
                          </TableCell>
                          <TableCell align="right">
                            {formatMoney(row.initialBalance)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {formatMoney(row.totalDebit)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {formatMoney(row.totalCredit)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {formatMoney(row.finalBalance)}
                          </TableCell>
                          <TableCell align="center">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => setSelectedAccountId(row.accountId)}
                            >
                              Ver Mayor
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Fila de Totales Generales */}
                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        <TableCell colSpan={4} sx={{ fontWeight: 700, textAlign: 'right' }}>
                          SUMAS TOTALES:
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>
                          {formatMoney(data.totalDebit)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>
                          {formatMoney(data.totalCredit)}
                        </TableCell>
                        <TableCell colSpan={2} />
                      </TableRow>
                    </>
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                        No hay movimientos contables en el período seleccionado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Stack>

      {/* Modal Libro Mayor / Auxiliar de Cuenta */}
      <Dialog
        open={Boolean(selectedAccountId)}
        onClose={() => setSelectedAccountId(null)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Libro Mayor y Auxiliar de Cuenta
        </DialogTitle>
        <DialogContent dividers>
          {isLoadingLedger ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : ledgerData ? (
            <Stack spacing={2.5}>
              <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {ledgerData.accountCode} — {ledgerData.accountName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Período: {ledgerData.fromDate} a {ledgerData.toDate}
                </Typography>
              </Box>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <Card variant="outlined">
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="caption" color="text.secondary">
                        Saldo Inicial
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {formatMoney(ledgerData.initialBalance)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <Card variant="outlined">
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="caption" color="text.secondary">
                        Total Débitos
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main' }}>
                        {formatMoney(ledgerData.totalDebit)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <Card variant="outlined">
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="caption" color="text.secondary">
                        Total Créditos
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main' }}>
                        {formatMoney(ledgerData.totalCredit)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <Card variant="outlined">
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="caption" color="text.secondary">
                        Saldo Final
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {formatMoney(ledgerData.finalBalance)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell>Fecha</TableCell>
                      <TableCell>Origen</TableCell>
                      <TableCell>Documento</TableCell>
                      <TableCell>Descripción</TableCell>
                      <TableCell align="right">Débito</TableCell>
                      <TableCell align="right">Crédito</TableCell>
                      <TableCell align="right">Saldo Resultante</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ledgerData.movements.length > 0 ? (
                      ledgerData.movements.map((m, idx) => (
                        <TableRow key={`${m.journalEntryId}-${idx}`} hover>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{m.date}</TableCell>
                          <TableCell>
                            <Chip size="small" variant="outlined" label={m.sourceType} />
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                            {m.sourceId ? m.sourceId.slice(0, 16) : '-'}
                          </TableCell>
                          <TableCell>{m.description}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: Number(m.debit) > 0 ? 600 : 400 }}>
                            {formatMoney(m.debit)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: Number(m.credit) > 0 ? 600 : 400 }}>
                            {formatMoney(m.credit)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {formatMoney(m.balanceAfter)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                          No se registraron movimientos para esta cuenta en el período.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          ) : (
            <Alert severity="error">No se pudo cargar el libro mayor de la cuenta.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedAccountId(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

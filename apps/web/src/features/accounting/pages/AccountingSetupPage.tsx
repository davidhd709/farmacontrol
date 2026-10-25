import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import DeleteIcon from '@mui/icons-material/Delete';
import { SYSTEM_PERMISSIONS, type ApplyPucTemplateResultDto } from '@farmacia/contracts';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { usePermissions } from '../../auth/hooks/usePermissions';
import { fetchAccounts } from '../api/accounting.api';
import {
  applyPucTemplate,
  createOpeningBalance,
  fetchAccountingSetup,
  fetchOpeningBalance,
} from '../api/accounting-setup.api';
import { formatMoney, toCents } from '../../../utils/money';

interface OpeningLine {
  accountId: string;
  debit: string;
  credit: string;
}

function localIsoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

const emptyLine = (): OpeningLine => ({ accountId: '', debit: '', credit: '' });

/**
 * Asistente de configuración contable (ADR-006, F7): lista de verificación del estado READY,
 * plantilla PUC del perfil sectorial y saldos de apertura.
 */
export function AccountingSetupPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE);
  const setup = useQuery({ queryKey: ['accounting', 'setup'], queryFn: fetchAccountingSetup });
  const opening = useQuery({ queryKey: ['accounting', 'opening'], queryFn: fetchOpeningBalance });
  const accounts = useQuery({ queryKey: ['accounting', 'accounts'], queryFn: fetchAccounts });
  const [applying, setApplying] = useState(false);
  const [templateResult, setTemplateResult] = useState<ApplyPucTemplateResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(localIsoDate(new Date()));
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<OpeningLine[]>([emptyLine(), emptyLine()]);
  const [saving, setSaving] = useState(false);

  const movementAccounts = (accounts.data ?? []).filter((a) => a.isActive && a.allowsMovement);
  const totals = useMemo(() => {
    const sum = (side: 'debit' | 'credit') =>
      lines.reduce((acc, l) => {
        try {
          return acc + (l[side] ? toCents(l[side]) : 0);
        } catch {
          return acc;
        }
      }, 0);
    return { debit: sum('debit'), credit: sum('credit') };
  }, [lines]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['accounting'] });
  };

  const apply = async () => {
    setError(null);
    setApplying(true);
    try {
      setTemplateResult(await applyPucTemplate());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aplicar la plantilla.');
    } finally {
      setApplying(false);
    }
  };

  const saveOpening = async () => {
    setError(null);
    setSaving(true);
    try {
      await createOpeningBalance({
        entryDate,
        reason,
        lines: lines
          .filter((l) => l.accountId)
          .map((l) => ({ accountId: l.accountId, debit: l.debit || '0', credit: l.credit || '0' })),
      });
      setLines([emptyLine(), emptyLine()]);
      setReason('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron registrar los saldos.');
    } finally {
      setSaving(false);
    }
  };

  const updateLine = (index: number, patch: Partial<OpeningLine>) =>
    setLines((current) => current.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  if (setup.isLoading) {
    return (
      <Box
        sx={{ display: 'flex', justifyContent: 'center', py: 6 }}
        role="status"
        aria-label="Cargando"
      >
        <CircularProgress />
      </Box>
    );
  }
  if (setup.isError || !setup.data) {
    return (
      <Alert severity="error">No se pudo cargar el estado de la configuración contable.</Alert>
    );
  }
  const data = setup.data;
  const openingData = opening.data && opening.data.journalEntryId ? opening.data : null;

  return (
    <Container component="main" maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <HomeBackButton />
        <Box>
          <Typography variant="h5" component="h1">
            Asistente de configuración contable
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Estado:{' '}
            <strong>
              {data.status === 'READY' ? 'Lista para operar (READY)' : 'Configuración incompleta'}
            </strong>
          </Typography>
        </Box>
      </Box>
      <Stack spacing={3}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              Lista de verificación
            </Typography>
            <List dense aria-label="Requisitos de la configuración contable">
              {data.checks.map((c) => (
                <ListItem key={c.key} alignItems="flex-start">
                  <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                    {c.ok ? (
                      <CheckCircleIcon color="success" />
                    ) : c.required ? (
                      <ErrorOutlineIcon color="error" />
                    ) : (
                      <InfoOutlinedIcon color="warning" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <>
                        {c.label}{' '}
                        <Chip
                          size="small"
                          variant="outlined"
                          label={
                            c.ok ? 'Cumplido' : c.required ? 'Obligatorio pendiente' : 'Recomendado'
                          }
                          sx={{ ml: 1 }}
                        />
                      </>
                    }
                    secondary={
                      <>
                        {c.detail}
                        {c.missingPurposes && c.missingPurposes.length > 0
                          ? ` Pendientes: ${c.missingPurposes.join(', ')}.`
                          : ''}
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
              <Button component={RouterLink} to="/accounting/accounts" size="small">
                Plan de cuentas
              </Button>
              <Button component={RouterLink} to="/accounting/purposes" size="small">
                Propósitos contables
              </Button>
              <Button component={RouterLink} to="/company" size="small">
                Empresa y perfil tributario
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              Plantilla PUC · {data.template.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {data.template.accounts} cuentas ({data.template.legalBasis}) y{' '}
              {data.template.mappedPurposes} propósitos. Crea solo las cuentas que faltan y mapea
              solo los propósitos sin cuenta: nunca cambia lo que ya está configurado. La contadora
              puede ajustar las subcuentas después.
            </Typography>
            {canManage && (
              <Button variant="contained" onClick={apply} disabled={applying}>
                Aplicar plantilla PUC
              </Button>
            )}
            {templateResult && (
              <Alert
                severity={templateResult.conflicts.length ? 'warning' : 'success'}
                sx={{ mt: 2 }}
              >
                {templateResult.accountsCreated.length} cuentas creadas,{' '}
                {templateResult.purposesMapped.length} propósitos mapeados y{' '}
                {templateResult.purposesKept.length} conservados.
                {templateResult.conflicts.length > 0 &&
                  ` Conflictos: ${templateResult.conflicts.map((c) => `${c.code} (${c.reason})`).join('; ')}`}
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              Saldos de apertura
            </Typography>
            {data.inventory && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Inventario en contabilidad: {formatMoney(toCents(data.inventory.ledgerBalance))} ·
                en el submayor de valoración:{' '}
                {formatMoney(toCents(data.inventory.valuationBalance))} · diferencia:{' '}
                {formatMoney(toCents(data.inventory.difference))}
              </Typography>
            )}
            {openingData ? (
              <>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Registrados con fecha {openingData.entryDate}. Para cambiarlos, reverse el asiento
                  de apertura en el libro diario y registre otros.
                </Typography>
                <Table size="small" aria-label="Saldos de apertura registrados">
                  <TableHead>
                    <TableRow>
                      <TableCell>Cuenta</TableCell>
                      <TableCell align="right">Débito</TableCell>
                      <TableCell align="right">Crédito</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {openingData.lines.map((l, i) => (
                      <TableRow key={`${l.accountId}-${i}`}>
                        <TableCell>
                          {l.accountCode} · {l.accountName}
                        </TableCell>
                        <TableCell align="right">{formatMoney(toCents(l.debit))}</TableCell>
                        <TableCell align="right">{formatMoney(toCents(l.credit))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            ) : canManage ? (
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <TextField
                    type="date"
                    label="Fecha de corte"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <TextField
                    fullWidth
                    label="Soporte (inventario físico, extractos, balance anterior)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Stack>
                {lines.map((line, index) => (
                  <Stack
                    key={index}
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={1}
                    sx={{ alignItems: 'center' }}
                  >
                    <TextField
                      select
                      fullWidth
                      size="small"
                      label={`Cuenta línea ${index + 1}`}
                      value={line.accountId}
                      onChange={(e) => updateLine(index, { accountId: e.target.value })}
                    >
                      {movementAccounts.map((a) => (
                        <MenuItem key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      size="small"
                      label="Débito"
                      value={line.debit}
                      onChange={(e) => updateLine(index, { debit: e.target.value, credit: '' })}
                      slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                    />
                    <TextField
                      size="small"
                      label="Crédito"
                      value={line.credit}
                      onChange={(e) => updateLine(index, { credit: e.target.value, debit: '' })}
                      slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                    />
                    <IconButton
                      aria-label={`Quitar línea ${index + 1}`}
                      onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                      disabled={lines.length <= 2}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Stack>
                ))}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 1,
                  }}
                >
                  <Button onClick={() => setLines((current) => [...current, emptyLine()])}>
                    Agregar línea
                  </Button>
                  <Typography variant="body2" sx={{ alignSelf: 'center' }}>
                    Débitos {formatMoney(totals.debit)} · Créditos {formatMoney(totals.credit)}
                    {totals.debit !== totals.credit ? ' · No cuadra' : ' · Cuadra'}
                  </Typography>
                </Box>
                <Box>
                  <Button
                    variant="contained"
                    onClick={saveOpening}
                    disabled={
                      saving ||
                      !reason.trim() ||
                      totals.debit === 0 ||
                      totals.debit !== totals.credit
                    }
                  >
                    Registrar saldos de apertura
                  </Button>
                </Box>
              </Stack>
            ) : (
              <Typography variant="body2">No hay saldos de apertura registrados.</Typography>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}

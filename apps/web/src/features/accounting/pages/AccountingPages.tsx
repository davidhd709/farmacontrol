import { useMemo, useState, type ChangeEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import { useMutation } from '@tanstack/react-query';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { usePermissions } from '../../auth/hooks/usePermissions';
import {
  confirmAccountImport,
  downloadAccountTemplate,
  previewAccountImport,
  type AccountDto,
  type AccountType,
  type ImportPreview,
} from '../api/accounting.api';
import {
  AccountFormDialog,
  accountNatureLabels,
  accountTypeLabels,
} from '../components/AccountFormDialog';
import {
  useAccounts,
  useConfigurationStatus,
  usePurposes,
  useRefreshAccounting,
  useUpdateAccount,
  useUpdatePurpose,
} from '../hooks/useAccounting';

function AccountingAccess({ children }: { children: React.ReactNode }) {
  const { hasPermission } = usePermissions();
  return hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_READ) ? (
    <>{children}</>
  ) : (
    <Container component="main" sx={{ py: 4 }}>
      <Alert severity="warning">No tienes permiso para consultar la configuración contable.</Alert>
    </Container>
  );
}

function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 2 }}
    >
      <Box>
        <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography color="text.secondary">{description}</Typography>
      </Box>
      {action}
    </Stack>
  );
}

function ConfigurationBanner() {
  const query = useConfigurationStatus();
  if (query.isPending) return <Alert severity="info">Consultando estado de configuración…</Alert>;
  if (query.isError)
    return (
      <Alert severity="error">
        No se pudo consultar el estado contable.{' '}
        <Button onClick={() => void query.refetch()}>Reintentar</Button>
      </Alert>
    );
  const data = query.data;
  return (
    <Alert severity={data.status === 'READY' ? 'success' : 'warning'}>
      Configuración contable: {data.configured} de {data.total} propósitos configurados.{' '}
      {data.status === 'READY'
        ? 'Lista.'
        : `Pendientes: ${data.missing.join(', ') || 'sin detalle'}.`}
    </Alert>
  );
}

function accountMatches(account: AccountDto, search: string, type: string, status: string) {
  return (
    (!search || `${account.code} ${account.name}`.toLocaleLowerCase('es-CO').includes(search)) &&
    (!type || account.type === type) &&
    (status === 'all' || account.isActive === (status === 'active'))
  );
}

export function AccountsPage() {
  const query = useAccounts();
  const update = useUpdateAccount();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('all');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<AccountDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<AccountDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const accounts = query.data ?? [];
  const filtered = useMemo(() => {
    const byId = new Map(accounts.map((account) => [account.id, account]));
    const visible = new Set<string>();
    const term = search.trim().toLocaleLowerCase('es-CO');
    for (const account of accounts) {
      if (!accountMatches(account, term, type, status)) continue;
      visible.add(account.id);
      let parentId = account.parentId;
      const seen = new Set<string>();
      while (parentId && !seen.has(parentId)) {
        seen.add(parentId);
        visible.add(parentId);
        parentId = byId.get(parentId)?.parentId ?? null;
      }
    }
    const children = new Map<string | null, AccountDto[]>();
    for (const account of accounts) {
      if (!visible.has(account.id)) continue;
      const parent = account.parentId && visible.has(account.parentId) ? account.parentId : null;
      children.set(parent, [...(children.get(parent) ?? []), account]);
    }
    for (const values of children.values())
      values.sort((a, b) => a.code.localeCompare(b.code, 'es-CO', { numeric: true }));
    const rows: { account: AccountDto; depth: number; childCount: number }[] = [];
    const visit = (parentId: string | null, depth: number, path: Set<string>) => {
      for (const account of children.get(parentId) ?? []) {
        if (path.has(account.id)) continue;
        const childCount = children.get(account.id)?.length ?? 0;
        rows.push({ account, depth, childCount });
        if (term || type || status !== 'all' || expanded.has(account.id))
          visit(account.id, depth + 1, new Set([...path, account.id]));
      }
    };
    visit(null, 0, new Set());
    return rows;
  }, [accounts, search, type, status, expanded]);
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const changeStatus = async () => {
    if (!statusTarget) return;
    setActionError(null);
    try {
      await update.mutateAsync({
        id: statusTarget.id,
        payload: { isActive: !statusTarget.isActive },
      });
      setNotice(`Cuenta ${statusTarget.isActive ? 'inactivada' : 'reactivada'} correctamente.`);
      setStatusTarget(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo cambiar el estado.');
    }
  };
  return (
    <AccountingAccess>
      <Container component="main" maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <PageHeading
            title="Plan de Cuentas"
            description="Consulta y organiza la jerarquía de cuentas contables."
            action={
              canManage ? (
                <Button
                  variant="contained"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  Nueva cuenta
                </Button>
              ) : undefined
            }
          />
          <ConfigurationBanner />
          {notice && (
            <Alert severity="success" onClose={() => setNotice(null)}>
              {notice}
            </Alert>
          )}
          {actionError && (
            <Alert severity="error" onClose={() => setActionError(null)}>
              {actionError}
            </Alert>
          )}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Buscar por código o nombre"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                size="small"
                fullWidth
              />
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="account-type-label">Tipo</InputLabel>
                <Select
                  labelId="account-type-label"
                  label="Tipo"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  <MenuItem value="">Todos</MenuItem>
                  {Object.entries(accountTypeLabels).map(([key, label]) => (
                    <MenuItem key={key} value={key}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel id="account-status-label">Estado</InputLabel>
                <Select
                  labelId="account-status-label"
                  label="Estado"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <MenuItem value="all">Todas</MenuItem>
                  <MenuItem value="active">Activas</MenuItem>
                  <MenuItem value="inactive">Inactivas</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </Paper>
          {query.isPending ? (
            <Alert severity="info">Cargando plan de cuentas…</Alert>
          ) : query.isError ? (
            <Alert severity="error">
              No se pudo cargar el plan de cuentas.{' '}
              <Button onClick={() => void query.refetch()}>Reintentar</Button>
            </Alert>
          ) : (
            <Paper variant="outlined">
              <TableContainer>
                <Table size="small" aria-label="Plan de cuentas">
                  <TableHead>
                    <TableRow>
                      <TableCell>Cuenta</TableCell>
                      <TableCell>Tipo</TableCell>
                      <TableCell>Naturaleza</TableCell>
                      <TableCell>Movimiento</TableCell>
                      <TableCell>Estado</TableCell>
                      <TableCell align="right">Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                          {accounts.length === 0
                            ? 'Aún no hay cuentas. Crea una o importa un plan.'
                            : 'No hay cuentas con estos filtros.'}
                        </TableCell>
                      </TableRow>
                    )}
                    {filtered.map(({ account, depth, childCount }) => (
                      <TableRow key={account.id} hover>
                        <TableCell>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              pl: Math.min(depth, 8) * 2,
                            }}
                          >
                            {childCount ? (
                              <Button
                                size="small"
                                aria-label={`${expanded.has(account.id) ? 'Contraer' : 'Expandir'} ${account.code}`}
                                onClick={() => toggle(account.id)}
                                sx={{ minWidth: 32, mr: 1 }}
                              >
                                {expanded.has(account.id) || search || type || status !== 'all'
                                  ? '−'
                                  : '+'}
                              </Button>
                            ) : (
                              <Box sx={{ width: 40 }} />
                            )}
                            <Typography component="span">
                              <strong>{account.code}</strong> {account.name}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          {accountTypeLabels[account.type as AccountType] ?? account.type}
                        </TableCell>
                        <TableCell>{accountNatureLabels[account.nature] ?? account.nature}</TableCell>
                        <TableCell>{account.allowsMovement ? 'Sí' : 'Agrupadora'}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={account.isActive ? 'Activa' : 'Inactiva'}
                            color={account.isActive ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell align="right">
                          {canManage && (
                            <Stack direction="row" sx={{ justifyContent: 'flex-end', gap: 1 }}>
                              <Button
                                size="small"
                                onClick={() => {
                                  setEditing(account);
                                  setFormOpen(true);
                                }}
                              >
                                Editar
                              </Button>
                              <Button
                                size="small"
                                color={account.isActive ? 'warning' : 'primary'}
                                onClick={() => setStatusTarget(account)}
                              >
                                {account.isActive ? 'Inactivar' : 'Reactivar'}
                              </Button>
                            </Stack>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
          {canManage && (
            <AccountFormDialog
              open={formOpen}
              account={editing}
              accounts={accounts}
              onClose={() => setFormOpen(false)}
            />
          )}
          <Dialog
            open={!!statusTarget}
            onClose={update.isPending ? undefined : () => setStatusTarget(null)}
            aria-labelledby="account-status-title"
          >
            <DialogTitle id="account-status-title">
              {statusTarget?.isActive ? '¿Inactivar cuenta?' : '¿Reactivar cuenta?'}
            </DialogTitle>
            <DialogContent>
              <Typography>
                {statusTarget?.code} — {statusTarget?.name}.{' '}
                {statusTarget?.isActive
                  ? 'Una cuenta inactiva no debe seleccionarse para nuevos movimientos.'
                  : 'La cuenta volverá a estar disponible según las reglas del servidor.'}
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setStatusTarget(null)} disabled={update.isPending}>
                Cancelar
              </Button>
              <Button
                variant="contained"
                onClick={() => void changeStatus()}
                disabled={update.isPending}
              >
                {update.isPending ? 'Guardando…' : 'Confirmar'}
              </Button>
            </DialogActions>
          </Dialog>
        </Stack>
      </Container>
    </AccountingAccess>
  );
}

export function PurposesPage() {
  const query = usePurposes();
  const accountsQuery = useAccounts();
  const mutation = useUpdatePurpose();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const options = (accountsQuery.data ?? []).filter(
    (account) => account.isActive && account.allowsMovement,
  );
  const save = async (purpose: string, accountId: string) => {
    setError(null);
    try {
      await mutation.mutateAsync({ purpose, accountId: accountId || null });
      setNotice(`${purpose} actualizado.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el propósito.');
    }
  };
  return (
    <AccountingAccess>
      <Container component="main" maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <PageHeading
            title="Propósitos Contables"
            description="Asigna cada propósito a una cuenta activa que permita movimientos."
          />
          <ConfigurationBanner />
          {notice && (
            <Alert severity="success" onClose={() => setNotice(null)}>
              {notice}
            </Alert>
          )}
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          {query.isPending || accountsQuery.isPending ? (
            <Alert severity="info">Cargando propósitos…</Alert>
          ) : query.isError || accountsQuery.isError ? (
            <Alert severity="error">
              No se pudieron cargar los propósitos o las cuentas.{' '}
              <Button
                onClick={() => {
                  void query.refetch();
                  void accountsQuery.refetch();
                }}
              >
                Reintentar
              </Button>
            </Alert>
          ) : (
            <Paper variant="outlined">
              <TableContainer>
                <Table aria-label="Propósitos contables">
                  <TableHead>
                    <TableRow>
                      <TableCell>Propósito</TableCell>
                      <TableCell>Cuenta asignada</TableCell>
                      <TableCell>Estado</TableCell>
                      {canManage && <TableCell align="right">Acción</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(query.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={canManage ? 4 : 3} align="center" sx={{ py: 5 }}>
                          No hay propósitos disponibles.
                        </TableCell>
                      </TableRow>
                    )}
                    {(query.data ?? []).map((mapping) => {
                      const selected = draft[mapping.purpose] ?? mapping.accountId ?? '';
                      const unchanged = selected === (mapping.accountId ?? '');
                      return (
                        <TableRow key={mapping.purpose}>
                          <TableCell>
                            <strong>{mapping.purpose}</strong>
                          </TableCell>
                          <TableCell sx={{ minWidth: 280 }}>
                            {canManage ? (
                              <TextField
                                select
                                size="small"
                                fullWidth
                                label={`Cuenta para ${mapping.purpose}`}
                                value={selected}
                                disabled={mutation.isPending}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    [mapping.purpose]: event.target.value,
                                  }))
                                }
                              >
                                <MenuItem value="">Sin asignar</MenuItem>
                                {mapping.accountId &&
                                  !options.some((a) => a.id === mapping.accountId) && (
                                    <MenuItem value={mapping.accountId} disabled>
                                      {mapping.account?.code ?? mapping.accountId} — no disponible
                                    </MenuItem>
                                  )}
                                {options.map((account) => (
                                  <MenuItem key={account.id} value={account.id}>
                                    {account.code} — {account.name}
                                  </MenuItem>
                                ))}
                              </TextField>
                            ) : mapping.account ? (
                              `${mapping.account.code} — ${mapping.account.name}`
                            ) : (
                              'Pendiente de asignación'
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              color={mapping.status === 'ACTIVE' ? 'success' : 'warning'}
                              label={mapping.status === 'ACTIVE' ? 'Configurado' : 'Pendiente'}
                            />
                          </TableCell>
                          {canManage && (
                            <TableCell align="right">
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => void save(mapping.purpose, selected)}
                                disabled={unchanged || mutation.isPending}
                              >
                                Guardar
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </Stack>
      </Container>
    </AccountingAccess>
  );
}

export function ImportAccountsPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE);
  const refresh = useRefreshAccounting();
  const previewMutation = useMutation({ mutationFn: previewAccountImport });
  const confirmMutation = useMutation({
    mutationFn: ({ file, hash }: { file: File; hash: string }) => confirmAccountImport(file, hash),
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setPreview(null);
    setNotice(null);
    setError(null);
  };
  const download = async () => {
    setError(null);
    setDownloading(true);
    try {
      await downloadAccountTemplate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo descargar la plantilla.');
    } finally {
      setDownloading(false);
    }
  };
  const runPreview = async () => {
    if (!file) return;
    setError(null);
    setPreview(null);
    try {
      setPreview(await previewMutation.mutateAsync(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo validar el archivo.');
    }
  };
  const confirm = async () => {
    if (!file || !preview || preview.errorCount > 0) return;
    setError(null);
    try {
      const result = await confirmMutation.mutateAsync({ file, hash: preview.previewHash });
      await refresh();
      setNotice(`${result.importedCount} cuentas importadas correctamente.`);
      setFile(null);
      setPreview(null);
      setConfirmOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo confirmar la importación.');
      setConfirmOpen(false);
    }
  };
  return (
    <AccountingAccess>
      <Container component="main" maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <PageHeading
            title="Importar Plan de Cuentas"
            description="Valida el archivo Excel antes de guardar. La vista previa no modifica cuentas."
            action={
              <Button variant="outlined" onClick={() => void download()} disabled={downloading}>
                {downloading ? 'Descargando…' : 'Descargar plantilla'}
              </Button>
            }
          />
          {notice && (
            <Alert severity="success" onClose={() => setNotice(null)}>
              {notice}
            </Alert>
          )}
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          {canManage ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Button component="label" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
                  Seleccionar Excel
                  <input
                    hidden
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={chooseFile}
                    aria-label="Archivo Excel del plan de cuentas"
                  />
                </Button>
                <Typography>
                  {file ? `Archivo seleccionado: ${file.name}` : 'Ningún archivo seleccionado.'}
                </Typography>
                <Button
                  variant="contained"
                  disabled={!file || previewMutation.isPending || confirmMutation.isPending}
                  onClick={() => void runPreview()}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  {previewMutation.isPending ? 'Validando…' : 'Validar y ver vista previa'}
                </Button>
              </Stack>
            </Paper>
          ) : (
            <Alert severity="info">
              Puedes descargar la plantilla. Para cargar cuentas necesitas permiso de administración
              contable.
            </Alert>
          )}
          {preview && (
            <Stack spacing={2}>
              <Alert
                severity={
                  preview.errorCount ? 'error' : preview.warningCount ? 'warning' : 'success'
                }
              >
                {preview.validCount} filas válidas · {preview.errorCount} con errores ·{' '}
                {preview.warningCount} advertencias.{' '}
                {preview.errorCount
                  ? 'Corrige el archivo y vuelve a validarlo.'
                  : 'Puedes confirmar la importación.'}
              </Alert>
              <Paper variant="outlined">
                <TableContainer>
                  <Table size="small" aria-label="Vista previa del plan de cuentas">
                    <TableHead>
                      <TableRow>
                        <TableCell>Fila</TableCell>
                        <TableCell>Código</TableCell>
                        <TableCell>Nombre</TableCell>
                        <TableCell>Tipo</TableCell>
                        <TableCell>Naturaleza</TableCell>
                        <TableCell>Padre</TableCell>
                        <TableCell>Movimiento</TableCell>
                        <TableCell>Estado</TableCell>
                        <TableCell>Propósito</TableCell>
                        <TableCell>Validación</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.rows.map((row) => (
                        <TableRow key={row.row}>
                          <TableCell>{row.row}</TableCell>
                          <TableCell>{row.code}</TableCell>
                          <TableCell>{row.name}</TableCell>
                          <TableCell>{row.type}</TableCell>
                          <TableCell>
                            {row.nature ? accountNatureLabels[row.nature] : '—'}
                          </TableCell>
                          <TableCell>{row.parentCode || '—'}</TableCell>
                          <TableCell>
                            {row.allowsMovement === null
                              ? 'Inválido'
                              : row.allowsMovement
                                ? 'Sí'
                                : 'No'}
                          </TableCell>
                          <TableCell>
                            {row.isActive === null
                              ? 'Inválido'
                              : row.isActive
                                ? 'Activa'
                                : 'Inactiva'}
                          </TableCell>
                          <TableCell>{row.purpose || '—'}</TableCell>
                          <TableCell>
                            {row.errors.length ? (
                              <Typography color="error">{row.errors.join(' · ')}</Typography>
                            ) : row.warnings.length ? (
                              <Typography color="warning.main">
                                {row.warnings.join(' · ')}
                              </Typography>
                            ) : (
                              'Válida'
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
              <Button
                variant="contained"
                onClick={() => setConfirmOpen(true)}
                disabled={!canManage || preview.errorCount > 0 || confirmMutation.isPending}
                sx={{ alignSelf: 'flex-start' }}
              >
                Confirmar importación
              </Button>
            </Stack>
          )}
          <Dialog
            open={confirmOpen}
            onClose={confirmMutation.isPending ? undefined : () => setConfirmOpen(false)}
            aria-labelledby="confirm-import-title"
          >
            <DialogTitle id="confirm-import-title">¿Importar plan de cuentas?</DialogTitle>
            <DialogContent>
              <Typography>
                Se guardarán {preview?.validCount ?? 0} cuentas del archivo {file?.name}. Revisa las
                advertencias antes de continuar.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmOpen(false)} disabled={confirmMutation.isPending}>
                Cancelar
              </Button>
              <Button
                variant="contained"
                onClick={() => void confirm()}
                disabled={confirmMutation.isPending || !preview || preview.errorCount > 0}
                startIcon={confirmMutation.isPending ? <CircularProgress size={16} /> : undefined}
              >
                {confirmMutation.isPending ? 'Importando…' : 'Importar cuentas'}
              </Button>
            </DialogActions>
          </Dialog>
        </Stack>
      </Container>
    </AccountingAccess>
  );
}

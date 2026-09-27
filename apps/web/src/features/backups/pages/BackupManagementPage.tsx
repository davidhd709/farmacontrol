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
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HomeBackButton } from '../../../components/HomeBackButton';
import {
  fetchBackupStatus,
  triggerCreateBackup,
  triggerVerifyBackup,
} from '../api/backups.api';

export function BackupManagementPage() {
  const queryClient = useQueryClient();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifyingFile, setVerifyingFile] = useState<string | null>(null);

  const { data: status, isLoading, isError, refetch } = useQuery({
    queryKey: ['backup-status'],
    queryFn: fetchBackupStatus,
  });

  const createMutation = useMutation({
    mutationFn: triggerCreateBackup,
    onSuccess: (res) => {
      setConfirmOpen(false);
      setSuccessMessage(res.message || 'Copia de seguridad creada exitosamente.');
      void queryClient.invalidateQueries({ queryKey: ['backup-status'] });
    },
    onError: (err: unknown) => {
      setConfirmOpen(false);
      const msg = err instanceof Error ? err.message : 'Error al crear la copia de seguridad.';
      setErrorMessage(msg);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (filename: string) => triggerVerifyBackup(filename),
    onSuccess: (res) => {
      setVerifyingFile(null);
      if (res.verified) {
        setSuccessMessage(`Respaldo ${res.filename} validado e íntegro.`);
      } else {
        setErrorMessage(`Advertencia de integridad en ${res.filename}: ${res.message}`);
      }
      void queryClient.invalidateQueries({ queryKey: ['backup-status'] });
    },
    onError: (err: unknown) => {
      setVerifyingFile(null);
      const msg = err instanceof Error ? err.message : 'Error al verificar el respaldo.';
      setErrorMessage(msg);
    },
  });

  const handleVerify = (filename: string) => {
    setVerifyingFile(filename);
    setSuccessMessage(null);
    setErrorMessage(null);
    verifyMutation.mutate(filename);
  };

  const formatBytes = (bytes: number | null | undefined) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        {/* Cabecera y Navegación */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
              Copias de Seguridad y Resiliencia
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Control de continuidad operativa, monitoreo de respaldos periódicos y verificación criptográfica de integridad.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <HomeBackButton />
            <Button
              variant="contained"
              color="primary"
              onClick={() => setConfirmOpen(true)}
              disabled={createMutation.isPending}
              data-testid="create-backup-btn"
            >
              {createMutation.isPending ? 'Generando…' : '💾 Crear Respaldo Ahora'}
            </Button>
          </Box>
        </Box>

        {/* Mensajes de Notificación */}
        {successMessage ? (
          <Alert severity="success" onClose={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        ) : null}

        {errorMessage ? (
          <Alert severity="error" onClose={() => setErrorMessage(null)}>
            {errorMessage}
          </Alert>
        ) : null}

        {/* Indicador de RPO / Continuidad */}
        {status && (
          <Alert
            severity={status.isHealthyRpo ? 'success' : 'warning'}
            variant="outlined"
            data-testid="rpo-status-alert"
            sx={{ fontWeight: 600 }}
          >
            {status.isHealthyRpo ? (
              <>
                🟢 <strong>RPO en Regla:</strong> La última copia de seguridad se generó hace{' '}
                {status.hoursSinceLastBackup !== null ? `${status.hoursSinceLastBackup} horas` : 'instantes'}. Cumple con la política de continuidad de la farmacia.
              </>
            ) : (
              <>
                🟠 <strong>Atención de Resiliencia:</strong>{' '}
                {status.totalBackups === 0
                  ? 'No se registran respaldos previos. Se recomienda generar uno inmediatamente.'
                  : `El último respaldo tiene más de 24 horas (${status.hoursSinceLastBackup}h). Se recomienda ejecutar una copia de seguridad.`}
              </>
            )}
          </Alert>
        )}

        {/* Tarjetas de Resumen KPI */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
            gap: 2,
          }}
        >
          <Card variant="outlined">
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                ESTADO DE RPO
              </Typography>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 800,
                  mt: 0.5,
                  color: status?.isHealthyRpo ? 'success.main' : 'warning.main',
                }}
              >
                {status?.isHealthyRpo ? 'EN REGLA' : 'REVISIÓN'}
              </Typography>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                TOTAL RESPALDOS
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5 }}>
                {status?.totalBackups ?? 0} archivos
              </Typography>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                ÚLTIMO RESPALDO
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 700, mt: 0.5 }}>
                {status?.lastBackupAt
                  ? new Date(status.lastBackupAt).toLocaleString('es-CO')
                  : 'Sin registros'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatBytes(status?.lastBackupSizeBytes)}
              </Typography>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                ALMACENAMIENTO LOCAL
              </Typography>
              <Tooltip title={status?.backupDirectory || ''}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    mt: 0.5,
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {status?.backupDirectory?.split('/').slice(-2).join('/') || 'infra/backups'}
                </Typography>
              </Tooltip>
              <Typography variant="caption" color="text.secondary">
                Retención: 30 días
              </Typography>
            </CardContent>
          </Card>
        </Box>

        {/* Tabla de Copias de Seguridad */}
        <Paper variant="outlined">
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Historial de Copias de Seguridad Disponibles
            </Typography>
            <Button size="small" onClick={() => void refetch()} disabled={isLoading}>
              ↻ Refrescar
            </Button>
          </Box>

          <TableContainer>
            <Table size="medium">
              <TableHead sx={{ bgcolor: 'action.hover' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Archivo de Respaldo</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Fecha y Hora</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Tamaño</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Suma SHA-256</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Integridad</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                      <CircularProgress size={32} />
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="error">Error al cargar la lista de respaldos.</Typography>
                    </TableCell>
                  </TableRow>
                ) : !status?.items.length ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No hay copias de seguridad registradas en el directorio.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  status.items.map((row) => (
                    <TableRow key={row.filename} hover data-testid={`backup-row-${row.filename}`}>
                      <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                        {row.filename}
                      </TableCell>
                      <TableCell>
                        {new Date(row.createdAt).toLocaleString('es-CO')}
                      </TableCell>
                      <TableCell align="right">{formatBytes(row.sizeBytes)}</TableCell>
                      <TableCell>
                        <Tooltip title={row.sha256}>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', cursor: 'help' }}>
                            {row.sha256 !== 'N/A' ? `${row.sha256.substring(0, 16)}…` : 'N/A'}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={row.verified ? 'Verificado' : 'Pendiente'}
                          color={row.verified ? 'success' : 'default'}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleVerify(row.filename)}
                          disabled={verifyingFile === row.filename}
                          data-testid={`verify-btn-${row.filename}`}
                        >
                          {verifyingFile === row.filename ? 'Verificando…' : '🔍 Validar'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Guía Rápida de Recuperación ante Desastres (DR) */}
        <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'background.default' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            📖 Protocolo Rápido de Recuperación ante Desastres (DR)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            En caso de corrupción o pérdida de datos en la base principal, el procedimiento de restauración debe ejecutarse siguiendo estrictamente el runbook técnico en <code>docs/runbooks/backup-restore.md</code>:
          </Typography>
          <Box component="pre" sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 1, fontSize: '0.85rem', overflowX: 'auto' }}>
            {`# 1. Verificar integridad del volcado antes de restaurar:
./infra/scripts/verify-backup.sh infra/backups/<archivo.dump>

# 2. Restaurar sobre la base de datos destino:
./infra/scripts/restore.sh infra/backups/<archivo.dump> --target-db farmacia_db --confirm-overwrite`}
          </Box>
        </Paper>

        {/* Diálogo de Confirmación para Crear Respaldo */}
        <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
          <DialogTitle sx={{ fontWeight: 700 }}>¿Generar nueva copia de seguridad?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Esta acción extraerá un volcado lógico consistente de PostgreSQL mediante <code>pg_dump</code>, calculará su checksum SHA-256 y validará su integridad física inmediatamente.
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setConfirmOpen(false)} color="inherit">
              Cancelar
            </Button>
            <Button
              variant="contained"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              data-testid="confirm-create-backup-btn"
            >
              {createMutation.isPending ? 'Generando copia…' : 'Confirmar y Generar'}
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </Container>
  );
}

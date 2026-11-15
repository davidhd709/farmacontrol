import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableContainer,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDocumentLock, setDocumentLock } from '../api/accounting.api';
import { formatDate, formatDateTime } from '../../../utils/date-format';
import { DateField } from '../../../components/DateField';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

/**
 * Bloqueo de documentos por fecha: distinto del cierre de período. Impide registrar o
 * reversar asientos con fecha igual o anterior al corte (acuerdo del 4 de octubre).
 */
export function DocumentLockCard({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [lockedThrough, setLockedThrough] = useState('');
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['document-lock'],
    queryFn: fetchDocumentLock,
  });

  const mutation = useMutation({
    mutationFn: setDocumentLock,
    onSuccess: (_, variables) => {
      setLockedThrough('');
      setReason('');
      setConfirmOpen(false);
      setNotice(
        variables.lockedThrough
          ? `Documentos bloqueados hasta el ${formatDate(variables.lockedThrough)}.`
          : 'Bloqueo retirado.',
      );
      queryClient.invalidateQueries({ queryKey: ['document-lock'] });
    },
  });

  const current = data?.current?.lockedThrough ?? null;
  const reasonValid = reason.trim().length >= 5;

  return (
    <Paper sx={{ p: 2 }} component="section" aria-labelledby="document-lock-title">
      <Stack spacing={2}>
        <Box>
          <Typography id="document-lock-title" variant="h6" component="h2" sx={{ fontWeight: 700 }}>
            Bloqueo de documentos
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Impide registrar o reversar movimientos con fecha igual o anterior al corte, aunque el
            período siga abierto. Las compras o gastos pendientes se registran en el período
            siguiente.
          </Typography>
        </Box>

        {isLoading ? null : current ? (
          <Alert severity="warning">
            <strong>Documentos bloqueados hasta el {formatDate(current)}.</strong>{' '}
            {data?.current?.reason}
          </Alert>
        ) : (
          <Alert severity="info">
            Sin bloqueo vigente: se aceptan movimientos de cualquier fecha abierta.
          </Alert>
        )}

        {canManage && (
          <Stack
            component="form"
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            onSubmit={(e) => {
              e.preventDefault();
              // El bloqueo afecta a todos los módulos: se confirma con su alcance antes de aplicarlo
              setNotice(null);
              setConfirmOpen(true);
            }}
          >
            <DateField
              label="Bloquear hasta (incluida)"
              value={lockedThrough}
              onChange={(value) => setLockedThrough(value)}
              helperText="Vacío para retirar el bloqueo. Debe ser anterior a hoy."
              sx={{ minWidth: 220 }}
            />
            <TextField
              label="Motivo"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              fullWidth
              helperText="Ej.: Informe a corte de julio revisado y cuadrado."
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
            <Box>
              <Button
                type="submit"
                variant="contained"
                color={lockedThrough ? 'warning' : 'primary'}
                disabled={!reasonValid || mutation.isPending || (!lockedThrough && !current)}
                sx={{ whiteSpace: 'nowrap', mt: 1 }}
              >
                {mutation.isPending
                  ? 'Guardando…'
                  : lockedThrough
                    ? 'Aplicar bloqueo'
                    : 'Retirar bloqueo'}
              </Button>
            </Box>
          </Stack>
        )}
        {notice && (
          <Alert severity="success" role="status" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        <ConfirmDialog
          open={confirmOpen}
          operationType={lockedThrough ? 'close' : 'confirm'}
          title={lockedThrough ? '¿Aplicar el bloqueo de documentos?' : '¿Retirar el bloqueo?'}
          subject={
            lockedThrough
              ? `Bloquear hasta el ${formatDate(lockedThrough)} (incluido)`
              : `Bloqueo vigente hasta el ${current ? formatDate(current) : '—'}`
          }
          effects={
            lockedThrough
              ? [
                  `Ningún módulo podrá registrar ni reversar movimientos con fecha hasta el ${formatDate(lockedThrough)}.`,
                  'Las compras o gastos pendientes de esas fechas se registran en el período siguiente.',
                  `Queda en el historial con el motivo «${reason.trim()}».`,
                ]
              : [
                  'Se vuelven a aceptar movimientos de cualquier fecha de un período abierto.',
                  `Queda en el historial con el motivo «${reason.trim()}».`,
                ]
          }
          confirmText={lockedThrough ? 'Aplicar bloqueo' : 'Retirar bloqueo'}
          onConfirm={() =>
            mutation.mutateAsync({ lockedThrough: lockedThrough || null, reason: reason.trim() })
          }
          onCancel={() => setConfirmOpen(false)}
        />

        {data && data.history.length > 0 && (
          <TableContainer>
            <Table size="small" aria-label="Historial de bloqueos">
              <TableHead>
                <TableRow>
                  <TableCell>Fecha del cambio</TableCell>
                  <TableCell>Bloqueado hasta</TableCell>
                  <TableCell>Motivo</TableCell>
                  <TableCell>Usuario</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.history.map((lock) => (
                  <TableRow key={lock.id}>
                    <TableCell>{formatDateTime(lock.createdAt)}</TableCell>
                    <TableCell>
                      {lock.lockedThrough ? formatDate(lock.lockedThrough) : 'Sin bloqueo'}
                    </TableCell>
                    <TableCell>{lock.reason}</TableCell>
                    <TableCell>{lock.createdByName ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>
    </Paper>
  );
}

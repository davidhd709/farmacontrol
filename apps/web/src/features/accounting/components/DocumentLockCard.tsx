import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDocumentLock, setDocumentLock } from '../api/accounting.api';

const formatDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

/**
 * Bloqueo de documentos por fecha: distinto del cierre de período. Impide registrar o
 * reversar asientos con fecha igual o anterior al corte (acuerdo del 4 de octubre).
 */
export function DocumentLockCard({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [lockedThrough, setLockedThrough] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['document-lock'],
    queryFn: fetchDocumentLock,
  });

  const mutation = useMutation({
    mutationFn: setDocumentLock,
    onSuccess: () => {
      setLockedThrough('');
      setReason('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['document-lock'] });
    },
    onError: (e: Error) => setError(e.message),
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
            período siga abierto. Las compras o gastos pendientes se registran en el período siguiente.
          </Typography>
        </Box>

        {isLoading ? null : current ? (
          <Alert severity="warning">
            <strong>Documentos bloqueados hasta el {formatDate(current)}.</strong>{' '}
            {data?.current?.reason}
          </Alert>
        ) : (
          <Alert severity="info">Sin bloqueo vigente: se aceptan movimientos de cualquier fecha abierta.</Alert>
        )}

        {canManage && (
          <Stack
            component="form"
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({ lockedThrough: lockedThrough || null, reason: reason.trim() });
            }}
          >
            <TextField
              label="Bloquear hasta (incluida)"
              type="date"
              value={lockedThrough}
              onChange={(e) => setLockedThrough(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
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
        {error && <Alert severity="error">{error}</Alert>}

        {data && data.history.length > 0 && (
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
                  <TableCell>{new Date(lock.createdAt).toLocaleString('es-CO')}</TableCell>
                  <TableCell>{lock.lockedThrough ? formatDate(lock.lockedThrough) : 'Sin bloqueo'}</TableCell>
                  <TableCell>{lock.reason}</TableCell>
                  <TableCell>{lock.createdByName ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Stack>
    </Paper>
  );
}

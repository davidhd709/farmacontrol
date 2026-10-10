import { useRef, useState } from 'react';
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
import { closeYear, fetchAnnualClosingPreview } from '../api/accounting.api';

const money = (value: string) =>
  `$${Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Cierre anual: traslada el resultado del año a utilidades (3705) o pérdidas (3710)
 * acumuladas con fecha 31 de diciembre. Se muestra el asiento antes de confirmarlo.
 */
export function AnnualClosingCard({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [requested, setRequested] = useState<number | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const keyRef = useRef<{ year: number; key: string } | null>(null);

  const preview = useQuery({
    queryKey: ['annual-closing-preview', requested],
    queryFn: () => fetchAnnualClosingPreview(requested!),
    enabled: requested !== null,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (target: number) => {
      // La misma clave para reintentos del mismo año: el cierre no se duplica
      if (keyRef.current?.year !== target) keyRef.current = { year: target, key: crypto.randomUUID() };
      return closeYear(target, keyRef.current.key);
    },
    onSuccess: (result) => {
      setDone(`Cierre ${result.year} registrado. Resultado trasladado: ${money(result.netResult)}.`);
      queryClient.invalidateQueries({ queryKey: ['annual-closing-preview'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });

  const data = preview.data;
  const net = data ? Number(data.netResult) : 0;

  return (
    <Paper sx={{ p: 2 }} component="section" aria-labelledby="annual-closing-title">
      <Stack spacing={2}>
        <Box>
          <Typography id="annual-closing-title" variant="h6" component="h2" sx={{ fontWeight: 700 }}>
            Cierre anual
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Cancela ingresos, costos, gastos y el resultado del ejercicio al 31 de diciembre y traslada
            el neto a utilidades acumuladas (3705) o pérdidas acumuladas (3710). Hágalo cuando el año
            esté revisado y cuadrado.
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
          <TextField
            label="Año a cerrar"
            type="number"
            size="small"
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setRequested(null);
              setDone(null);
            }}
            sx={{ width: 160 }}
          />
          <Button variant="outlined" onClick={() => setRequested(year)}>
            Ver asiento de cierre
          </Button>
        </Stack>

        {preview.isError && <Alert severity="error">{(preview.error as Error).message}</Alert>}
        {done && <Alert severity="success">{done}</Alert>}

        {data && (
          <>
            {data.existingEntryId ? (
              <Alert severity="info">El año {data.year} ya tiene un cierre vigente.</Alert>
            ) : data.lines.length === 0 ? (
              <Alert severity="info">El año {data.year} no tiene saldos de resultado para cerrar.</Alert>
            ) : (
              <Alert severity={net >= 0 ? 'success' : 'warning'}>
                {net >= 0 ? 'Utilidad' : 'Pérdida'} del ejercicio {data.year}:{' '}
                <strong>{money(String(Math.abs(net)))}</strong>, a{' '}
                {data.destinationAccount
                  ? `${data.destinationAccount.code} ${data.destinationAccount.name}`
                  : `la cuenta del propósito ${data.destinationPurpose} (sin configurar)`}
                . Fecha del asiento: {data.entryDate}.
              </Alert>
            )}
            {data.lines.length > 0 && (
              <Table size="small" aria-label={`Asiento de cierre ${data.year}`}>
                <TableHead>
                  <TableRow>
                    <TableCell>Cuenta</TableCell>
                    <TableCell align="right">Débito</TableCell>
                    <TableCell align="right">Crédito</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.lines.map((line) => (
                    <TableRow key={line.accountId}>
                      <TableCell>
                        {line.accountCode} {line.accountName}
                      </TableCell>
                      <TableCell align="right">{Number(line.debit) ? money(line.debit) : ''}</TableCell>
                      <TableCell align="right">{Number(line.credit) ? money(line.credit) : ''}</TableCell>
                    </TableRow>
                  ))}
                  {net !== 0 && (
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>
                        {data.destinationAccount
                          ? `${data.destinationAccount.code} ${data.destinationAccount.name}`
                          : data.destinationPurpose}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {net < 0 ? money(String(-net)) : ''}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {net > 0 ? money(String(net)) : ''}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
            {mutation.isError && <Alert severity="error">{(mutation.error as Error).message}</Alert>}
            {canManage && !data.existingEntryId && data.lines.length > 0 && (
              <Box>
                <Button
                  variant="contained"
                  color="warning"
                  disabled={mutation.isPending || (!data.destinationAccount && net !== 0)}
                  onClick={() => mutation.mutate(data.year)}
                >
                  {mutation.isPending ? 'Registrando…' : `Confirmar cierre anual ${data.year}`}
                </Button>
              </Box>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { createManualNote, type AccountDto } from '../api/accounting.api';
import { useAccounts } from '../hooks/useAccounting';

interface LineDraft {
  key: number;
  accountId: string | null;
  debit: string;
  credit: string;
}

const AMOUNT_RE = /^\d{0,15}(\.\d{0,2})?$/;

/** Convierte "1500.5" a centavos sin coma flotante. */
function toCents(value: string): bigint {
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) return 0n;
  const [int, dec = ''] = value.split('.');
  return BigInt(int) * 100n + BigInt(dec.padEnd(2, '0'));
}

function formatCents(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents;
  const value = `${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
  return `${cents < 0n ? '-' : ''}$${Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2 })}`;
}

const emptyLine = (key: number): LineDraft => ({ key, accountId: null, debit: '', credit: '' });

/**
 * Nota contable manual: asiento libre con la fecha que elija la contadora. El servidor
 * valida de nuevo el balance, las cuentas, el período cerrado y el bloqueo de documentos.
 */
export function ManualNoteDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (noteNumber: string) => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const postable = useMemo(
    () => accounts.filter((a) => a.isActive && a.allowsMovement),
    [accounts],
  );
  const byId = useMemo(() => new Map(postable.map((a) => [a.id, a])), [postable]);

  const [entryDate, setEntryDate] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(1), emptyLine(2)]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextKey = useRef(3);
  // Un reintento del mismo contenido reutiliza la clave para no registrar la nota dos veces
  const retryRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (open) {
      setEntryDate('');
      setDescription('');
      setLines([emptyLine(1), emptyLine(2)]);
      setError(null);
      retryRef.current = null;
      nextKey.current = 3;
    }
  }, [open]);

  const totalDebit = lines.reduce((acc, l) => acc + toCents(l.debit), 0n);
  const totalCredit = lines.reduce((acc, l) => acc + toCents(l.credit), 0n);
  const difference = totalDebit - totalCredit;
  const completeLines = lines.filter(
    (l) => l.accountId && (toCents(l.debit) > 0n) !== (toCents(l.credit) > 0n),
  );
  const canSubmit =
    !!entryDate &&
    description.trim().length >= 5 &&
    completeLines.length >= 2 &&
    completeLines.length === lines.length &&
    difference === 0n &&
    totalDebit > 0n &&
    !submitting;

  const updateLine = (key: number, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    const payload = {
      entryDate,
      description: description.trim(),
      lines: lines.map((l) => ({
        accountId: l.accountId!,
        debit: l.debit || '0',
        credit: l.credit || '0',
      })),
    };
    const fingerprint = JSON.stringify(payload);
    if (retryRef.current?.fingerprint !== fingerprint) {
      retryRef.current = { fingerprint, key: crypto.randomUUID() };
    }
    try {
      const result = await createManualNote(payload, retryRef.current.key);
      onCreated(result.noteNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la nota contable.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Nueva nota contable</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Fecha contable"
              type="date"
              required
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="Puede ser una fecha anterior, si no está cerrada ni bloqueada."
              sx={{ minWidth: 220 }}
            />
            <TextField
              label="Descripción"
              required
              fullWidth
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 480 } }}
            />
          </Stack>

          <Table size="small" aria-label="Líneas de la nota contable">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '55%' }}>Cuenta</TableCell>
                <TableCell align="right">Débito</TableCell>
                <TableCell align="right">Crédito</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line, index) => (
                <TableRow key={line.key}>
                  <TableCell>
                    <Autocomplete<AccountDto>
                      options={postable}
                      value={line.accountId ? (byId.get(line.accountId) ?? null) : null}
                      onChange={(_, value) => updateLine(line.key, { accountId: value?.id ?? null })}
                      getOptionLabel={(a) => `${a.code} — ${a.name}`}
                      isOptionEqualToValue={(a, b) => a.id === b.id}
                      renderInput={(params) => (
                        <TextField {...params} size="small" label={`Cuenta línea ${index + 1}`} />
                      )}
                    />
                  </TableCell>
                  {(['debit', 'credit'] as const).map((side) => (
                    <TableCell key={side} align="right">
                      <TextField
                        size="small"
                        value={line[side]}
                        onChange={(e) => {
                          const value = e.target.value.replace(',', '.');
                          if (AMOUNT_RE.test(value)) updateLine(line.key, { [side]: value });
                        }}
                        slotProps={{
                          htmlInput: {
                            inputMode: 'decimal',
                            'aria-label': `${side === 'debit' ? 'Débito' : 'Crédito'} línea ${index + 1}`,
                            style: { textAlign: 'right' },
                          },
                        }}
                        sx={{ width: 160 }}
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <IconButton
                      aria-label={`Quitar línea ${index + 1}`}
                      disabled={lines.length <= 2}
                      onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>
                  <Button onClick={() => setLines((current) => [...current, emptyLine(nextKey.current++)])}>
                    Agregar línea
                  </Button>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCents(totalDebit)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCents(totalCredit)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>

          <Box>
            {difference === 0n ? (
              totalDebit > 0n && <Typography color="success.main">✓ Débitos y créditos cuadran.</Typography>
            ) : (
              <Typography color="error">
                Diferencia: {formatCents(difference)}. Débitos y créditos deben ser iguales.
              </Typography>
            )}
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? 'Registrando…' : 'Registrar nota'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

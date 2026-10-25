import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { formatMoney, toCents } from '../../../utils/money';
import { fetchJournalBook, fetchLedgerBook } from '../api/accounting-books.api';
import { PeriodFilter, localToday, monthStart } from '../components/PeriodFilter';

const m = (value: string) => formatMoney(toCents(value));

/** Libros oficiales (ADR-006, F8): libro diario y libro mayor y balances. */
export function OfficialBooksPage() {
  const [tab, setTab] = useState<'journal' | 'ledger'>('journal');
  const [range, setRange] = useState({ from: monthStart(), to: localToday() });
  const valid = range.from && range.to && range.from <= range.to;
  const journal = useQuery({
    queryKey: ['accounting', 'books', 'journal', range],
    queryFn: () => fetchJournalBook(range.from, range.to),
    enabled: tab === 'journal' && Boolean(valid),
  });
  const ledger = useQuery({
    queryKey: ['accounting', 'books', 'ledger', range],
    queryFn: () => fetchLedgerBook(range.from, range.to),
    enabled: tab === 'ledger' && Boolean(valid),
  });
  const active = tab === 'journal' ? journal : ledger;

  return (
    <Container component="main" maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <HomeBackButton />
        <Typography variant="h5" component="h1">
          Libros oficiales
        </Typography>
      </Box>
      <Stack spacing={2}>
        <PeriodFilter from={range.from} to={range.to} onChange={setRange} />
        <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="Libro">
          <Tab value="journal" label="Libro diario" />
          <Tab value="ledger" label="Libro mayor y balances" />
        </Tabs>
        {!valid && (
          <Alert severity="warning">La fecha inicial no puede ser posterior a la final.</Alert>
        )}
        {active.isLoading && (
          <Box
            sx={{ display: 'flex', justifyContent: 'center', py: 4 }}
            role="status"
            aria-label="Cargando"
          >
            <CircularProgress />
          </Box>
        )}
        {active.isError && <Alert severity="error">No se pudo cargar el libro.</Alert>}

        {tab === 'journal' && journal.data && (
          <Card variant="outlined">
            <CardContent sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label="Libro diario">
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Comprobante / cuenta</TableCell>
                    <TableCell align="right">Débito</TableCell>
                    <TableCell align="right">Crédito</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {journal.data.entries.flatMap((entry) => [
                    <TableRow key={entry.id} sx={{ bgcolor: 'action.hover' }}>
                      <TableCell>{entry.entryDate}</TableCell>
                      <TableCell colSpan={3}>
                        <strong>{entry.description}</strong>
                      </TableCell>
                    </TableRow>,
                    ...entry.lines.map((line, i) => (
                      <TableRow key={`${entry.id}-${i}`}>
                        <TableCell />
                        <TableCell>
                          {line.accountCode} · {line.accountName}
                        </TableCell>
                        <TableCell align="right">
                          {Number(line.debit) ? m(line.debit) : ''}
                        </TableCell>
                        <TableCell align="right">
                          {Number(line.credit) ? m(line.credit) : ''}
                        </TableCell>
                      </TableRow>
                    )),
                  ])}
                  <TableRow>
                    <TableCell colSpan={2}>
                      <strong>Totales ({journal.data.entries.length} asientos)</strong>
                    </TableCell>
                    <TableCell align="right">
                      <strong>{m(journal.data.totalDebit)}</strong>
                    </TableCell>
                    <TableCell align="right">
                      <strong>{m(journal.data.totalCredit)}</strong>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {tab === 'ledger' && ledger.data && (
          <Card variant="outlined">
            <CardContent sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label="Libro mayor y balances">
                <TableHead>
                  <TableRow>
                    <TableCell>Cuenta</TableCell>
                    <TableCell align="right">Saldo inicial</TableCell>
                    <TableCell align="right">Débitos</TableCell>
                    <TableCell align="right">Créditos</TableCell>
                    <TableCell align="right">Saldo final</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ledger.data.accounts.map((a) => (
                    <TableRow key={a.accountId}>
                      <TableCell>
                        {a.code} · {a.name}
                      </TableCell>
                      <TableCell align="right">{m(a.openingBalance)}</TableCell>
                      <TableCell align="right">{m(a.debit)}</TableCell>
                      <TableCell align="right">{m(a.credit)}</TableCell>
                      <TableCell align="right">{m(a.closingBalance)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={2}>
                      <strong>Totales del período</strong>
                    </TableCell>
                    <TableCell align="right">
                      <strong>{m(ledger.data.totalDebit)}</strong>
                    </TableCell>
                    <TableCell align="right">
                      <strong>{m(ledger.data.totalCredit)}</strong>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
              <Typography variant="caption" color="text.secondary">
                Los saldos se muestran con el signo de la naturaleza de cada cuenta: positivo en su
                lado normal.
              </Typography>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  );
}

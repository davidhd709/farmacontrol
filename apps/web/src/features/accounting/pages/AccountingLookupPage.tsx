import { useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
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
import type { ThirdPartyDto } from '@farmacia/contracts';
import { fetchGeneralLedger, fetchThirdPartyStatement } from '../api/accounting.api';
import { AccountAutocomplete } from '../components/AccountAutocomplete';
import { ThirdPartyAutocomplete } from '../../third-parties/components/ThirdPartyAutocomplete';
import { PayableStatementTable } from '../../payables/components/PayableStatementTable';
import { AGING_LABELS, AgingSummaryCards } from '../../../components/AgingSummaryCards';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { quickRange } from '../../../components/QuickDateRange';

const money = (value: string) =>
  `$${Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Total({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, flex: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>
        {money(value)}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {help}
      </Typography>
    </Paper>
  );
}

/** Movimientos de la cuenta elegida en el periodo, con saldo inicial y final. */
function AccountLedger({ accountId }: { accountId: string }) {
  const month = quickRange('this_month');
  const [fromDate, setFromDate] = useState(month.from);
  const [toDate, setToDate] = useState(month.to);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['general-ledger', accountId, fromDate, toDate],
    queryFn: () => fetchGeneralLedger(accountId, fromDate, toDate),
    enabled: Boolean(fromDate && toDate),
  });
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Desde"
          type="date"
          size="small"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Hasta"
          type="date"
          size="small"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>
      {isLoading && <CircularProgress size={24} />}
      {isError && <Alert severity="error">{(error as Error).message}</Alert>}
      {data && (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Total label="Saldo inicial" value={data.initialBalance} help={`Al ${data.fromDate}`} />
            <Total label="Débitos" value={data.totalDebit} help="Del periodo" />
            <Total label="Créditos" value={data.totalCredit} help="Del periodo" />
            <Total label="Saldo final" value={data.finalBalance} help={`Al ${data.toDate}`} />
          </Stack>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table size="small" aria-label="Movimientos de la cuenta">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Fecha</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Descripción</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    Débito
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    Crédito
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    Saldo
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.movements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                      Sin movimientos en el periodo.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.movements.map((m) => (
                    <TableRow key={`${m.journalEntryId}-${m.debit}-${m.credit}`}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{m.date}</TableCell>
                      <TableCell>{m.description}</TableCell>
                      <TableCell align="right">{Number(m.debit) ? money(m.debit) : ''}</TableCell>
                      <TableCell align="right">{Number(m.credit) ? money(m.credit) : ''}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {money(m.balanceAfter)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Stack>
  );
}

/** Estado de cuenta automático del tercero: lo que nos debe y lo que le debemos. */
function ThirdPartyStatement({ thirdPartyId }: { thirdPartyId: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['third-party-statement', thirdPartyId],
    queryFn: () => fetchThirdPartyStatement(thirdPartyId),
  });
  if (isLoading) return <CircularProgress size={24} />;
  if (isError) return <Alert severity="error">{(error as Error).message}</Alert>;
  if (!data) return null;
  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Total
          label="Nos debe (cartera)"
          value={data.totalOwedToUs}
          help={data.isCustomer ? 'Facturas a crédito pendientes' : 'No es cliente'}
        />
        <Total
          label="Le debemos (cuentas por pagar)"
          value={data.totalWeOwe}
          help={data.isSupplier ? 'Facturas y causaciones pendientes' : 'No es proveedor'}
        />
        <Total
          label="Saldo neto"
          value={data.netBalance}
          help={Number(data.netBalance) >= 0 ? 'A favor de la empresa' : 'A favor del tercero'}
        />
      </Stack>

      {data.receivables && (
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Lo que nos debe
          </Typography>
          <Stack spacing={1.5}>
            <AgingSummaryCards aging={data.receivables.aging} />
            {data.receivables.items.length === 0 ? (
              <Typography color="text.secondary">Sin facturas a crédito pendientes.</Typography>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                <Table size="small" aria-label="Cartera del tercero">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Factura</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Fecha</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Vence</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Edad</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        Total
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        Abonado
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        Saldo
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.receivables.items.map((r) => (
                      <TableRow key={r.receivableId}>
                        <TableCell sx={{ fontWeight: 600 }}>{r.invoiceNumber ?? '—'}</TableCell>
                        <TableCell>{r.documentDate}</TableCell>
                        <TableCell>{r.dueDate}</TableCell>
                        <TableCell>{AGING_LABELS[r.agingBucket]}</TableCell>
                        <TableCell align="right">{money(r.totalAmount)}</TableCell>
                        <TableCell align="right">{money(r.amountPaid)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {money(r.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Stack>
        </Box>
      )}

      {data.payables && (
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Lo que le debemos
          </Typography>
          <Stack spacing={1.5}>
            <AgingSummaryCards aging={data.payables.aging} />
            <Paper variant="outlined" sx={{ borderRadius: 2 }}>
              <PayableStatementTable items={data.payables.items} />
            </Paper>
          </Stack>
        </Box>
      )}

      {!data.isCustomer && !data.isSupplier && (
        <Alert severity="info" variant="outlined">
          El tercero no está registrado como cliente ni como proveedor: no tiene cartera ni cuentas
          por pagar.
        </Alert>
      )}
    </Stack>
  );
}

/** Buscador rápido de cuentas (código o nombre) y de terceros con su estado de cuenta. */
export function AccountingLookupPage() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [thirdParty, setThirdParty] = useState<ThirdPartyDto | null>(null);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <HomeBackButton />
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Consulta de Cuentas y Terceros
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Busca una cuenta por código o nombre, o un tercero para ver su estado de cuenta.
          </Typography>
        </Box>
      </Box>

      <Stack spacing={3}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
          <Typography component="h2" variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Cuentas
          </Typography>
          <Box sx={{ maxWidth: 560, mb: accountId ? 2.5 : 0 }}>
            <AccountAutocomplete value={accountId} onChange={(a) => setAccountId(a?.id ?? null)} />
          </Box>
          {accountId && <AccountLedger key={accountId} accountId={accountId} />}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
          <Typography component="h2" variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Terceros
          </Typography>
          <Box sx={{ maxWidth: 560, mb: thirdParty ? 2.5 : 0 }}>
            <ThirdPartyAutocomplete
              value={thirdParty}
              onChange={setThirdParty}
              label="Buscar tercero (documento o nombre)"
              showQuickCreate={false}
            />
          </Box>
          {thirdParty && <ThirdPartyStatement thirdPartyId={thirdParty.id} />}
        </Paper>
      </Stack>
    </Box>
  );
}

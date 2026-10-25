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
  TextField,
  Typography,
} from '@mui/material';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { formatMoney, toCents } from '../../../utils/money';
import { PeriodFilter, localToday, monthStart } from '../../accounting/components/PeriodFilter';
import {
  fetchExogenousDraft,
  fetchIcaDraft,
  fetchVatDraft,
  fetchWithholdingDraft,
} from '../api/tax-reports.api';

type DraftTab = 'vat' | 'withholdings' | 'ica' | 'exogenous';
const m = (value: string) => formatMoney(toCents(value));
const TREATMENT_LABELS: Record<string, string> = {
  GRAVADO: 'Gravado',
  EXENTO: 'Exento',
  EXCLUIDO: 'Excluido',
  NO_RESPONSABLE: 'Sin IVA (no responsable)',
  SIN_MOTOR_TRIBUTARIO: 'Sin motor tributario',
};

function Rows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <Table size="small">
      <TableBody>
        {rows.map(([label, value]) => (
          <TableRow key={label}>
            <TableCell>{label}</TableCell>
            <TableCell align="right">{value}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Borradores tributarios (ADR-006, F8): formulario 300, 350, ICA e información exógena,
 * calculados desde las instantáneas del motor. Apoyo para la contadora, no el formulario oficial.
 */
export function TaxDraftsPage() {
  const [tab, setTab] = useState<DraftTab>('vat');
  const [range, setRange] = useState({ from: monthStart(), to: localToday() });
  const [year, setYear] = useState(Number(localToday().slice(0, 4)));
  const valid = Boolean(range.from && range.to && range.from <= range.to);
  const vat = useQuery({
    queryKey: ['tax-drafts', 'vat', range],
    queryFn: () => fetchVatDraft(range.from, range.to),
    enabled: tab === 'vat' && valid,
  });
  const wh = useQuery({
    queryKey: ['tax-drafts', 'wh', range],
    queryFn: () => fetchWithholdingDraft(range.from, range.to),
    enabled: tab === 'withholdings' && valid,
  });
  const ica = useQuery({
    queryKey: ['tax-drafts', 'ica', range],
    queryFn: () => fetchIcaDraft(range.from, range.to),
    enabled: tab === 'ica' && valid,
  });
  const exo = useQuery({
    queryKey: ['tax-drafts', 'exo', year],
    queryFn: () => fetchExogenousDraft(year),
    enabled: tab === 'exogenous',
  });
  const active = { vat, withholdings: wh, ica, exogenous: exo }[tab];

  return (
    <Container component="main" maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <HomeBackButton />
        <Typography variant="h5" component="h1">
          Borradores tributarios
        </Typography>
      </Box>
      <Stack spacing={2}>
        <Alert severity="info">
          Son borradores de apoyo calculados desde las operaciones registradas. No reemplazan el
          diligenciamiento oficial ante la DIAN ni la revisión de la contadora o del asesor
          tributario.
        </Alert>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" aria-label="Borrador">
          <Tab value="vat" label="IVA (300)" />
          <Tab value="withholdings" label="Retenciones (350)" />
          <Tab value="ica" label="ICA" />
          <Tab value="exogenous" label="Exógena" />
        </Tabs>
        {tab === 'exogenous' ? (
          <TextField
            type="number"
            label="Año gravable"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            sx={{ maxWidth: 200 }}
          />
        ) : (
          <PeriodFilter from={range.from} to={range.to} onChange={setRange} />
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
        {active.isError && <Alert severity="error">No se pudo calcular el borrador.</Alert>}

        {tab === 'vat' && vat.data && (
          <Card variant="outlined">
            <CardContent sx={{ overflowX: 'auto' }}>
              <Typography variant="subtitle1" gutterBottom>
                Ingresos por tratamiento
              </Typography>
              <Table size="small" aria-label="Ingresos por tratamiento de IVA">
                <TableHead>
                  <TableRow>
                    <TableCell>Tratamiento</TableCell>
                    <TableCell align="right">Tarifa</TableCell>
                    <TableCell align="right">Base</TableCell>
                    <TableCell align="right">IVA</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vat.data.sales.map((r) => (
                    <TableRow key={`${r.treatment}-${r.ratePct}`}>
                      <TableCell>{TREATMENT_LABELS[r.treatment] ?? r.treatment}</TableCell>
                      <TableCell align="right">{Number(r.ratePct)} %</TableCell>
                      <TableCell align="right">{m(r.base)}</TableCell>
                      <TableCell align="right">{m(r.vat)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Box sx={{ mt: 2 }}>
                <Rows
                  rows={[
                    [
                      'Devoluciones en ventas: base / IVA',
                      `${m(vat.data.salesReturns.base)} / ${m(vat.data.salesReturns.vat)}`,
                    ],
                    [
                      'Compras gravadas: base / IVA',
                      vat.data.purchases
                        .map((p) => `${Number(p.ratePct)} %: ${m(p.base)} / ${m(p.vat)}`)
                        .join(' · ') || '—',
                    ],
                    [
                      'Devoluciones en compras: base / IVA',
                      `${m(vat.data.purchaseReturns.base)} / ${m(vat.data.purchaseReturns.vat)}`,
                    ],
                    ['IVA generado', m(vat.data.vatGenerated)],
                    ['IVA descontable', m(vat.data.vatDeductible)],
                    [
                      Number(vat.data.balance) >= 0 ? 'Saldo a pagar' : 'Saldo a favor',
                      m(vat.data.balance.replace('-', '')),
                    ],
                    [
                      'INC: base / impuesto / devuelto',
                      `${m(vat.data.inc.base)} / ${m(vat.data.inc.amount)} / ${m(vat.data.inc.returns)}`,
                    ],
                  ]}
                />
              </Box>
            </CardContent>
          </Card>
        )}

        {tab === 'withholdings' && wh.data && (
          <Card variant="outlined">
            <CardContent sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label="Retenciones practicadas por concepto">
                <TableHead>
                  <TableRow>
                    <TableCell>Retención</TableCell>
                    <TableCell>Concepto</TableCell>
                    <TableCell align="right">Base</TableCell>
                    <TableCell align="right">Valor</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {wh.data.concepts.map((c) => (
                    <TableRow key={`${c.taxType}-${c.ruleCode}`}>
                      <TableCell>{c.taxType}</TableCell>
                      <TableCell>{c.ruleCode ?? 'Tarifa municipal'}</TableCell>
                      <TableCell align="right">{m(c.base)}</TableCell>
                      <TableCell align="right">{m(c.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Box sx={{ mt: 2 }}>
                <Rows
                  rows={[
                    [
                      'Revertido en notas débito (fuente / IVA / ICA)',
                      `${m(wh.data.reversed.income)} / ${m(wh.data.reversed.vat)} / ${m(wh.data.reversed.ica)}`,
                    ],
                    ['Retención en la fuente neta', m(wh.data.totals.income)],
                    ['Retención de IVA neta', m(wh.data.totals.vat)],
                    ['Retención de ICA neta', m(wh.data.totals.ica)],
                    ['Total a declarar', m(wh.data.totals.total)],
                  ]}
                />
              </Box>
            </CardContent>
          </Card>
        )}

        {tab === 'ica' && ica.data && (
          <Card variant="outlined">
            <CardContent>
              <Rows
                rows={[
                  ['Ingresos brutos', m(ica.data.grossIncome)],
                  ['Devoluciones', m(ica.data.returns)],
                  ['Ingresos netos', m(ica.data.netIncome)],
                  [
                    'Actividad y tarifa',
                    ica.data.ratePerMil
                      ? `${ica.data.activity} · ${Number(ica.data.ratePerMil)} por mil`
                      : 'Sin ICA en el perfil tributario',
                  ],
                  ['Impuesto de industria y comercio', m(ica.data.tax)],
                  ['ReteICA practicada a proveedores', m(ica.data.withheldIca)],
                ]}
              />
            </CardContent>
          </Card>
        )}

        {tab === 'exogenous' && exo.data && (
          <Stack spacing={2}>
            <Card variant="outlined">
              <CardContent sx={{ overflowX: 'auto' }}>
                <Typography variant="subtitle1" gutterBottom>
                  Formato 1001 · Pagos a terceros y retenciones
                </Typography>
                <Table size="small" aria-label="Formato 1001">
                  <TableHead>
                    <TableRow>
                      <TableCell>NIT</TableCell>
                      <TableCell>Tercero</TableCell>
                      <TableCell align="right">Pago</TableCell>
                      <TableCell align="right">IVA</TableCell>
                      <TableCell align="right">Ret. fuente</TableCell>
                      <TableCell align="right">ReteIVA</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {exo.data.payments.map((p) => (
                      <TableRow key={p.taxId}>
                        <TableCell>{p.taxId}</TableCell>
                        <TableCell>{p.name}</TableCell>
                        <TableCell align="right">{m(p.amount)}</TableCell>
                        <TableCell align="right">{m(p.vat)}</TableCell>
                        <TableCell align="right">{m(p.withholdingIncome)}</TableCell>
                        <TableCell align="right">{m(p.withholdingVat)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardContent sx={{ overflowX: 'auto' }}>
                <Typography variant="subtitle1" gutterBottom>
                  Formato 1007 · Ingresos recibidos
                </Typography>
                <Table size="small" aria-label="Formato 1007">
                  <TableHead>
                    <TableRow>
                      <TableCell>Documento</TableCell>
                      <TableCell>Cliente</TableCell>
                      <TableCell align="right">Ingreso</TableCell>
                      <TableCell align="right">Devoluciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {exo.data.income.map((c) => (
                      <TableRow key={c.documentNumber}>
                        <TableCell>{c.documentNumber}</TableCell>
                        <TableCell>{c.name}</TableCell>
                        <TableCell align="right">{m(c.amount)}</TableCell>
                        <TableCell align="right">{m(c.returns)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}

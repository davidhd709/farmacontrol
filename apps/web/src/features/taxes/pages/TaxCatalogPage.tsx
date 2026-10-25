import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { TaxRuleDto } from '@farmacia/contracts';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { fetchTaxCatalog } from '../api/taxes.api';
import { REVIEW_PENDING_TEXT, TAX_TYPE_LABELS } from '../components/tax-labels';

function rateText(rule: TaxRuleDto): string {
  if (rule.taxType === 'RETEICA') {
    return `${Number(rule.rateMinPerMil)} a ${Number(rule.rateMaxPerMil)} por mil`;
  }
  return `${Number(rule.ratePct)} %`;
}

const APPLIES_LABELS = { GOODS: 'Bienes', SERVICES: 'Servicios', ANY: 'Todos' } as const;
const PAYEE_LABELS = { DECLARANT: 'Declarante', NON_DECLARANT: 'No declarante', ANY: '—' } as const;

/** Catálogo normativo colombiano vigente: solo lectura (ADR-006, F6). */
export function TaxCatalogPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['tax-catalog'],
    queryFn: fetchTaxCatalog,
  });
  if (isLoading) {
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
  if (isError || !data) {
    return <Alert severity="error">No se pudo cargar el catálogo normativo.</Alert>;
  }
  return (
    <Container component="main" maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <HomeBackButton />
        <Box>
          <Typography variant="h5" component="h1">
            Catálogo normativo tributario
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Reglas vigentes al {data.day}. Las mantiene el producto; un cambio normativo es una
            versión nueva.
          </Typography>
        </Box>
      </Box>
      <Stack spacing={3}>
        {data.pendingAdvisorReview && <Alert severity="warning">{REVIEW_PENDING_TEXT}</Alert>}
        <Card variant="outlined">
          <CardContent sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label="Reglas tributarias vigentes">
              <TableHead>
                <TableRow>
                  <TableCell>Impuesto</TableCell>
                  <TableCell>Regla</TableCell>
                  <TableCell>Tarifa</TableCell>
                  <TableCell>Base mínima</TableCell>
                  <TableCell>Aplica a</TableCell>
                  <TableCell>Referencia legal</TableCell>
                  <TableCell>Revisión</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>{TAX_TYPE_LABELS[rule.taxType]}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{rule.description}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {rule.code}
                      </Typography>
                    </TableCell>
                    <TableCell>{rateText(rule)}</TableCell>
                    <TableCell>
                      {rule.minBaseUvt ? `${Number(rule.minBaseUvt)} UVT` : '—'}
                    </TableCell>
                    <TableCell>
                      {APPLIES_LABELS[rule.appliesTo]}
                      {rule.payeeCondition !== 'ANY'
                        ? ` · ${PAYEE_LABELS[rule.payeeCondition]}`
                        : ''}
                    </TableCell>
                    <TableCell>{rule.legalReference}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={rule.reviewStatus === 'REVIEWED' ? 'Revisada' : 'Pendiente'}
                        color={rule.reviewStatus === 'REVIEWED' ? 'success' : 'warning'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              Unidad de Valor Tributario (UVT)
            </Typography>
            <Table size="small" aria-label="Valores de la UVT">
              <TableHead>
                <TableRow>
                  <TableCell>Año</TableCell>
                  <TableCell>Valor</TableCell>
                  <TableCell>Referencia legal</TableCell>
                  <TableCell>Revisión</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.uvt.map((u) => (
                  <TableRow key={u.year}>
                    <TableCell>{u.year}</TableCell>
                    <TableCell>${Number(u.value).toLocaleString('es-CO')}</TableCell>
                    <TableCell>{u.legalReference}</TableCell>
                    <TableCell>
                      {u.reviewStatus === 'REVIEWED' ? 'Revisada' : 'Pendiente'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}

import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { formatMoney, toCents } from '../../../utils/money';
import { fetchReconciliation } from '../api/accounting-books.api';

const m = (value: string) => formatMoney(toCents(value));

/** Conciliación contable (ADR-006, F8): contabilidad frente a los auxiliares operativos. */
export function ReconciliationPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['accounting', 'reconciliation'],
    queryFn: fetchReconciliation,
  });
  return (
    <Container component="main" maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <HomeBackButton />
        <Typography variant="h5" component="h1">
          Conciliación contable
        </Typography>
      </Box>
      {isLoading && (
        <Box
          sx={{ display: 'flex', justifyContent: 'center', py: 4 }}
          role="status"
          aria-label="Cargando"
        >
          <CircularProgress />
        </Box>
      )}
      {isError && <Alert severity="error">No se pudo cargar la conciliación.</Alert>}
      {data && (
        <Card variant="outlined">
          <CardContent sx={{ overflowX: 'auto' }}>
            <Alert severity={data.balanced ? 'success' : 'error'} sx={{ mb: 2 }}>
              Partida doble: débitos {m(data.totalDebit)} y créditos {m(data.totalCredit)} ·{' '}
              {data.balanced ? 'cuadran' : 'NO cuadran'}
            </Alert>
            <Table size="small" aria-label="Conciliación por cuenta">
              <TableHead>
                <TableRow>
                  <TableCell>Concepto</TableCell>
                  <TableCell align="right">Contabilidad</TableCell>
                  <TableCell align="right">Auxiliar operativo</TableCell>
                  <TableCell align="right">Diferencia</TableCell>
                  <TableCell>Estado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.key}>
                    <TableCell>
                      {item.label}
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        {item.detail}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{m(item.ledgerBalance)}</TableCell>
                    <TableCell align="right">{m(item.subledgerBalance)}</TableCell>
                    <TableCell align="right">{m(item.difference)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={item.ok ? 'success' : 'warning'}
                        label={item.ok ? 'Conciliado' : 'Con diferencia'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}

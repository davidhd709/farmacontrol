import { Alert, Button, Card, CardContent, Skeleton, Stack, Typography } from '@mui/material';
import type { UseQueryResult } from '@tanstack/react-query';
import type { InventoryValuationIssue, InventoryValuationReportDto } from '@farmacia/contracts';

export const valuationIssueLabel: Record<InventoryValuationIssue, string> = {
  MISSING_COST: 'Sin costo',
  MISSING_PRICE: 'Sin precio',
  MISSING_COST_AND_PRICE: 'Sin costo ni precio',
};

export function ValuationMarginSummary({
  query,
}: {
  query: UseQueryResult<InventoryValuationReportDto>;
}) {
  return (
    <Stack spacing={2}>
      <Card variant="outlined">
        <CardContent>
          <Typography component="h2" variant="subtitle2">
            Margen potencial
          </Typography>
          {query.isError ? (
            <Alert
              severity="error"
              action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
            >
              No disponible
            </Alert>
          ) : query.isPending ? (
            <Skeleton aria-label="Cargando margen potencial" width={160} />
          ) : (
            <Typography variant="h5">
              ${' '}
              {query.data.totalPotentialMargin.toLocaleString('es-CO', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            No es utilidad realizada: diferencia entre valor a precio de venta y valor al costo del
            inventario actual
          </Typography>
        </CardContent>
      </Card>
      {query.data && query.data.productsWithValuationIssues > 0 && (
        <Alert severity="warning">
          {query.data.productsWithValuationIssues} productos sin costo o precio: el total de margen
          potencial los excluye.
        </Alert>
      )}
    </Stack>
  );
}

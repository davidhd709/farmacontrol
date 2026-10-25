import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { FefoPreviewDto } from '@farmacia/contracts';

export function FefoAllocationSummary({
  data,
  loading,
  error,
  productNames,
}: {
  data?: FefoPreviewDto;
  loading: boolean;
  error: boolean;
  productNames: Record<string, string>;
}) {
  return (
    <Stack spacing={1} sx={{ mb: 2 }}>
      <Typography variant="subtitle2">Asignación FEFO automática</Typography>
      <Typography variant="caption">Asignación prevista; se confirma al cobrar</Typography>
      {loading && <Typography role="status">Consultando lotes disponibles…</Typography>}
      {error && (
        <Alert severity="warning">
          No se pudo cargar la vista previa; los lotes se asignarán al confirmar
        </Alert>
      )}
      {data?.lines.map((line, index) => (
        <Stack key={`${line.productId}-${index}`}>
          {line.shortfallBaseUnits > 0 && (
            <Alert severity="warning">
              {productNames[line.productId] ?? line.productId}: faltan {line.shortfallBaseUnits}{' '}
              unidades base. Ajusta el carrito antes de confirmar.
            </Alert>
          )}
          <Accordion disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>
                {productNames[line.productId] ?? line.productId} · Línea {index + 1}:{' '}
                {line.requiredBaseUnits} unidades base
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                {line.allocations.map((allocation) => (
                  <Typography key={allocation.lotId} variant="body2">
                    Lote {allocation.lotNumber} · Vencimiento:{' '}
                    {new Intl.DateTimeFormat('es-CO', {
                      dateStyle: 'long',
                      timeZone: 'UTC',
                    }).format(new Date(`${allocation.expirationDate}T00:00:00Z`))}{' '}
                    · {allocation.quantityBaseUnits} unidades base
                  </Typography>
                ))}
                {line.allocations.length === 0 && <Typography>Sin lotes disponibles.</Typography>}
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Stack>
      ))}
    </Stack>
  );
}

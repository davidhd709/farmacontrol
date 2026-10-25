import { Autocomplete, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { fetchFefoPreview } from '../api/sales.api';

/**
 * Selección de las series que se entregan en una línea SERIAL (ADR-006, F4). Las series
 * disponibles vienen de la vista previa, que no reserva: la confirmación vuelve a bloquearlas.
 */
export function PosSerialPicker({
  productId,
  productName,
  requiredUnits,
  value,
  excluded,
  onChange,
}: {
  productId: string;
  productName: string;
  requiredUnits: number;
  value: string[];
  /** Series ya elegidas en otras líneas del mismo producto */
  excluded: string[];
  onChange: (serials: string[]) => void;
}) {
  const query = useQuery({
    queryKey: ['pos-serials', productId],
    queryFn: ({ signal }) =>
      fetchFefoPreview({ items: [{ productId, quantityCommercial: 1 }] }, signal),
    staleTime: 10_000,
    retry: false,
  });
  const available = query.data?.lines[0]?.availableSerials ?? [];
  const options = available.filter((serial) => !excluded.includes(serial));
  const missing = requiredUnits - value.length;

  return (
    <Autocomplete
      multiple
      size="small"
      options={options}
      value={value}
      loading={query.isLoading}
      onChange={(_, serials) => onChange(serials.slice(0, requiredUnits))}
      getOptionDisabled={(serial) => value.length >= requiredUnits && !value.includes(serial)}
      noOptionsText={query.isError ? 'No se pudieron cargar las series' : 'Sin series disponibles'}
      sx={{ mt: 0.75, minWidth: 220 }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={`Series de ${productName} (${value.length}/${requiredUnits})`}
          error={missing !== 0}
          helperText={
            missing > 0
              ? `Elija ${missing} serie${missing === 1 ? '' : 's'} más`
              : missing < 0
                ? `Sobran ${-missing} serie${missing === -1 ? '' : 's'}: quite las que no entrega`
                : undefined
          }
        />
      )}
    />
  );
}

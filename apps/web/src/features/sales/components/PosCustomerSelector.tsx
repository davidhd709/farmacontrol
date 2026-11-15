import { useState } from 'react';
import { Alert, Autocomplete, Button, Stack, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { SYSTEM_PERMISSIONS, type CustomerDto } from '@farmacia/contracts';
import { fetchCustomers, fetchDefaultCustomer } from '../../customers/api/customers.api';
import { usePermissions } from '../../auth/hooks/usePermissions';
import { PermissionGate } from '../../auth/components/PermissionGate';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';

export function PosCustomerSelector({
  onSelect,
  onCreate,
  showDefaultAction = true,
}: {
  onSelect: (customer: CustomerDto) => void;
  onCreate: () => void;
  /** Oculta «Volver a Consumidor final» cuando ese ya es el cliente de la venta */
  showDefaultAction?: boolean;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingDefault, setLoadingDefault] = useState(false);
  const term = text.trim();
  const debounced = useDebouncedValue(term, 250);
  const { hasPermission } = usePermissions();
  const canRead = hasPermission(SYSTEM_PERMISSIONS.CUSTOMERS_READ);
  const query = useQuery({
    queryKey: ['pos-customers', term],
    queryFn: ({ signal }) => fetchCustomers({ search: term, isActive: true }, signal),
    enabled: canRead && term.length >= 2 && term === debounced,
    retry: false,
  });
  return (
    <Stack spacing={0.5} sx={{ minWidth: { xs: 0, sm: 230 }, width: { xs: '100%', sm: 260 } }}>
      {canRead && (
        <Autocomplete
          clearText="Limpiar búsqueda"
          closeText="Cerrar resultados"
          openText="Ver resultados"
          value={null}
          inputValue={text}
          options={query.data?.items ?? []}
          filterOptions={(options) => options}
          getOptionLabel={(customer) => `${customer.name} · ${customer.documentNumber}`}
          getOptionKey={(customer) => customer.id}
          loading={query.isFetching}
          loadingText="Buscando clientes…"
          noOptionsText={term.length < 2 ? 'Escribe al menos 2 caracteres' : 'Sin clientes'}
          onInputChange={(_, value, reason) => {
            if (reason === 'input' || reason === 'clear') setText(value);
          }}
          onChange={(_, customer) => {
            if (customer) {
              onSelect(customer);
              setText('');
            }
          }}
          renderInput={(params) => (
            <TextField {...params} size="small" label="Buscar cliente existente" />
          )}
        />
      )}
      {query.isError && <Alert severity="warning">No se pudieron buscar los clientes.</Alert>}
      <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }} useFlexGap>
        <PermissionGate permission={SYSTEM_PERMISSIONS.CUSTOMERS_CREATE}>
          <Button size="small" onClick={onCreate}>
            Crear cliente nuevo
          </Button>
        </PermissionGate>
        {showDefaultAction && (
          <Button
            size="small"
            disabled={loadingDefault}
            onClick={async () => {
              setLoadingDefault(true);
              setError(null);
              try {
                onSelect(await fetchDefaultCustomer());
              } catch {
                setError('No se pudo cargar Consumidor final. Intenta nuevamente.');
              } finally {
                setLoadingDefault(false);
              }
            }}
          >
            Volver a Consumidor final
          </Button>
        )}
      </Stack>
      {error && <Alert severity="warning">{error}</Alert>}
    </Stack>
  );
}

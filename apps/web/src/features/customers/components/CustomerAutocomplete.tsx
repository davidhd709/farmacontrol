import { useState } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { CustomerDto } from '@farmacia/contracts';
import { fetchCustomers } from '../api/customers.api';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';

/**
 * Selector de cliente por nombre o documento. Solo exige `customers:read`, así lo usa el rol
 * cartera al registrar un recibo de caja sin acceso al maestro de terceros.
 */
export function CustomerAutocomplete({
  value,
  onChange,
  label = 'Cliente',
  required = false,
}: {
  value: CustomerDto | null;
  onChange: (customer: CustomerDto | null) => void;
  label?: string;
  required?: boolean;
}) {
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const term = search.trim();
  const debounced = useDebouncedValue(term, 250);
  const query = useQuery({
    queryKey: ['customer-autocomplete', debounced],
    queryFn: ({ signal }) =>
      fetchCustomers({ search: debounced || undefined, isActive: true }, signal),
    retry: false,
  });
  return (
    <Autocomplete
      fullWidth
      size="small"
      clearText="Limpiar"
      closeText="Cerrar"
      openText="Ver clientes"
      value={value}
      inputValue={text}
      options={query.data?.items ?? []}
      filterOptions={(options) => options}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      getOptionLabel={(customer) => `${customer.name} · ${customer.documentNumber}`}
      getOptionKey={(customer) => customer.id}
      loading={query.isFetching}
      loadingText="Buscando clientes…"
      noOptionsText={query.isError ? 'No se pudieron buscar los clientes.' : 'Sin clientes'}
      onInputChange={(_, next, reason) => {
        setText(next);
        if (reason === 'input' || reason === 'clear') setSearch(next);
      }}
      onChange={(_, customer) => onChange(customer)}
      renderInput={(params) => (
        <TextField {...params} label={label} required={required} placeholder="Nombre o documento" />
      )}
    />
  );
}

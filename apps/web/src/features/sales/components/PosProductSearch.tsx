import { useEffect, useRef, useState, type RefObject } from 'react';
import { Alert, Autocomplete, Box, Chip, TextField, Typography } from '@mui/material';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductDto } from '@farmacia/contracts';
import { fetchProducts, lookupProductByCode } from '../../catalog/api/products.api';
import { ApiError } from '../../../api/http-client';
import { inventoryControlModeLabel } from '../../catalog/utils/inventory-control';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { formatMoney, toCents } from '../../../utils/money';

function productSearchOptions(term: string) {
  return queryOptions({
    queryKey: ['pos-products', term],
    queryFn: ({ signal }) => fetchProducts({ search: term }, signal),
    staleTime: 30_000,
    retry: false,
  });
}
const isSellable = (product: ProductDto) =>
  product.isActive && (product.availableStock === undefined || product.availableStock > 0);

export function PosProductSearch({
  onSelect,
  inputRef,
}: {
  /** presentationId llega cuando el código leído es el de una presentación */
  onSelect: (product: ProductDto, presentationId?: string | null) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const term = text.trim();
  const debounced = useDebouncedValue(term, 250);
  const currentText = useRef('');
  const pendingScan = useRef<string | null>(null);
  // Opción marcada con las flechas: Enter debe elegirla a ella, no el primer resultado.
  const highlighted = useRef<ProductDto | null>(null);
  const mounted = useRef(true);
  const queryClient = useQueryClient();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const query = useQuery({
    ...productSearchOptions(term),
    enabled: term.length >= 2 && debounced === term,
  });
  const clearAndFocus = () => {
    currentText.current = '';
    setText('');
    // La pistola escribe el siguiente código sin que el cajero toque la pantalla
    inputRef.current?.focus();
  };
  const select = (product: ProductDto, presentationId: string | null = null) => {
    onSelect(product, presentationId);
    clearAndFocus();
    setError(null);
  };
  const scan = async () => {
    const exactTerm = currentText.current;
    if (exactTerm.length < 2 || pendingScan.current === exactTerm) return;
    pendingScan.current = exactTerm;
    setScanning(true);
    setError(null);
    try {
      // Pistola lectora: la coincidencia exacta del código de barras o del código interno
      // gana; si no hay, el texto escrito a mano agrega el primer producto vendible
      const [scanned, result] = await Promise.all([
        // Un código asignado a dos productos (409) se informa; otro fallo de la búsqueda
        // exacta deja que el texto escrito resuelva la venta
        lookupProductByCode(exactTerm).catch((err: unknown) =>
          err instanceof ApiError && err.status === 409 ? err : null,
        ),
        queryClient.fetchQuery(productSearchOptions(exactTerm)),
      ]);
      if (!mounted.current || currentText.current !== exactTerm) return;
      if (scanned instanceof ApiError) {
        setError(scanned.message);
        clearAndFocus();
        return;
      }
      if (scanned && isSellable(scanned.product)) {
        select(scanned.product, scanned.presentationId);
        return;
      }
      const product = scanned ? undefined : result.items.find(isSellable);
      if (product) select(product);
      else {
        setError(
          scanned
            ? `"${scanned.product.name}" no tiene existencias disponibles para la venta.`
            : `El código o producto "${exactTerm}" no existe o no tiene existencias para la venta.`,
        );
        clearAndFocus();
      }
    } catch {
      if (mounted.current && currentText.current === exactTerm)
        setError('No se pudieron buscar los productos. Intenta nuevamente.');
    } finally {
      if (pendingScan.current === exactTerm) {
        pendingScan.current = null;
        if (mounted.current) setScanning(false);
      }
    }
  };
  return (
    <>
      <Autocomplete
        clearText="Limpiar búsqueda"
        closeText="Cerrar resultados"
        openText="Ver resultados"
        data-testid="pos-product-autocomplete"
        value={null}
        inputValue={text}
        options={(query.data?.items ?? []).filter((product) => product.isActive)}
        filterOptions={(options) => options}
        getOptionLabel={(product) => `${product.code} - ${product.name} (${product.baseUnit})`}
        getOptionDisabled={(product) => !isSellable(product)}
        loading={query.isFetching || scanning}
        loadingText="Buscando productos…"
        noOptionsText={term.length < 2 ? 'Escribe al menos 2 caracteres' : 'Sin productos'}
        onInputChange={(_, value, reason) => {
          if (reason === 'input' || reason === 'clear') {
            currentText.current = value.trim();
            highlighted.current = null;
            setText(value);
            setError(null);
          }
        }}
        onChange={(_, product) => {
          if (product) select(product);
        }}
        onHighlightChange={(_, product, reason) => {
          highlighted.current = reason === 'keyboard' ? product : null;
        }}
        onClose={() => {
          highlighted.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && highlighted.current) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            (event as typeof event & { defaultMuiPrevented: boolean }).defaultMuiPrevented = true;
            void scan();
          }
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            inputRef={inputRef}
            label="Buscar producto por nombre, código o escáner..."
            placeholder="Ej: Amoxicilina, MED-001..."
            size="small"
            autoFocus
          />
        )}
        renderOption={(props, opt) => {
          const { key, ...optionProps } = props;
          const isOutOfStock = opt.availableStock !== undefined && opt.availableStock <= 0;
          return (
            <li {...optionProps} key={key}>
              <Box
                sx={{
                  width: '100%',
                  py: 0.5,
                  opacity: isOutOfStock ? 0.6 : 1,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {opt.name}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {opt.availableStock !== undefined && (
                      <Chip
                        size="small"
                        label={
                          isOutOfStock ? 'Sin stock' : `Disp: ${opt.availableStock} ${opt.baseUnit}`
                        }
                        color={
                          isOutOfStock ? 'error' : opt.availableStock > 10 ? 'success' : 'warning'
                        }
                        variant={isOutOfStock ? 'filled' : 'outlined'}
                        sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                      />
                    )}
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}
                    >
                      {formatMoney(toCents(opt.basePrice))} / {opt.baseUnit}
                    </Typography>
                  </Box>
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    gap: 0.8,
                    alignItems: 'center',
                    mt: 0.5,
                    flexWrap: 'wrap',
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    SKU: {opt.code} • Base: {opt.baseUnit} •{' '}
                    {inventoryControlModeLabel(opt.inventoryControlMode)}
                  </Typography>
                  {opt.presentations &&
                    opt.presentations.length > 0 &&
                    opt.presentations.map((pr) => (
                      <Chip
                        key={pr.id}
                        size="small"
                        label={`${pr.name} (x${pr.conversionFactor}): ${formatMoney(toCents(pr.price))}`}
                        variant={pr.isDefault ? 'filled' : 'outlined'}
                        color={pr.isDefault ? 'primary' : 'default'}
                        sx={{ height: 18, fontSize: '0.65rem' }}
                      />
                    ))}
                </Box>
              </Box>
            </li>
          );
        }}
      />
      {(error || query.isError) && (
        <Alert severity="warning">
          {error || 'No se pudieron buscar los productos. Intenta nuevamente.'}
        </Alert>
      )}
    </>
  );
}

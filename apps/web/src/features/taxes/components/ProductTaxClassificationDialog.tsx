import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { ProductDto, ProductTaxOperation } from '@farmacia/contracts';
import {
  activateProductTaxProfile,
  createProductTaxProfile,
  fetchProductTaxProfiles,
  fetchTaxCatalog,
} from '../api/taxes.api';
import { REVIEW_PENDING_TEXT } from './tax-labels';

function localIsoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

const OPERATION_LABELS: Record<ProductTaxOperation, string> = { SALE: 'Venta', PURCHASE: 'Compra' };

/**
 * Clasificación tributaria del producto con reglas del catálogo normativo (ADR-006, F6): la
 * tarifa y el tratamiento vienen de la regla. Se registra y se activa desde la fecha indicada.
 */
export function ProductTaxClassificationDialog({
  product,
  onClose,
}: {
  product: ProductDto | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const open = Boolean(product);
  const catalog = useQuery({ queryKey: ['tax-catalog'], queryFn: fetchTaxCatalog, enabled: open });
  const profiles = useQuery({
    queryKey: ['product-tax-profiles', product?.id],
    queryFn: () => fetchProductTaxProfiles(product!.id),
    enabled: open,
  });
  const [operation, setOperation] = useState<ProductTaxOperation>('SALE');
  const [taxRuleCode, setTaxRuleCode] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(localIsoDate(new Date()));
  const [documentReference, setDocumentReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rules = (catalog.data?.rules ?? []).filter(
    (r) => r.taxType === 'IVA' || (r.taxType === 'INC' && operation === 'SALE'),
  );

  const submit = async () => {
    if (!product) return;
    setError(null);
    setSaving(true);
    try {
      const created = await createProductTaxProfile({
        productId: product.id,
        operation,
        taxRuleCode,
        effectiveFrom,
        documentReference,
      });
      await activateProductTaxProfile(created.id);
      setTaxRuleCode('');
      await queryClient.invalidateQueries({ queryKey: ['product-tax-profiles', product.id] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la clasificación.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth aria-labelledby="tax-class-title">
      <DialogTitle id="tax-class-title">Clasificación tributaria · {product?.name}</DialogTitle>
      <DialogContent dividers>
        {catalog.data?.pendingAdvisorReview && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {REVIEW_PENDING_TEXT}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField
              select
              fullWidth
              label="Operación"
              value={operation}
              onChange={(e) => {
                setOperation(e.target.value as ProductTaxOperation);
                setTaxRuleCode('');
              }}
            >
              <MenuItem value="SALE">Venta</MenuItem>
              <MenuItem value="PURCHASE">Compra</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField
              select
              fullWidth
              label="Regla del catálogo"
              value={taxRuleCode}
              onChange={(e) => setTaxRuleCode(e.target.value)}
            >
              {rules.map((r) => (
                <MenuItem key={r.code} value={r.code}>
                  {r.description}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              type="date"
              fullWidth
              label="Vigente desde"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              required
              label="Soporte de la clasificación"
              placeholder="Ej.: concepto del asesor tributario, artículo del Estatuto"
              value={documentReference}
              onChange={(e) => setDocumentReference(e.target.value)}
            />
          </Grid>
        </Grid>
        <Typography variant="subtitle2" gutterBottom>
          Clasificaciones registradas
        </Typography>
        <Table size="small" aria-label="Clasificaciones tributarias del producto">
          <TableHead>
            <TableRow>
              <TableCell>Operación</TableCell>
              <TableCell>Impuesto</TableCell>
              <TableCell>Regla</TableCell>
              <TableCell>Tarifa</TableCell>
              <TableCell>Vigencia</TableCell>
              <TableCell>Estado</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(profiles.data ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell>{OPERATION_LABELS[p.operation]}</TableCell>
                <TableCell>{p.taxType}</TableCell>
                <TableCell>{p.taxRuleCode ?? 'Manual (anterior al catálogo)'}</TableCell>
                <TableCell>{p.ratePct !== null ? `${Number(p.ratePct)} %` : '—'}</TableCell>
                <TableCell>
                  {p.effectiveFrom}
                  {p.effectiveTo ? ` a ${p.effectiveTo}` : ' en adelante'}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={p.status === 'ACTIVE' ? 'Activa' : 'Borrador'}
                  />
                </TableCell>
              </TableRow>
            ))}
            {profiles.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  Sin clasificación: con perfil tributario no podrá venderse.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cerrar
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving || !taxRuleCode || !documentReference.trim()}
        >
          Clasificar y activar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

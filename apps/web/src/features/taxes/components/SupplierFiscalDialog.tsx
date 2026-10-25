import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Stack,
} from '@mui/material';
import { RUT_RESPONSIBILITIES } from '@farmacia/contracts';
import { fetchSupplierById, updateSupplier } from '../../suppliers/api/suppliers.api';

/**
 * Datos tributarios del proveedor (ADR-006, F6): responsabilidades del RUT y si declara renta.
 * El motor los usa para el IVA de la compra y las retenciones.
 */
export function SupplierFiscalDialog({
  supplierId,
  supplierName,
  onClose,
}: {
  supplierId: string | null;
  supplierName: string;
  onClose: () => void;
}) {
  const [responsibilities, setResponsibilities] = useState<string[]>([]);
  const [declarant, setDeclarant] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supplierId) return;
    setError(null);
    fetchSupplierById(supplierId)
      .then((s) => {
        setResponsibilities(s.taxResponsibilities ?? []);
        setDeclarant(s.isIncomeTaxDeclarant ?? true);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'No se pudo cargar.'));
  }, [supplierId]);

  const toggle = (code: string) =>
    setResponsibilities((current) => {
      if (current.includes(code)) return current.filter((c) => c !== code);
      const exclusive = code === '48' ? '49' : code === '49' ? '48' : null;
      return [...current.filter((c) => c !== exclusive), code];
    });

  const save = async () => {
    if (!supplierId) return;
    setSaving(true);
    setError(null);
    try {
      await updateSupplier(supplierId, {
        taxResponsibilities: responsibilities,
        isIncomeTaxDeclarant: declarant,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudieron guardar los datos tributarios.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(supplierId)}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="supplier-fiscal-title"
    >
      <DialogTitle id="supplier-fiscal-title">Datos tributarios · {supplierName}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <div>
            <FormLabel component="legend">Responsabilidades del RUT</FormLabel>
            <FormGroup>
              {RUT_RESPONSIBILITIES.map((r) => (
                <FormControlLabel
                  key={r.code}
                  control={
                    <Checkbox
                      checked={responsibilities.includes(r.code)}
                      onChange={() => toggle(r.code)}
                    />
                  }
                  label={`${r.code} · ${r.label}`}
                />
              ))}
            </FormGroup>
          </div>
          <FormControlLabel
            control={
              <Checkbox checked={declarant} onChange={(e) => setDeclarant(e.target.checked)} />
            }
            label="Declara impuesto de renta (define la tarifa de retención en la fuente)"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancelar
        </Button>
        <Button variant="contained" onClick={save} disabled={saving}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

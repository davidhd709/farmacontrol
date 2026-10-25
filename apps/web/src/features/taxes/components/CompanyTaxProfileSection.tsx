import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  ICA_ACTIVITIES,
  RUT_RESPONSIBILITIES,
  type CompanyTaxProfileDto,
  type IcaActivity,
} from '@farmacia/contracts';
import { createCompanyTaxProfile, fetchCompanyTaxProfiles } from '../api/taxes.api';
import { ICA_ACTIVITY_LABELS } from './tax-labels';

function localIsoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

const responsibilityLabel = (code: string) =>
  RUT_RESPONSIBILITIES.find((r) => r.code === code)?.label ?? code;

function DerivedSummary({ profile }: { profile: CompanyTaxProfileDto }) {
  const items: Array<[boolean, string]> = [
    [profile.derived.vatResponsible, 'Cobra IVA en sus ventas'],
    [profile.derived.withholdsIncome, 'Practica retención en la fuente'],
    [profile.derived.withholdsVat, 'Practica retención de IVA'],
    [profile.derived.withholdsIca, `Practica ReteICA (${Number(profile.icaRatePerMil)} por mil)`],
  ];
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {items.map(([on, label]) => (
        <Chip key={label} size="small" variant="outlined" label={`${on ? 'Sí' : 'No'}: ${label}`} />
      ))}
    </Stack>
  );
}

/**
 * Perfil tributario de la empresa (ADR-006, F6): responsabilidades del RUT e ICA. Registrar
 * la primera versión activa el motor tributario en ventas y compras.
 */
export function CompanyTaxProfileSection({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['company-tax-profiles'],
    queryFn: fetchCompanyTaxProfiles,
  });
  const [effectiveFrom, setEffectiveFrom] = useState(localIsoDate(new Date()));
  const [responsibilities, setResponsibilities] = useState<string[]>(['48']);
  const [icaActivity, setIcaActivity] = useState<IcaActivity | ''>('');
  const [icaRatePerMil, setIcaRatePerMil] = useState('');
  const [icaWithholdingAgent, setIcaWithholdingAgent] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggle = (code: string) =>
    setResponsibilities((current) => {
      if (current.includes(code)) return current.filter((c) => c !== code);
      // Responsable (48) y no responsable (49) se excluyen entre sí
      const exclusive = code === '48' ? '49' : code === '49' ? '48' : null;
      return [...current.filter((c) => c !== exclusive), code];
    });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createCompanyTaxProfile({
        effectiveFrom,
        responsibilities,
        icaActivity: icaActivity || null,
        icaRatePerMil: icaActivity ? icaRatePerMil : null,
        icaWithholdingAgent: Boolean(icaActivity) && icaWithholdingAgent,
        reason,
      });
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['company-tax-profiles'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el perfil tributario.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" component="h2" gutterBottom>
          Perfil tributario
        </Typography>
        {data?.current ? (
          <Stack spacing={1} sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Vigente desde {data.current.effectiveFrom}. Responsabilidades del RUT:{' '}
              {data.current.responsibilities.map(responsibilityLabel).join(', ')}
              {data.current.icaActivity
                ? ` · ICA ${ICA_ACTIVITY_LABELS[data.current.icaActivity].toLowerCase()} ${Number(data.current.icaRatePerMil)} por mil`
                : ''}
            </Typography>
            <DerivedSummary profile={data.current} />
          </Stack>
        ) : (
          <Alert severity="info" sx={{ mb: 2 }}>
            Sin perfil tributario el sistema no calcula impuestos ni retenciones. Al registrarlo,
            cada producto vendido o comprado necesita su clasificación de IVA.
          </Alert>
        )}

        {canManage && (
          <Box
            component="form"
            onSubmit={submit}
            noValidate
            aria-label="Nueva versión del perfil tributario"
          >
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <FormLabel component="legend">Responsabilidades del RUT</FormLabel>
                <FormGroup row>
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
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  select
                  fullWidth
                  label="Actividad de ICA"
                  value={icaActivity}
                  onChange={(e) => setIcaActivity(e.target.value as IcaActivity | '')}
                >
                  <MenuItem value="">Sin ICA registrado</MenuItem>
                  {ICA_ACTIVITIES.map((a) => (
                    <MenuItem key={a} value={a}>
                      {ICA_ACTIVITY_LABELS[a]}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="Tarifa de ICA (por mil)"
                  value={icaRatePerMil}
                  onChange={(e) => setIcaRatePerMil(e.target.value)}
                  disabled={!icaActivity}
                  helperText="Dentro del rango del catálogo normativo"
                  slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={icaWithholdingAgent}
                      onChange={(e) => setIcaWithholdingAgent(e.target.checked)}
                      disabled={!icaActivity}
                    />
                  }
                  label="Agente de ReteICA en su municipio"
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  type="date"
                  fullWidth
                  label="Vigente desde"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  helperText="Hoy o una fecha futura"
                />
              </Grid>
              <Grid size={{ xs: 12, md: 8 }}>
                <TextField
                  fullWidth
                  required
                  label="Motivo"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Button type="submit" variant="contained" disabled={saving || !reason.trim()}>
                  Registrar perfil tributario
                </Button>
              </Grid>
            </Grid>
          </Box>
        )}

        {data && data.history.length > 0 && (
          <Table size="small" aria-label="Historial del perfil tributario" sx={{ mt: 3 }}>
            <TableHead>
              <TableRow>
                <TableCell>Vigente desde</TableCell>
                <TableCell>Responsabilidades</TableCell>
                <TableCell>ICA</TableCell>
                <TableCell>Motivo</TableCell>
                <TableCell>Registró</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.history.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.effectiveFrom}</TableCell>
                  <TableCell>{p.responsibilities.join(', ')}</TableCell>
                  <TableCell>
                    {p.icaActivity
                      ? `${ICA_ACTIVITY_LABELS[p.icaActivity]} ${Number(p.icaRatePerMil)} ‰`
                      : '—'}
                  </TableCell>
                  <TableCell>{p.reason}</TableCell>
                  <TableCell>{p.createdByUsername ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
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
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SYSTEM_PERMISSIONS,
  type AccountingPolicyDto,
  type CompanySettingsDto,
  type CostingMethod,
} from '@farmacia/contracts';
import { usePermissions } from '../../auth/hooks/usePermissions';
import { localIsoDate } from '../../../components/QuickDateRange';
import {
  createAccountingPolicy,
  createBranch,
  fetchCompanySettings,
  setupCompany,
} from '../api/company.api';
import {
  branchSchema,
  companySetupSchema,
  policySchema,
  type BranchFormData,
  type CompanySetupFormData,
  type PolicyFormData,
} from '../validation/company.schema';
import { CompanyTaxProfileSection } from '../../taxes/components/CompanyTaxProfileSection';

const COSTING_LABELS: Record<CostingMethod, string> = {
  WEIGHTED_AVERAGE: 'Promedio ponderado móvil',
  FIFO: 'PEPS (primeras entradas, primeras salidas)',
  SPECIFIC_LOT: 'Costo identificado por lote',
};
const OPENING_LABELS = {
  LAST_PURCHASE_THEN_CATALOG: 'Último costo de compra; si no hay compras, costo del catálogo',
  CATALOG: 'Costo del catálogo',
} as const;
const VARIANCE_LABELS = {
  COST_OF_SALES: 'Costo de ventas',
  INVENTORY_COST_VARIANCE: 'Cuenta propia de diferencias en costo de inventario',
} as const;
const BONUS_LABELS = {
  ZERO_COST_IN_AVERAGE: 'Entran a costo cero y bajan el promedio',
} as const;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function SetupForm({ onDone }: { onDone: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<CompanySetupFormData>({
    resolver: zodResolver(companySetupSchema),
    defaultValues: {
      legalName: '',
      tradeName: '',
      taxId: '',
      taxIdCheckDigit: '',
      municipalityCode: '',
      address: '',
      email: '',
      phone: '',
      branchCode: 'PRINCIPAL',
      branchName: 'Sede principal',
    },
  });
  const submit = async (data: CompanySetupFormData) => {
    setError(null);
    try {
      await setupCompany({
        legalName: data.legalName,
        tradeName: data.tradeName || null,
        taxId: data.taxId,
        taxIdCheckDigit: data.taxIdCheckDigit,
        sectorProfile: 'PHARMACY',
        municipalityCode: data.municipalityCode || null,
        address: data.address || null,
        email: data.email || null,
        phone: data.phone || null,
        branch: {
          code: data.branchCode,
          name: data.branchName,
          municipalityCode: data.municipalityCode || null,
        },
      });
      await onDone();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo configurar la empresa.'));
    }
  };
  const field = (name: keyof CompanySetupFormData, label: string, md = 6, required = false) => (
    <Grid size={{ xs: 12, md }}>
      <Controller
        name={name}
        control={control}
        render={({ field: f, fieldState }) => (
          <TextField
            {...f}
            label={label}
            required={required}
            fullWidth
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
          />
        )}
      />
    </Grid>
  );
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" component="h2" gutterBottom>
          Configurar la empresa
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Los datos fiscales se usan en los documentos y en el cumplimiento tributario. El perfil
          sectorial disponible es farmacia.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <form noValidate onSubmit={handleSubmit(submit)}>
          <Grid container spacing={2}>
            {field('legalName', 'Razón social', 8, true)}
            {field('tradeName', 'Nombre comercial', 4)}
            {field('taxId', 'NIT (sin dígito de verificación)', 4, true)}
            {field('taxIdCheckDigit', 'Dígito de verificación', 2, true)}
            {field('municipalityCode', 'Municipio (código DANE)', 3)}
            {field('phone', 'Teléfono', 3)}
            {field('address', 'Dirección', 8)}
            {field('email', 'Correo', 4)}
            {field('branchCode', 'Código de la sede principal', 4, true)}
            {field('branchName', 'Nombre de la sede principal', 8, true)}
          </Grid>
          <Box sx={{ mt: 2 }}>
            <Button type="submit" variant="contained" disabled={formState.isSubmitting}>
              Guardar empresa
            </Button>
          </Box>
        </form>
      </CardContent>
    </Card>
  );
}

function BranchForm({ onDone }: { onDone: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, reset, formState } = useForm<BranchFormData>({
    resolver: zodResolver(branchSchema),
    defaultValues: { code: '', name: '', municipalityCode: '' },
  });
  const submit = async (data: BranchFormData) => {
    setError(null);
    try {
      await createBranch({
        code: data.code,
        name: data.name,
        municipalityCode: data.municipalityCode || null,
      });
      reset();
      await onDone();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear la sucursal.'));
    }
  };
  return (
    <form noValidate onSubmit={handleSubmit(submit)} aria-label="Nueva sucursal">
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: 'flex-start' }}>
        {(['code', 'name', 'municipalityCode'] as const).map((name) => (
          <Controller
            key={name}
            name={name}
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                size="small"
                label={
                  { code: 'Código', name: 'Nombre', municipalityCode: 'Municipio (DANE)' }[name]
                }
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
              />
            )}
          />
        ))}
        <Button type="submit" variant="outlined" disabled={formState.isSubmitting}>
          Agregar sucursal
        </Button>
      </Stack>
    </form>
  );
}

function PolicyForm({
  current,
  available,
  onDone,
}: {
  current: AccountingPolicyDto;
  available: CostingMethod[];
  onDone: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState,
    setError: setFieldError,
    watch,
  } = useForm<PolicyFormData>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      effectiveFrom: localIsoDate(new Date()),
      costingMethod: current.costingMethod,
      openingCostSource: current.openingCostSource,
      purchaseReturnVariancePurpose: current.purchaseReturnVariancePurpose,
      bonusUnitsTreatment: current.bonusUnitsTreatment,
      reason: '',
    },
  });
  const changesMethod = watch('costingMethod') !== current.costingMethod;
  const submit = async (data: PolicyFormData) => {
    setError(null);
    // Misma regla que el backend (ADR-006, F5): el método cambia al iniciar un mes futuro
    if (
      data.costingMethod !== current.costingMethod &&
      !isFutureMonthStart(data.effectiveFrom, localIsoDate(new Date()))
    ) {
      setFieldError('effectiveFrom', {
        type: 'manual',
        message: 'Un cambio de método rige desde el primer día de un mes futuro',
      });
      return;
    }
    try {
      await createAccountingPolicy(data);
      reset({ ...data, reason: '' });
      await onDone();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo registrar la política.'));
    }
  };
  const select = (
    name:
      | 'costingMethod'
      | 'openingCostSource'
      | 'purchaseReturnVariancePurpose'
      | 'bonusUnitsTreatment',
    label: string,
    options: Record<string, string>,
    enabled: (value: string) => boolean = () => true,
  ) => (
    <Grid size={{ xs: 12, md: 6 }}>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <TextField {...field} select label={label} fullWidth>
            {Object.entries(options).map(([value, text]) => (
              <MenuItem key={value} value={value} disabled={!enabled(value)}>
                {text}
                {!enabled(value) ? ' (disponible próximamente)' : ''}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
    </Grid>
  );
  return (
    <form
      noValidate
      onSubmit={handleSubmit(submit)}
      aria-label="Nueva versión de la política contable"
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Controller
            name="effectiveFrom"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                type="date"
                label="Vigente desde"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                error={!!fieldState.error}
                helperText={
                  fieldState.error?.message ?? 'Hoy o una fecha futura: el pasado no cambia'
                }
              />
            )}
          />
        </Grid>
        {select('costingMethod', 'Método de costeo', COSTING_LABELS, (v) =>
          available.includes(v as CostingMethod),
        )}
        {changesMethod && (
          <Grid size={{ xs: 12 }}>
            <Alert severity="info" variant="outlined">
              El cambio de método rige desde el primer día de un mes futuro: el mes en curso cierra
              con el método actual. Cada producto se convierte en su siguiente movimiento sin
              cambiar el valor total del inventario, y la conversión queda registrada.
            </Alert>
          </Grid>
        )}
        {select('openingCostSource', 'Costo de apertura de existencias', OPENING_LABELS)}
        {select(
          'purchaseReturnVariancePurpose',
          'Diferencia en devoluciones a proveedor',
          VARIANCE_LABELS,
        )}
        {select('bonusUnitsTreatment', 'Unidades bonificadas', BONUS_LABELS)}
        <Grid size={{ xs: 12 }}>
          <Controller
            name="reason"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Motivo del cambio"
                required
                fullWidth
                multiline
                minRows={2}
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
              />
            )}
          />
        </Grid>
      </Grid>
      <Box sx={{ mt: 2 }}>
        <Button type="submit" variant="contained" disabled={formState.isSubmitting}>
          Registrar versión
        </Button>
      </Box>
    </form>
  );
}

function PolicySummary({ policy }: { policy: AccountingPolicyDto }) {
  return (
    <Stack spacing={0.5}>
      <Typography>
        <strong>Método de costeo:</strong> {COSTING_LABELS[policy.costingMethod]}
      </Typography>
      <Typography>
        <strong>Costo de apertura:</strong> {OPENING_LABELS[policy.openingCostSource]}
      </Typography>
      <Typography>
        <strong>Diferencia en devoluciones a proveedor:</strong>{' '}
        {VARIANCE_LABELS[policy.purchaseReturnVariancePurpose]}
      </Typography>
      <Typography>
        <strong>Unidades bonificadas:</strong> {BONUS_LABELS[policy.bonusUnitsTreatment]}
      </Typography>
    </Stack>
  );
}

export const CompanySettingsPage = () => {
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const canManage = hasPermission(SYSTEM_PERMISSIONS.COMPANY_MANAGE);
  const { data, isLoading, isError } = useQuery<CompanySettingsDto>({
    queryKey: ['company-settings'],
    queryFn: fetchCompanySettings,
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['company-settings'] });
  };

  if (!hasPermission(SYSTEM_PERMISSIONS.COMPANY_READ)) {
    return (
      <Container component="main" sx={{ py: 4 }}>
        <Alert severity="warning">
          No tienes permiso para consultar la configuración de la empresa.
        </Alert>
      </Container>
    );
  }
  if (isLoading) {
    return (
      <Box
        sx={{ display: 'flex', justifyContent: 'center', py: 6 }}
        role="status"
        aria-label="Cargando"
      >
        <CircularProgress />
      </Box>
    );
  }
  if (isError || !data) {
    return <Alert severity="error">No se pudo cargar la configuración de la empresa.</Alert>;
  }

  const { company, currentPolicy, policyHistory, availableCostingMethods } = data;
  return (
    <Container component="main" maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h5" component="h1" gutterBottom>
        Empresa y política contable
      </Typography>
      <Stack spacing={3}>
        {!company ? (
          canManage ? (
            <SetupForm onDone={refresh} />
          ) : (
            <Alert severity="info">La empresa aún no está configurada.</Alert>
          )
        ) : (
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" component="h2">
                {company.legalName}
              </Typography>
              <Typography color="text.secondary" gutterBottom>
                NIT {company.taxId}-{company.taxIdCheckDigit}
                {company.tradeName ? ` · ${company.tradeName}` : ''} · Perfil farmacia
              </Typography>
              <Table size="small" aria-label="Sucursales">
                <TableHead>
                  <TableRow>
                    <TableCell>Código</TableCell>
                    <TableCell>Sucursal</TableCell>
                    <TableCell>Municipio</TableCell>
                    <TableCell>Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {company.branches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.code}</TableCell>
                      <TableCell>
                        {b.name}{' '}
                        {b.isDefault && <Chip size="small" label="Principal" sx={{ ml: 1 }} />}
                      </TableCell>
                      <TableCell>{b.municipalityCode ?? '—'}</TableCell>
                      <TableCell>{b.isActive ? 'Activa' : 'Inactiva'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {canManage && (
                <Box sx={{ mt: 2 }}>
                  <BranchForm onDone={refresh} />
                </Box>
              )}
            </CardContent>
          </Card>
        )}

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              Política contable vigente
            </Typography>
            {currentPolicy.isDefault ? (
              <Alert severity="info" sx={{ mb: 2 }}>
                Rigen los valores por defecto del sistema. Registra una versión para fijar la
                política de la empresa.
              </Alert>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Vigente desde {currentPolicy.effectiveFrom}
              </Typography>
            )}
            <PolicySummary policy={currentPolicy} />
          </CardContent>
        </Card>

        {company && canManage && (
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" component="h2" gutterBottom>
                Nueva versión de la política
              </Typography>
              <PolicyForm
                current={currentPolicy}
                available={availableCostingMethods}
                onDone={refresh}
              />
            </CardContent>
          </Card>
        )}

        {company && <CompanyTaxProfileSection canManage={canManage} />}

        {policyHistory.length > 0 && (
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" component="h2" gutterBottom>
                Historial de versiones
              </Typography>
              <Table size="small" aria-label="Historial de la política contable">
                <TableHead>
                  <TableRow>
                    <TableCell>Vigente desde</TableCell>
                    <TableCell>Método de costeo</TableCell>
                    <TableCell>Diferencias en devoluciones</TableCell>
                    <TableCell>Motivo</TableCell>
                    <TableCell>Registró</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {policyHistory.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.effectiveFrom}</TableCell>
                      <TableCell>{COSTING_LABELS[p.costingMethod]}</TableCell>
                      <TableCell>{VARIANCE_LABELS[p.purchaseReturnVariancePurpose]}</TableCell>
                      <TableCell>{p.reason}</TableCell>
                      <TableCell>{p.createdByName ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  );
};

/** Primer día de un mes posterior al de hoy (YYYY-MM-DD). */
function isFutureMonthStart(date: string, today: string): boolean {
  return date.endsWith('-01') && date.slice(0, 7) > today.slice(0, 7);
}

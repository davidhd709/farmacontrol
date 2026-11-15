import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountingPolicyDto, CompanySettingsDto } from '@farmacia/contracts';
import { appTheme } from '../src/theme/app-theme';
import { CompanySettingsPage } from '../src/features/company/pages/CompanySettingsPage';
import * as api from '../src/features/company/api/company.api';
import * as taxesApi from '../src/features/taxes/api/taxes.api';

vi.mock('../src/features/auth/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

const policy: AccountingPolicyDto = {
  id: 'p1',
  effectiveFrom: '2026-11-01',
  costingMethod: 'WEIGHTED_AVERAGE',
  openingCostSource: 'LAST_PURCHASE_THEN_CATALOG',
  purchaseReturnVariancePurpose: 'COST_OF_SALES',
  bonusUnitsTreatment: 'ZERO_COST_IN_AVERAGE',
  agingBaseDate: 'DUE_DATE_OR_ISSUE',
  reason: 'Política inicial',
  createdByName: 'Administrador',
  createdAt: '2026-11-01T12:00:00.000Z',
  isDefault: false,
};

const settings: CompanySettingsDto = {
  company: {
    id: 'c1',
    legalName: 'Droguería de Prueba SAS',
    tradeName: null,
    taxId: '900123456',
    taxIdCheckDigit: '7',
    sectorProfile: 'PHARMACY',
    address: null,
    municipalityCode: null,
    email: null,
    phone: null,
    branches: [
      {
        id: 'b1',
        code: 'PRINCIPAL',
        name: 'Sede principal',
        address: null,
        municipalityCode: null,
        isDefault: true,
        isActive: true,
      },
    ],
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
  },
  currentPolicy: policy,
  policyHistory: [policy],
  availableCostingMethods: ['WEIGHTED_AVERAGE', 'FIFO', 'SPECIFIC_LOT'],
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={appTheme}>
        <CompanySettingsPage />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(taxesApi, 'fetchCompanyTaxProfiles').mockResolvedValue({ current: null, history: [] });
});

describe('Empresa y política contable', () => {
  it('muestra las fechas de la política como dd/mm/aaaa', async () => {
    vi.spyOn(api, 'fetchCompanySettings').mockResolvedValue(settings);
    renderPage();
    expect(await screen.findByText('Vigente desde el 01/11/2026')).toBeInTheDocument();
    const history = screen.getByRole('table', { name: 'Historial de la política contable' });
    expect(within(history).getByText('01/11/2026')).toBeInTheDocument();
  });

  it('anuncia la sucursal agregada', async () => {
    vi.spyOn(api, 'fetchCompanySettings').mockResolvedValue(settings);
    const create = vi.spyOn(api, 'createBranch').mockResolvedValue(undefined as never);
    renderPage();
    const form = await screen.findByRole('form', { name: 'Nueva sucursal' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Código' }), {
      target: { value: 'NORTE' },
    });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Nombre' }), {
      target: { value: 'Sede norte' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Agregar sucursal' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Sucursal «Sede norte» agregada.');
    expect(create).toHaveBeenCalledWith({
      code: 'NORTE',
      name: 'Sede norte',
      municipalityCode: null,
    });
  });

  it('anuncia la política registrada con su fecha de vigencia', async () => {
    vi.spyOn(api, 'fetchCompanySettings').mockResolvedValue(settings);
    const create = vi.spyOn(api, 'createAccountingPolicy').mockResolvedValue(undefined as never);
    renderPage();
    const form = await screen.findByRole('form', {
      name: 'Nueva versión de la política contable',
    });
    fireEvent.change(within(form).getByRole('textbox', { name: /Motivo del cambio/ }), {
      target: { value: 'Ajuste del tratamiento de cartera' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Registrar versión' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    const effectiveFrom = create.mock.calls[0]![0].effectiveFrom;
    expect(await screen.findByRole('status')).toHaveTextContent(
      `Política contable registrada, vigente desde el ${effectiveFrom.split('-').reverse().join('/')}.`,
    );
  });

  it('si la carga falla, ofrece reintentar', async () => {
    const fetch = vi
      .spyOn(api, 'fetchCompanySettings')
      .mockRejectedValueOnce(new Error('Servicio no disponible'))
      .mockResolvedValue(settings);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Droguería de Prueba SAS')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

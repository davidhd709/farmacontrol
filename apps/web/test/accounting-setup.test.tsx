import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES, type AccountingSetupDto } from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as setupApi from '../src/features/accounting/api/accounting-setup.api';
import * as accountingApi from '../src/features/accounting/api/accounting.api';
import { AccountingSetupPage } from '../src/features/accounting/pages/AccountingSetupPage';
import { appTheme } from '../src/theme/app-theme';

const incomplete: AccountingSetupDto = {
  status: 'INCOMPLETE',
  checks: [
    {
      key: 'COMPANY',
      label: 'Empresa configurada',
      ok: true,
      required: true,
      detail: 'Droguería SAS',
    },
    {
      key: 'OPERATING_PURPOSES',
      label: 'Propósitos operativos mapeados',
      ok: false,
      required: true,
      detail: 'Faltan 2 de 10 propósitos.',
      missingPurposes: ['CASH', 'BANK'],
    },
    {
      key: 'OPENING_BALANCES',
      label: 'Saldos de apertura registrados',
      ok: false,
      required: false,
      detail: 'Recomendado si el negocio ya venía operando.',
    },
  ],
  template: {
    code: 'PHARMACY',
    name: 'Droguería / farmacia (PUC comercial)',
    legalBasis: 'Decreto 2650 de 1993',
    accounts: 66,
    mappedPurposes: 25,
  },
  inventory: null,
};

function renderPage() {
  const permissions = [SYSTEM_PERMISSIONS.ACCOUNTING_READ, SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE];
  const auth = {
    user: { id: 'u', username: 'admin', isActive: true, roles: [SYSTEM_ROLES.ADMIN], permissions },
    roles: [SYSTEM_ROLES.ADMIN],
    permissions,
    status: 'authenticated',
  } as unknown as AuthContextValue;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AuthContext.Provider value={auth}>
            <AccountingSetupPage />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('Asistente de configuración contable (F7)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(setupApi, 'fetchOpeningBalance').mockResolvedValue({ journalEntryId: null });
    vi.spyOn(accountingApi, 'fetchAccounts').mockResolvedValue([]);
  });

  it('muestra el estado y cada requisito con texto, no solo con color', async () => {
    vi.spyOn(setupApi, 'fetchAccountingSetup').mockResolvedValue(incomplete);
    renderPage();
    expect(await screen.findByText('Configuración incompleta')).toBeInTheDocument();
    expect(screen.getByText('Obligatorio pendiente')).toBeInTheDocument();
    expect(screen.getByText('Recomendado')).toBeInTheDocument();
    expect(screen.getByText(/Pendientes: CASH, BANK/)).toBeInTheDocument();
  });

  it('aplica la plantilla PUC e informa el resultado', async () => {
    vi.spyOn(setupApi, 'fetchAccountingSetup').mockResolvedValue(incomplete);
    const applySpy = vi.spyOn(setupApi, 'applyPucTemplate').mockResolvedValue({
      template: 'PHARMACY',
      accountsCreated: ['110505', '111005'],
      accountsExisting: [],
      conflicts: [],
      purposesMapped: ['CASH', 'BANK'],
      purposesKept: [],
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar plantilla PUC' }));
    await waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/2 cuentas creadas, 2 propósitos mapeados/)).toBeInTheDocument();
  });
});

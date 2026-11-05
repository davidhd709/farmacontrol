import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  type AccountingSetupDto,
  type AccountDto,
  type OpeningBalanceDto,
} from '@farmacia/contracts';
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

const openingAccounts: AccountDto[] = [
  {
    id: 'cash-account',
    code: '110505',
    name: 'Caja general',
    type: 'ASSET',
    nature: 'DEBIT',
    parentId: null,
    level: 1,
    allowsMovement: true,
    isActive: true,
    createdAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
  },
  {
    id: 'capital-account',
    code: '310505',
    name: 'Capital autorizado',
    type: 'EQUITY',
    nature: 'CREDIT',
    parentId: null,
    level: 1,
    allowsMovement: true,
    isActive: true,
    createdAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
  },
];

const createdOpening: OpeningBalanceDto = {
  journalEntryId: 'opening-entry',
  entryDate: '2026-11-03',
  totalDebit: '2000000.00',
  totalCredit: '2000000.00',
  lines: [
    {
      accountId: 'cash-account',
      accountCode: '110505',
      accountName: 'Caja general',
      debit: '2000000.00',
      credit: '0.00',
    },
    {
      accountId: 'capital-account',
      accountCode: '310505',
      accountName: 'Capital autorizado',
      debit: '0.00',
      credit: '2000000.00',
    },
  ],
};

async function fillOpening() {
  vi.spyOn(setupApi, 'fetchAccountingSetup').mockResolvedValue(incomplete);
  vi.mocked(accountingApi.fetchAccounts).mockResolvedValue(openingAccounts);
  renderPage();
  await screen.findByRole('button', { name: 'Registrar saldos de apertura' });
  fireEvent.change(screen.getByRole('textbox', { name: /Soporte/ }), {
    target: { value: 'Efectivo inicial según balance al corte' },
  });
  for (const [index, account] of openingAccounts.entries()) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: `Cuenta línea ${index + 1}` }));
    fireEvent.click(
      await screen.findByRole('option', { name: `${account.code} · ${account.name}` }),
    );
  }
  fireEvent.change(screen.getAllByRole('textbox', { name: 'Débito' })[0], {
    target: { value: '2000000' },
  });
  fireEvent.change(screen.getAllByRole('textbox', { name: 'Crédito' })[1], {
    target: { value: '2000000' },
  });
  return screen.getByRole('button', { name: 'Registrar saldos de apertura' });
}

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

  it('conserva la clave al reintentar una apertura tras fallo de red y limpia el formulario al confirmar', async () => {
    const create = vi
      .spyOn(setupApi, 'createOpeningBalance')
      .mockRejectedValueOnce(new Error('Conexión interrumpida'))
      .mockResolvedValueOnce(createdOpening);
    const submit = await fillOpening();
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(await screen.findByText('Conexión interrumpida')).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
    const [payload, firstKey] = create.mock.calls[0];
    expect(firstKey).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    expect(payload).toMatchObject({
      entryDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      reason: 'Efectivo inicial según balance al corte',
      lines: [
        { accountId: 'cash-account', debit: '2000000', credit: '0' },
        { accountId: 'capital-account', debit: '0', credit: '2000000' },
      ],
    });

    fireEvent.click(submit);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1]).toEqual([payload, firstKey]);
    await waitFor(() => expect(screen.getByRole('textbox', { name: /Soporte/ })).toHaveValue(''));
    expect(screen.queryByText('Conexión interrumpida')).not.toBeInTheDocument();
    expect(submit).toBeDisabled();
  });

  it('genera otra clave cuando se corrige el contenido después de un intento fallido', async () => {
    const create = vi
      .spyOn(setupApi, 'createOpeningBalance')
      .mockRejectedValueOnce(new Error('No se pudo confirmar la apertura'))
      .mockResolvedValueOnce(createdOpening);
    const submit = await fillOpening();
    fireEvent.click(submit);
    await screen.findByText('No se pudo confirmar la apertura');
    const firstKey = create.mock.calls[0][1];

    fireEvent.change(screen.getByRole('textbox', { name: /Soporte/ }), {
      target: { value: 'Balance de apertura con soporte corregido' },
    });
    fireEvent.click(submit);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1][0].reason).toBe('Balance de apertura con soporte corregido');
    expect(create.mock.calls[1][1]).not.toBe(firstKey);
    expect(create.mock.calls[1][1]).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    await waitFor(() => expect(screen.getByRole('textbox', { name: /Soporte/ })).toHaveValue(''));
  });
});

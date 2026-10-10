import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appTheme } from '../src/theme/app-theme';
import {
  AccountsPage,
  ImportAccountsPage,
  PurposesPage,
} from '../src/features/accounting/pages/AccountingPages';
import * as api from '../src/features/accounting/api/accounting.api';

vi.mock('../src/features/auth/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

const rootAccount: api.AccountDto = {
  id: 'root',
  code: '1',
  name: 'Activos',
  type: 'ASSET',
  nature: 'DEBIT',
  parentId: null,
  level: 1,
  allowsMovement: false,
  isActive: true,
  createdAt: '2026-09-29T00:00:00.000Z',
  updatedAt: '2026-09-29T00:00:00.000Z',
};
const childAccount: api.AccountDto = {
  ...rootAccount,
  id: 'child',
  code: '11',
  name: 'Disponible',
  parentId: 'root',
  level: 2,
  allowsMovement: true,
};

function renderPage(page: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={appTheme}>{page}</ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'fetchAccounts').mockResolvedValue([rootAccount, childAccount]);
  vi.spyOn(api, 'fetchConfigurationStatus').mockResolvedValue({
    total: 17,
    configured: 1,
    missing: ['CASH'],
    status: 'INCOMPLETE',
  });
  vi.spyOn(api, 'fetchPurposes').mockResolvedValue([
    { purpose: 'CASH', status: 'PENDING_MAPPING', accountId: null },
  ]);
});

describe('Configuración contable', () => {
  it('ofrece como padre únicamente cuentas agrupadoras activas del mismo tipo', async () => {
    renderPage(<AccountsPage />);
    await screen.findByRole('button', { name: 'Expandir 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Nueva cuenta' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Cuenta padre' }));
    expect(screen.getByRole('option', { name: '1 — Activos' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '11 — Disponible' })).not.toBeInTheDocument();
  });

  it('muestra jerarquía, expande cuentas y advierte propósitos pendientes', async () => {
    renderPage(<AccountsPage />);
    expect(await screen.findByText(/1 de 17 propósitos configurados/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expandir 1' })).toBeInTheDocument();
    expect(screen.queryByText('Disponible')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expandir 1' }));
    expect(screen.getByText('Disponible')).toBeInTheDocument();
  });

  it('permite mapear un propósito pendiente a una cuenta imputable', async () => {
    const save = vi.spyOn(api, 'updatePurpose').mockResolvedValue({
      purpose: 'CASH',
      status: 'ACTIVE',
      accountId: 'child',
      account: childAccount,
    });
    renderPage(<PurposesPage />);
    const select = await screen.findByRole('combobox', { name: 'Cuenta para CASH' });
    fireEvent.mouseDown(select);
    fireEvent.click(await screen.findByRole('option', { name: '11 — Disponible' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('CASH', 'child'));
  });

  it('no confirma un Excel con errores y conserva la vista previa', async () => {
    vi.spyOn(api, 'previewAccountImport').mockResolvedValue({
      previewHash: 'hash',
      validCount: 0,
      errorCount: 1,
      warningCount: 0,
      rows: [
        {
          row: 2,
          code: '1',
          name: 'Activos',
          type: 'ASSET',
          parentCode: null,
          allowsMovement: false,
          isActive: true,
          errors: ['Código duplicado'],
          warnings: [],
        },
      ],
    });
    const confirm = vi.spyOn(api, 'confirmAccountImport');
    renderPage(<ImportAccountsPage />);
    fireEvent.change(screen.getByLabelText('Archivo Excel del plan de cuentas'), {
      target: {
        files: [
          new File(['excel'], 'plan.xlsx', {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validar y ver vista previa' }));
    expect(await screen.findByText('Código duplicado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar importación' })).toBeDisabled();
    expect(confirm).not.toHaveBeenCalled();
  });
});

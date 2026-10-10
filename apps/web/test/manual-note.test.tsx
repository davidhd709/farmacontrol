import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appTheme } from '../src/theme/app-theme';
import { ManualNoteDialog } from '../src/features/accounting/components/ManualNoteDialog';
import * as api from '../src/features/accounting/api/accounting.api';

const base = {
  type: 'EXPENSE' as const,
  nature: 'DEBIT' as const,
  parentId: null,
  level: 1,
  allowsMovement: true,
  isActive: true,
  createdAt: '2026-09-29T00:00:00.000Z',
  updatedAt: '2026-09-29T00:00:00.000Z',
};
const energia: api.AccountDto = { ...base, id: 'energia', code: '513525', name: 'Energía' };
const caja: api.AccountDto = { ...base, id: 'caja', code: '110505', name: 'Caja', type: 'ASSET' };

function renderDialog(onCreated = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={appTheme}>
        <ManualNoteDialog open onClose={vi.fn()} onCreated={onCreated} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return onCreated;
}

async function pickAccount(line: number, name: string) {
  const input = screen.getByRole('combobox', { name: `Cuenta línea ${line}` });
  fireEvent.mouseDown(input);
  fireEvent.click(await screen.findByRole('option', { name }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'fetchAccounts').mockResolvedValue([energia, caja]);
});

describe('Nota contable manual', () => {
  it('solo permite registrar cuando débitos y créditos cuadran, y envía la clave de idempotencia', async () => {
    const create = vi
      .spyOn(api, 'createManualNote')
      .mockResolvedValue({ journalEntryId: 'je-1', noteNumber: 'NTC-000001' });
    const onCreated = renderDialog();
    const submit = screen.getByRole('button', { name: 'Registrar nota' });

    fireEvent.change(screen.getByLabelText(/Fecha contable/), { target: { value: '2026-07-15' } });
    fireEvent.change(screen.getByLabelText(/Descripción/), { target: { value: 'Energía de julio' } });
    await pickAccount(1, '513525 — Energía');
    await pickAccount(2, '110505 — Caja');
    fireEvent.change(screen.getByLabelText('Débito línea 1'), { target: { value: '185000' } });
    fireEvent.change(screen.getByLabelText('Crédito línea 2'), { target: { value: '180000' } });

    expect(screen.getByText(/Diferencia:/)).toBeInTheDocument();
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Crédito línea 2'), { target: { value: '185000' } });
    expect(screen.getByText(/cuadran/)).toBeInTheDocument();
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('NTC-000001'));
    expect(create).toHaveBeenCalledWith(
      {
        entryDate: '2026-07-15',
        description: 'Energía de julio',
        lines: [
          { accountId: 'energia', debit: '185000', credit: '0' },
          { accountId: 'caja', debit: '0', credit: '185000' },
        ],
      },
      expect.any(String),
    );
  });

  it('un reintento del mismo contenido reutiliza la clave', async () => {
    const create = vi
      .spyOn(api, 'createManualNote')
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockResolvedValueOnce({ journalEntryId: 'je-1', noteNumber: 'NTC-000001' });
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Fecha contable/), { target: { value: '2026-07-15' } });
    fireEvent.change(screen.getByLabelText(/Descripción/), { target: { value: 'Energía de julio' } });
    await pickAccount(1, '513525 — Energía');
    await pickAccount(2, '110505 — Caja');
    fireEvent.change(screen.getByLabelText('Débito línea 1'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Crédito línea 2'), { target: { value: '100' } });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar nota' }));
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar nota' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[0][1]).toBe(create.mock.calls[1][1]);
    expect(within(document.body).queryByText(/Diferencia/)).toBeNull();
  });
});

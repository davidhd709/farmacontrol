import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS, type JournalEntryDto } from '@farmacia/contracts';
import { appTheme } from '../src/theme/app-theme';
import { withAuth } from './support-auth';
import * as accountingApi from '../src/features/accounting/api/accounting.api';
import { JournalEntriesPage } from '../src/features/accounting/pages/JournalEntriesPage';

const entry = (overrides: Partial<JournalEntryDto>): JournalEntryDto => ({
  id: 'je-1',
  entryDate: '2026-11-02',
  description: 'Venta mostrador comprobante FAC-000007',
  sourceType: 'SALE',
  sourceId: 'b0c2f0e8-0000-4000-8000-000000000001',
  status: 'POSTED',
  createdAt: '2026-11-02T15:00:00.000Z',
  reversalOfId: null,
  reversalReason: null,
  reversedByEntryId: null,
  lines: [],
  totalDebit: '5000.00',
  totalCredit: '5000.00',
  ...overrides,
});

function renderPage(permissions: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={appTheme}>
        <MemoryRouter>{withAuth(<JournalEntriesPage />, permissions)}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.restoreAllMocks());

describe('Libro Diario', () => {
  const sale = entry({});
  const manual = entry({
    id: 'je-2',
    sourceType: 'MANUAL_NOTE',
    sourceId: 'NCM-000001',
    description: 'Nota manual',
  });

  it('no ofrece "Reversar" en la tabla: cada fila solo tiene Detalle', async () => {
    vi.spyOn(accountingApi, 'fetchJournalEntries').mockResolvedValue({
      items: [sale, manual],
      total: 2,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    renderPage(Object.values(SYSTEM_PERMISSIONS));
    expect(await screen.findAllByRole('button', { name: 'Detalle' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Reversar/ })).toBeNull();
  });

  it('una nota contable manual se anula desde su detalle; un asiento de venta no', async () => {
    vi.spyOn(accountingApi, 'fetchJournalEntries').mockResolvedValue({
      items: [sale, manual],
      total: 2,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    const detail = vi
      .spyOn(accountingApi, 'fetchJournalEntryById')
      .mockImplementation(async (id) => (id === 'je-2' ? manual : sale));
    const annul = vi
      .spyOn(accountingApi, 'annulJournalEntry')
      .mockResolvedValue(entry({ id: 'je-3', sourceType: 'REVERSAL', reversalOfId: 'je-2' }));
    renderPage([SYSTEM_PERMISSIONS.ACCOUNTING_READ, SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE]);

    const [saleDetail, manualDetail] = await screen.findAllByRole('button', { name: 'Detalle' });
    fireEvent.click(saleDetail);
    let dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Venta mostrador comprobante FAC-000007');
    expect(within(dialog).queryByRole('button', { name: 'Anular' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));

    fireEvent.click(manualDetail);
    await waitFor(() => expect(detail).toHaveBeenLastCalledWith('je-2'));
    dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Anular' }));
    const confirm = await screen.findByRole('dialog', { name: /Anular asiento/ });
    fireEvent.change(within(confirm).getByLabelText(/Motivo de la anulación/), {
      target: { value: 'Nota duplicada' },
    });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Confirmar anulación' }));
    await waitFor(() =>
      expect(annul).toHaveBeenCalledWith(
        'je-2',
        expect.objectContaining({ reason: 'Nota duplicada' }),
      ),
    );
  });

  it('sin permiso contable de gestión la nota manual no se puede anular', async () => {
    vi.spyOn(accountingApi, 'fetchJournalEntries').mockResolvedValue({
      items: [manual],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    vi.spyOn(accountingApi, 'fetchJournalEntryById').mockResolvedValue(manual);
    renderPage([SYSTEM_PERMISSIONS.ACCOUNTING_READ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Detalle' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Nota manual');
    expect(within(dialog).queryByRole('button', { name: 'Anular' })).toBeNull();
  });
});

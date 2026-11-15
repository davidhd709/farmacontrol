import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { appTheme } from '../src/theme/app-theme';
import { withAuth } from './support-auth';
import * as accountingApi from '../src/features/accounting/api/accounting.api';
import type { FiscalPeriodDto } from '../src/features/accounting/api/accounting.api';
import { FiscalPeriodsPage } from '../src/features/accounting/pages/FiscalPeriodsPage';
import { DocumentLockCard } from '../src/features/accounting/components/DocumentLockCard';

const period = (overrides: Partial<FiscalPeriodDto> = {}): FiscalPeriodDto =>
  ({
    id: 'fp-10',
    year: 2026,
    month: 10,
    name: 'Octubre 2026',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    status: 'OPEN',
    closedAt: null,
    closedById: null,
    closedByName: null,
    reopenedAt: null,
    reopenedById: null,
    reopenedByName: null,
    reopenReason: null,
    closingEntryId: null,
    notes: null,
    entriesCount: 4,
    totalDebits: '120000.00',
    totalCredits: '120000.00',
    ...overrides,
  }) as FiscalPeriodDto;

function mount(ui: React.ReactElement, permissions: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={appTheme}>
        <MemoryRouter>{withAuth(ui, permissions)}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(accountingApi, 'fetchDocumentLock').mockResolvedValue({ current: null, history: [] });
});

const manage = [SYSTEM_PERMISSIONS.ACCOUNTING_READ, SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE];

describe('Períodos fiscales: cierre, reapertura y bloqueo con la confirmación común', () => {
  it('el cierre nombra el período y sus efectos; si el servidor lo rechaza el error queda en el diálogo', async () => {
    vi.spyOn(accountingApi, 'fetchFiscalPeriods').mockResolvedValue([period()]);
    const close = vi
      .spyOn(accountingApi, 'closeFiscalPeriod')
      .mockRejectedValue(new Error('Hay asientos en borrador dentro del período.'));
    mount(<FiscalPeriodsPage />, manage);

    fireEvent.click(await screen.findByRole('button', { name: /^Cerrar/ }));
    const dialog = await screen.findByRole('dialog', { name: '¿Cerrar el período Octubre 2026?' });
    expect(within(dialog).getByTestId('confirm-subject')).toHaveTextContent('Octubre 2026');
    expect(within(dialog).getByTestId('confirm-effects')).toHaveTextContent(
      /No se podrán crear, editar ni reversar asientos/,
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar período' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Hay asientos en borrador dentro del período.',
    );
    expect(close).toHaveBeenCalledWith('fp-10', { generateClosingEntry: true, notes: '' });
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeEnabled();
  });

  it('la reapertura exige un motivo de al menos 10 caracteres', async () => {
    vi.spyOn(accountingApi, 'fetchFiscalPeriods').mockResolvedValue([
      period({ status: 'CLOSED', closedAt: '2026-11-02T10:00:00.000Z' }),
    ]);
    const reopen = vi
      .spyOn(accountingApi, 'reopenFiscalPeriod')
      .mockResolvedValue(period({ reopenReason: 'Ajuste de auditoría externa' }));
    mount(<FiscalPeriodsPage />, manage);

    fireEvent.click(await screen.findByRole('button', { name: 'Reabrir' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Reabrir el período Octubre 2026?' });
    const field = within(dialog).getByRole('textbox', { name: /Motivo de la reapertura/ });
    fireEvent.change(field, { target: { value: 'Ajuste' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reabrir período' }));
    expect(await within(dialog).findByText(/al menos 10 caracteres/)).toBeInTheDocument();
    expect(reopen).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: 'Ajuste de auditoría externa' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reabrir período' }));
    await waitFor(() =>
      expect(reopen).toHaveBeenCalledWith('fp-10', { reason: 'Ajuste de auditoría externa' }),
    );
    expect(await screen.findByText(/ha sido reabierto/)).toBeInTheDocument();
  });

  it('retirar el bloqueo de documentos pide confirmación y muestra el resultado', async () => {
    vi.spyOn(accountingApi, 'fetchDocumentLock').mockResolvedValue({
      current: {
        id: 'lock-1',
        lockedThrough: '2026-09-30',
        reason: 'Corte de septiembre cuadrado',
        createdById: 'u-1',
        createdByName: 'Contadora',
        createdAt: '2026-10-05T12:00:00.000Z',
      },
      history: [],
    });
    const setLock = vi
      .spyOn(accountingApi, 'setDocumentLock')
      .mockRejectedValueOnce(new Error('No tienes permiso para gestionar el bloqueo.'))
      .mockResolvedValueOnce({} as never);
    mount(<DocumentLockCard canManage />, manage);

    await screen.findByText(/Documentos bloqueados hasta el/);
    fireEvent.change(screen.getByRole('textbox', { name: /^Motivo/ }), {
      target: { value: 'Se reabre para registrar compras de septiembre' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retirar bloqueo' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Retirar el bloqueo?' });
    expect(within(dialog).getByTestId('confirm-effects')).toHaveTextContent(
      /Se reabre para registrar compras de septiembre/,
    );
    expect(setLock).not.toHaveBeenCalled();

    // Un error (p. ej. acceso denegado en el servidor) queda dentro del diálogo
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirar bloqueo' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No tienes permiso para gestionar el bloqueo.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirar bloqueo' }));
    await waitFor(() => expect(setLock).toHaveBeenCalledTimes(2));
    expect(setLock.mock.calls[1][0]).toEqual({
      lockedThrough: null,
      reason: 'Se reabre para registrar compras de septiembre',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Bloqueo retirado.');
  });
});

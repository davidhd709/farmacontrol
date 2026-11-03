import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_PERMISSIONS,
  type CreditNoteDto,
  type SaleDto,
  type TreasuryDocumentDto,
} from '@farmacia/contracts';
import { appTheme } from '../src/theme/app-theme';
import { withAuth } from './support-auth';
import * as salesApi from '../src/features/sales/api/sales.api';
import * as treasuryApi from '../src/features/treasury/api/treasury.api';
import { SaleCreditNotesDialog } from '../src/features/sales/components/SaleCreditNotesDialog';
import { CashReceiptsPage } from '../src/features/treasury/pages/TreasuryDocumentsPage';

function renderWith(ui: React.ReactElement, permissions: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={appTheme}>
        <MemoryRouter>{withAuth(ui, permissions)}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

const note = {
  id: 'cn-1',
  creditNoteNumber: 'NC-000001',
  saleId: 'sale-1',
  customerId: 'c-1',
  reason: 'Devuelve',
  subtotal: 4000,
  taxTotal: 0,
  total: 4000,
  refundMethod: 'EFECTIVO',
  restock: true,
  status: 'CONFIRMADA',
  createdById: 'u',
  createdAt: '2026-11-02T15:00:00.000Z',
  lines: [],
} as CreditNoteDto;

const receipt = {
  id: 'rc-1',
  documentType: 'RECIBO_CAJA',
  documentNumber: 'RC-000001',
  documentDate: '2026-11-02',
  amount: '9000.00',
  paymentMethod: 'EFECTIVO',
  source: 'CAJA',
  bankAccountName: null,
  concept: 'Abono',
  referenceDocumentType: null,
  referenceDocumentId: null,
  thirdPartyName: 'Marta',
  origin: 'CARTERA',
  counterpartAccount: null,
  applications: [],
  status: 'VIGENTE',
  cancelledAt: null,
  cancelledByName: null,
  cancellationReason: null,
  createdByName: 'admin',
  createdAt: '2026-11-02T15:00:00.000Z',
} as TreasuryDocumentDto;

beforeEach(() => vi.restoreAllMocks());

describe('Anulación de documentos en la web', () => {
  it('la nota crédito confirmada se anula con motivo desde las devoluciones de la venta', async () => {
    vi.spyOn(salesApi, 'fetchSaleCreditNotes').mockResolvedValue([note]);
    const cancel = vi
      .spyOn(salesApi, 'cancelCreditNote')
      .mockResolvedValue({ ...note, status: 'ANULADA' });
    const onCancelled = vi.fn();
    renderWith(
      <SaleCreditNotesDialog
        sale={{ id: 'sale-1', invoiceNumber: 'FAC-1' } as SaleDto}
        onClose={vi.fn()}
        onCancelled={onCancelled}
      />,
      [SYSTEM_PERMISSIONS.SALES_CANCEL],
    );
    expect(await screen.findByText('NC-000001')).toBeInTheDocument();
    expect(screen.getByText('02/11/2026 10:00 a. m.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Anular' }));
    expect(screen.getByText(/vuelve a salir del inventario/)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Anular NC-000001' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Motivo de la anulación/), {
      target: { value: 'Registrada por error' },
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('cn-1', 'Registrada por error'));
    await waitFor(() => expect(onCancelled).toHaveBeenCalled());
  });

  it('sin permiso de anulación no se ofrece el botón', async () => {
    vi.spyOn(salesApi, 'fetchSaleCreditNotes').mockResolvedValue([note]);
    renderWith(
      <SaleCreditNotesDialog
        sale={{ id: 'sale-1', invoiceNumber: 'FAC-1' } as SaleDto}
        onClose={vi.fn()}
        onCancelled={vi.fn()}
      />,
      [SYSTEM_PERMISSIONS.SALES_READ],
    );
    expect(await screen.findByText('NC-000001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anular' })).toBeNull();
  });

  it('crear el recibo de abono no basta para anularlo: cartera no ve el botón', async () => {
    vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue({
      items: [receipt],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
    renderWith(<CashReceiptsPage />, [
      SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      SYSTEM_PERMISSIONS.CASH_RECEIPTS_COLLECT,
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'RC-000001' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Anular' })).toBeNull();
  });

  it('el recibo de abono se anula desde su detalle con el permiso de anulación', async () => {
    vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue({
      items: [receipt],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
    const cancel = vi
      .spyOn(treasuryApi, 'cancelTreasuryDocument')
      .mockResolvedValue({
        ...receipt,
        status: 'ANULADO',
        cancellationReason: 'Cliente equivocado',
      });
    renderWith(<CashReceiptsPage />, [
      SYSTEM_PERMISSIONS.ACCOUNTING_READ,
      SYSTEM_PERMISSIONS.CASH_RECEIPTS_ANNUL,
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'RC-000001' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anular' }));
    fireEvent.change(within(dialog).getByLabelText(/Motivo de la anulación/), {
      target: { value: 'Cliente equivocado' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar anulación' }));
    await waitFor(() =>
      expect(cancel).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'rc-1' }),
        'Cliente equivocado',
      ),
    );
    expect(await within(dialog).findByText(/Motivo: Cliente equivocado/)).toBeInTheDocument();
  });

  it('un recibo automático no se anula desde tesorería', async () => {
    vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue({
      items: [{ ...receipt, origin: 'AUTOMATICO' }],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
    renderWith(<CashReceiptsPage />, Object.values(SYSTEM_PERMISSIONS));
    fireEvent.click(await screen.findByRole('button', { name: 'RC-000001' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Anular' })).toBeNull();
  });
});

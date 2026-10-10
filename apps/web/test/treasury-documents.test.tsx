import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appTheme } from '../src/theme/app-theme';
import * as treasuryApi from '../src/features/treasury/api/treasury.api';
import {
  CashReceiptsPage,
  DisbursementVouchersPage,
} from '../src/features/treasury/pages/TreasuryDocumentsPage';

function renderPage(page: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={appTheme}>{page}</ThemeProvider>
    </QueryClientProvider>,
  );
}

const egreso = {
  id: 'doc-1',
  documentType: 'COMPROBANTE_EGRESO' as const,
  documentNumber: 'CE-000001',
  documentDate: '2026-10-05',
  amount: '185000.00',
  paymentMethod: 'EFECTIVO',
  source: 'CAJA' as const,
  bankAccountName: null,
  concept: 'Pago energía',
  referenceDocumentType: 'EXPENSE',
  referenceDocumentId: 'exp-1',
  thirdPartyName: 'Air-e S.A. E.S.P.',
  createdByName: 'contadora',
  createdAt: '2026-10-05T15:00:00.000Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Recibos de caja y comprobantes de egreso', () => {
  it('cada apartado consulta solo su tipo de documento', async () => {
    const spy = vi
      .spyOn(treasuryApi, 'getTreasuryDocuments')
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 });
    renderPage(<CashReceiptsPage />);
    expect(await screen.findByText('No hay documentos para los filtros seleccionados.')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'RECIBO_CAJA' }));
  });

  it('lista el comprobante con su tercero y muestra el detalle imprimible', async () => {
    vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue({
      items: [egreso],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
    renderPage(<DisbursementVouchersPage />);
    expect(await screen.findByRole('heading', { name: 'Comprobantes de Egreso' })).toBeInTheDocument();
    expect(await screen.findByText('Air-e S.A. E.S.P.')).toBeInTheDocument();
    expect(screen.getByText('$185.000,00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'CE-000001' }));
    expect(await screen.findByText('Comprobante de egreso CE-000001')).toBeInTheDocument();
    expect(screen.getByText(/Pagado a/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeInTheDocument();
  });
});

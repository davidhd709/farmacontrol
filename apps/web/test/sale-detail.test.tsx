import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS as P, type CreditNoteDto, type SaleDto } from '@farmacia/contracts';
import { appTheme } from '../src/theme/app-theme';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as salesApi from '../src/features/sales/api/sales.api';
import { SaleDetailPage } from '../src/features/sales/pages/SaleDetailPage';
import { SalesHistoryPage } from '../src/features/sales/pages/SalesHistoryPage';

const sale: SaleDto = {
  id: 'sale-1',
  invoiceNumber: 'VEN-000123',
  customerId: 'c-1',
  customerName: 'Consumidor Final',
  customerDocument: '222222222222',
  status: 'COMPLETED',
  paymentMethod: 'EFECTIVO',
  subtotal: 20000,
  taxTotal: 0,
  incTotal: 0,
  discountTotal: 0,
  total: 20000,
  amountPaid: 50000,
  changeGiven: 30000,
  createdById: 'u-1',
  createdByUsername: 'caja1',
  createdAt: '2026-11-12T15:00:00Z',
  lines: [
    {
      id: 'line-1',
      productId: 'p-1',
      productCode: 'ACE500',
      productName: 'Acetaminofén 500 mg',
      presentationId: 'pres-1',
      presentationName: 'Caja x 10',
      presentationFactorHistorical: 10,
      quantityCommercial: 2,
      quantityBaseUnits: 20,
      unitPrice: 10000,
      discount: 0,
      subtotal: 20000,
      taxRate: 0,
      taxAmount: 0,
      incRate: 0,
      incAmount: 0,
      total: 20000,
      lotAllocations: [
        {
          id: 'a-1',
          lotId: 'lot-1',
          lotNumber: 'L-2027A',
          expirationDate: '2027-03-31',
          quantityBaseUnits: 20,
        },
      ],
    },
  ],
};

const note: CreditNoteDto = {
  id: 'nc-1',
  creditNoteNumber: 'NC-000001',
  saleId: 'sale-1',
  customerId: 'c-1',
  reason: 'Producto equivocado',
  subtotal: 5000,
  taxTotal: 0,
  total: 5000,
  refundMethod: 'EFECTIVO',
  restock: true,
  status: 'CONFIRMADA',
  createdById: 'u-1',
  createdAt: '2026-11-12T16:00:00Z',
  lines: [
    {
      id: 'ncl-1',
      creditNoteId: 'nc-1',
      saleLineId: 'line-1',
      productId: 'p-1',
      quantityCommercial: 5,
      quantityBaseUnits: 5,
      unitPrice: 1000,
      subtotal: 5000,
      taxRate: 0,
      taxAmount: 0,
      total: 5000,
      createdAt: '2026-11-12T16:00:00Z',
    },
  ] as CreditNoteDto['lines'],
};

function renderDetail(permissions: string[], path = '/sales/sale-1') {
  const auth: AuthContextValue = {
    user: { id: 'u', username: 'admin', isActive: true, roles: [], permissions },
    status: 'authenticated',
    sessionError: null,
    isLoggingIn: false,
    isLoggingOut: false,
    login: vi.fn(),
    logout: vi.fn(),
    retrySession: vi.fn(),
  };
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/sales" element={<SalesHistoryPage />} />
              <Route path="/sales/:id" element={<SaleDetailPage />} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('Detalle de venta (rediseño fase 1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(salesApi, 'fetchSaleById').mockResolvedValue(sale);
    vi.spyOn(salesApi, 'fetchSaleCreditNotes').mockResolvedValue([]);
  });

  it('muestra datos, presentación con factor, lote con vencimiento y totales', async () => {
    renderDetail([P.SALES_READ]);
    expect(
      await screen.findByRole('heading', { name: 'Venta VEN-000123', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('sale-status')).toHaveTextContent('Completada');
    expect(screen.getByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByText('Caja x 10')).toBeInTheDocument();
    expect(screen.getByText(/× 10 unid\. base/)).toBeInTheDocument();
    expect(screen.getByText(/L-2027A \(20 u\., vence 31\/03\/2027\)/)).toBeInTheDocument();
    const totals = screen.getByRole('region', { name: 'Totales de la venta' });
    expect(within(totals).getByText('Cambio')).toBeInTheDocument();
    expect(screen.getByText('Esta venta no tiene devoluciones.')).toBeInTheDocument();
  });

  it('sin permisos de devolución ni anulación solo ofrece consulta', async () => {
    renderDetail([P.SALES_READ]);
    await screen.findByRole('heading', { name: 'Venta VEN-000123', level: 1 });
    expect(screen.getByRole('button', { name: 'Comprobante' })).toBeInTheDocument();
    expect(screen.queryByTestId('sale-detail-return-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sale-detail-cancel-btn')).not.toBeInTheDocument();
  });

  it('con devoluciones vigentes muestra lo devuelto y explica por qué no se puede anular', async () => {
    vi.mocked(salesApi.fetchSaleCreditNotes).mockResolvedValue([note]);
    renderDetail([P.SALES_READ, P.SALES_CREDIT_NOTE, P.SALES_CANCEL]);
    expect(await screen.findByText('NC-000001')).toBeInTheDocument();
    expect(screen.getByText('5 de 20')).toBeInTheDocument();
    expect(screen.getByTestId('sale-detail-return-btn')).toBeEnabled();
    expect(screen.getByTestId('sale-detail-cancel-btn')).toBeDisabled();
    expect(screen.getByTestId('cancel-blocked-reason')).toHaveTextContent(
      'Tiene una nota crédito vigente: anúlela',
    );
  });

  it('una venta anulada no ofrece devolución ni anulación', async () => {
    vi.mocked(salesApi.fetchSaleById).mockResolvedValue({ ...sale, status: 'CANCELLED' });
    renderDetail([P.SALES_READ, P.SALES_CREDIT_NOTE, P.SALES_CANCEL]);
    expect(await screen.findByTestId('sale-status')).toHaveTextContent('Anulada');
    expect(screen.queryByTestId('sale-detail-return-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sale-detail-cancel-btn')).not.toBeInTheDocument();
  });

  it('anula pidiendo motivo, bloquea el doble envío y conserva el motivo si el servidor falla', async () => {
    const user = userEvent.setup();
    let reject!: (err: Error) => void;
    const cancel = vi
      .spyOn(salesApi, 'cancelSale')
      .mockImplementation(() => new Promise((_, r) => (reject = r)));
    renderDetail([P.SALES_READ, P.SALES_CANCEL]);
    await user.click(await screen.findByTestId('sale-detail-cancel-btn'));
    const dialog = await screen.findByTestId('cancel-sale-dialog');
    const confirm = within(dialog).getByTestId('confirm-cancel-sale-btn');
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Motivo de la anulación/), 'Venta duplicada');
    await user.click(confirm);
    // Mientras se envía, el botón queda deshabilitado: no hay segundo envío
    expect(within(dialog).getByRole('button', { name: /Anulando/ })).toBeDisabled();
    expect(cancel).toHaveBeenCalledTimes(1);
    reject(new Error('La venta tiene abonos vigentes.'));
    expect(await within(dialog).findByText('La venta tiene abonos vigentes.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Motivo de la anulación/)).toHaveValue('Venta duplicada');
  });

  it('si la venta no carga ofrece reintentar y volver al historial', async () => {
    vi.mocked(salesApi.fetchSaleById).mockRejectedValue(new Error('Venta no encontrada.'));
    renderDetail([P.SALES_READ]);
    expect(await screen.findByText('Venta no encontrada.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al historial de ventas' })).toHaveAttribute(
      'href',
      '/sales',
    );
  });

  it('el número de comprobante del historial lleva al detalle', async () => {
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValue({
      items: [sale],
      total: 1,
      page: 1,
      limit: 100,
    } as never);
    const user = userEvent.setup();
    renderDetail([P.SALES_READ], '/sales');
    await user.click(await screen.findByTestId('sale-detail-link-sale-1'));
    expect(
      await screen.findByRole('heading', { name: 'Venta VEN-000123', level: 1 }),
    ).toBeInTheDocument();
  });
});

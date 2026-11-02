import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS, type ReceivableDto } from '@farmacia/contracts';
import { withAuth } from './support-auth';
import * as receivablesApi from '../src/features/receivables/api/receivables.api';
import { ReceivablesPage } from '../src/features/receivables/pages/ReceivablesPage';
import { appTheme } from '../src/theme/app-theme';

const mockReceivables: ReceivableDto[] = [
  {
    id: 'rec-1',
    saleId: 'sale-1',
    invoiceNumber: 'FAC-001',
    customerId: 'cust-1',
    customerName: 'Carlos Gómez',
    totalAmount: 150000,
    amountPaid: 50000,
    balance: 100000,
    status: 'PENDIENTE',
    dueDate: '2026-10-31',
    notes: 'Crédito 30 días',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    payments: [],
  },
  {
    id: 'rec-2',
    saleId: 'sale-2',
    invoiceNumber: 'FAC-002',
    customerId: 'cust-2',
    customerName: 'María Rodríguez',
    totalAmount: 45000,
    amountPaid: 45000,
    balance: 0,
    status: 'PAGADA',
    dueDate: '2026-09-15',
    notes: null,
    createdAt: '2026-08-15T12:00:00.000Z',
    updatedAt: '2026-08-20T14:00:00.000Z',
    payments: [],
  },
];

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          {withAuth(<ReceivablesPage />, [SYSTEM_PERMISSIONS.RECEIVABLES_MANAGE])}
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

describe('ReceivablesPage (Frontend Cuentas por Cobrar — UX-21)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(receivablesApi, 'fetchReceivables').mockResolvedValue({
      items: mockReceivables,
      total: mockReceivables.length,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    });
  });

  it('renderiza la lista de cuentas por cobrar y métricas de saldo', async () => {
    renderPage();

    expect(screen.getByText('Cuentas por Cobrar')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Carlos Gómez')).toBeInTheDocument();
      expect(screen.getByText('María Rodríguez')).toBeInTheDocument();
      expect(screen.getByText('FAC-001')).toBeInTheDocument();
      expect(screen.getByText('FAC-002')).toBeInTheDocument();
    });
  });

  it('no registra abonos en cartera: "Ver abonos" muestra los movimientos con su recibo de caja y saldo', async () => {
    vi.spyOn(receivablesApi, 'fetchReceivableMovements').mockResolvedValue({
      receivableId: 'rec-1',
      invoiceNumber: 'FAC-001',
      customerName: 'Carlos Gómez',
      totalAmount: '150000.00',
      amountPaid: '50000.00',
      balance: '100000.00',
      status: 'PENDIENTE',
      dueDate: '2026-10-31',
      movements: [
        { date: '2026-09-01T10:00:00.000Z', type: 'CARGO', documentNumber: 'FAC-001', description: 'Venta a crédito', charge: '150000.00', credit: '0.00', balance: '150000.00' },
        { date: '2026-09-10T10:00:00.000Z', type: 'ABONO', documentNumber: 'RC-000007', description: 'Abono', paymentMethod: 'EFECTIVO', paymentId: 'pay-1', isReversed: false, charge: '0.00', credit: '50000.00', balance: '100000.00' },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Carlos Gómez')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^Abonar$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Ver Abonos/i })[0]);
    expect(await screen.findByText('RC-000007')).toBeInTheDocument();
    expect(screen.getByText(/registra un recibo de caja/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Monto del abono/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revertir' }));
    expect(await screen.findByText('Revertir Abono de Cliente')).toBeInTheDocument();
  });
});

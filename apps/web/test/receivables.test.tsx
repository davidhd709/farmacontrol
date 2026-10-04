import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReceivableDto } from '@farmacia/contracts';
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
          <ReceivablesPage />
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
    vi.spyOn(receivablesApi, 'fetchReceivableById').mockResolvedValue(mockReceivables[0]);
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

  it('abre el modal de abono al hacer click en Abonar', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Carlos Gómez')).toBeInTheDocument();
    });

    const abonarButton = screen.getByRole('button', { name: /Abonar/i });
    fireEvent.click(abonarButton);

    await waitFor(() => {
      expect(screen.getByText('Cuenta por Cobrar')).toBeInTheDocument();
      expect(screen.getByLabelText(/Monto del abono/i)).toBeInTheDocument();
    });
  });

  it('permite registrar un abono exitosamente', async () => {
    const registerPaymentSpy = vi
      .spyOn(receivablesApi, 'registerReceivablePayment')
      .mockResolvedValue({
        ...mockReceivables[0],
        amountPaid: 100000,
        balance: 50000,
      });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Carlos Gómez')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Abonar/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Monto del abono/i)).toBeInTheDocument();
    });

    const amountInput = screen.getByLabelText(/Monto del abono/i);
    fireEvent.change(amountInput, { target: { value: '50000' } });

    const submitBtn = screen.getByRole('button', { name: /Registrar Abono/i });
    fireEvent.click(submitBtn);

    const confirmBtn = await screen.findByRole('button', { name: /Confirmar y Abonar/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(registerPaymentSpy).toHaveBeenCalledWith('rec-1', expect.objectContaining({
        amount: '50000',
        paymentMethod: 'EFECTIVO',
      }), expect.any(String));
    });
  });
});

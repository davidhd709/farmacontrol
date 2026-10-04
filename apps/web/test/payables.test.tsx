import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayableDto } from '@farmacia/contracts';
import * as payablesApi from '../src/features/payables/api/payables.api';
import { PayablesPage } from '../src/features/payables/pages/PayablesPage';
import { appTheme } from '../src/theme/app-theme';

const mockPayables: PayableDto[] = [
  {
    id: 'pay-1',
    purchaseId: 'purch-1',
    invoiceNumber: 'FAC-PROV-101',
    supplierId: 'sup-1',
    supplierName: 'Distribuciones Farmacéuticas del Valle',
    totalAmount: 500000,
    amountPaid: 200000,
    balance: 300000,
    status: 'PENDIENTE',
    dueDate: '2026-11-30',
    notes: 'Pago a 60 días',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    payments: [],
  },
  {
    id: 'pay-2',
    purchaseId: 'purch-2',
    invoiceNumber: 'FAC-PROV-102',
    supplierId: 'sup-2',
    supplierName: 'Laboratorios Genéricos SAS',
    totalAmount: 180000,
    amountPaid: 180000,
    balance: 0,
    status: 'PAGADA',
    dueDate: '2026-09-10',
    notes: null,
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-25T14:00:00.000Z',
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
          <PayablesPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

describe('PayablesPage (Frontend Cuentas por Pagar — UX-23)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(payablesApi, 'fetchPayables').mockResolvedValue({
      items: mockPayables,
      total: mockPayables.length,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    });
    vi.spyOn(payablesApi, 'fetchPayableById').mockResolvedValue(mockPayables[0]);
  });

  it('renderiza la lista de cuentas por pagar a proveedores', async () => {
    renderPage();

    expect(screen.getByText('Cuentas por Pagar')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Distribuciones Farmacéuticas del Valle')).toBeInTheDocument();
      expect(screen.getByText('Laboratorios Genéricos SAS')).toBeInTheDocument();
      expect(screen.getByText('FAC-PROV-101')).toBeInTheDocument();
      expect(screen.getByText('FAC-PROV-102')).toBeInTheDocument();
    });
  });

  it('abre el modal de pago al hacer click en Pagar', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Distribuciones Farmacéuticas del Valle')).toBeInTheDocument();
    });

    const pagarButton = screen.getByRole('button', { name: /Pagar/i });
    fireEvent.click(pagarButton);

    await waitFor(() => {
      expect(screen.getByText('Cuenta por Pagar')).toBeInTheDocument();
      expect(screen.getByLabelText(/Monto del pago/i)).toBeInTheDocument();
    });
  });

  it('permite registrar un pago a proveedor exitosamente', async () => {
    const registerPaymentSpy = vi
      .spyOn(payablesApi, 'registerPayablePayment')
      .mockResolvedValue({
        ...mockPayables[0],
        amountPaid: 350000,
        balance: 150000,
      });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Distribuciones Farmacéuticas del Valle')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Pagar/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Monto del pago/i)).toBeInTheDocument();
    });

    const amountInput = screen.getByLabelText(/Monto del pago/i);
    fireEvent.change(amountInput, { target: { value: '150000' } });

    const submitBtn = screen.getByRole('button', { name: /Pagar Proveedor/i });
    fireEvent.click(submitBtn);

    const confirmBtn = await screen.findByRole('button', { name: 'Confirmar y Pagar' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(registerPaymentSpy).toHaveBeenCalledWith('pay-1', expect.objectContaining({
        amount: '150000',
        paymentMethod: 'EFECTIVO',
      }), expect.any(String));
    });
  });
});

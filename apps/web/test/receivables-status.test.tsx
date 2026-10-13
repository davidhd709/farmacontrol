import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReceivableDto, ReceivableQueryFilters } from '@farmacia/contracts';
import * as receivablesApi from '../src/features/receivables/api/receivables.api';
import { ReceivablesPage } from '../src/features/receivables/pages/ReceivablesPage';
import { appTheme } from '../src/theme/app-theme';

const base = {
  customerId: 'cust-1',
  notes: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  payments: [],
};

const pending: ReceivableDto = {
  ...base,
  id: 'rec-pend',
  saleId: 'sale-pend',
  invoiceNumber: 'FAC-101',
  customerName: 'Carlos Gómez',
  totalAmount: '150000.00',
  amountPaid: '50000.00',
  balance: '100000.00',
  status: 'PENDIENTE',
  dueDate: '2099-10-31',
};
const paid: ReceivableDto = {
  ...base,
  id: 'rec-paid',
  saleId: 'sale-paid',
  invoiceNumber: 'FAC-102',
  customerName: 'María Rodríguez',
  totalAmount: '45000.00',
  amountPaid: '45000.00',
  balance: '0.00',
  status: 'PAGADA',
  dueDate: '2099-09-15',
};
const annulled: ReceivableDto = {
  ...base,
  id: 'rec-anul',
  saleId: 'sale-anul',
  invoiceNumber: 'FAC-103',
  customerName: 'Laura Martínez',
  totalAmount: '80000.00',
  amountPaid: '0.00',
  balance: '80000.00',
  status: 'ANULADA',
  dueDate: '2099-11-20',
  notes: 'Venta anulada: Cliente desiste de la compra',
};

let dataset: ReceivableDto[] = [];

function mockApi() {
  vi.spyOn(receivablesApi, 'fetchReceivables').mockImplementation(
    async (filters: ReceivableQueryFilters = {}) => {
      const items = dataset.filter((r) => !filters.status || r.status === filters.status);
      return { items, total: items.length, page: 1, pageSize: 20, totalPages: 1 };
    },
  );
  vi.spyOn(receivablesApi, 'fetchReceivableById').mockImplementation(async (id: string) =>
    dataset.find((r) => r.id === id)!,
  );
  vi.spyOn(receivablesApi, 'fetchReceivablesAgingSummary').mockResolvedValue({
    current: { amount: '100000.00', count: 1 },
    days1To30: { amount: '0.00', count: 0 },
    days31To60: { amount: '0.00', count: 0 },
    days61To90: { amount: '0.00', count: 0 },
    daysOver90: { amount: '0.00', count: 0 },
    totalPending: '100000.00',
    totalCount: 1,
  });
}

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

const rowOf = (invoice: string) => screen.getByText(invoice).closest('tr') as HTMLElement;

describe('ReceivablesPage: estados de cartera (FARM-AUD-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataset = [pending, paid, annulled];
    mockApi();
  });

  it('Caso 3: muestra una cuenta anulada con su etiqueta, cliente, documento y saldo', async () => {
    renderPage();

    const row = await waitFor(() => rowOf('FAC-103'));
    expect(within(row).getByText('Laura Martínez')).toBeInTheDocument();
    expect(within(row).getByText('Anulada')).toBeInTheDocument();
    expect(within(row).getAllByText(/80\.000,00/).length).toBeGreaterThan(0);
    expect(within(rowOf('FAC-101')).getByText('Pendiente')).toBeInTheDocument();
    expect(within(rowOf('FAC-102')).getByText('Pagada')).toBeInTheDocument();
  });

  it('el detalle de una cuenta anulada explica que no es deuda pendiente y no permite abonar', async () => {
    renderPage();
    await waitFor(() => rowOf('FAC-103'));

    fireEvent.click(within(rowOf('FAC-103')).getByRole('button', { name: 'Detalle' }));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(dialog).getByText(/venta de origen fue anulada/i)).toBeInTheDocument();
    });
    expect(within(dialog).getByText('Anulada')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Monto del abono/i)).not.toBeInTheDocument();
  });

  it.each([
    ['Pendiente', 'PENDIENTE', 'FAC-101'],
    ['Pagada', 'PAGADA', 'FAC-102'],
    ['Anulada', 'ANULADA', 'FAC-103'],
  ])(
    'Caso 4: el filtro %s solicita y muestra solo sus registros',
    async (label, status, invoice) => {
      renderPage();
      await waitFor(() => rowOf('FAC-101'));

      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Estado' }));
      fireEvent.click(await screen.findByRole('option', { name: label }));

      // La lista conserva los datos anteriores mientras llega la respuesta filtrada
      await waitFor(() => {
        expect(receivablesApi.fetchReceivables).toHaveBeenLastCalledWith(
          expect.objectContaining({ status }),
        );
        expect(screen.getByText(invoice)).toBeInTheDocument();
        for (const other of ['FAC-101', 'FAC-102', 'FAC-103'].filter((i) => i !== invoice)) {
          expect(screen.queryByText(other)).not.toBeInTheDocument();
        }
      });
    },
  );

  it('Caso 6: un estado desconocido no rompe la pantalla y se informa como no reconocido', async () => {
    const unknown = {
      ...annulled,
      id: 'rec-unknown',
      invoiceNumber: 'FAC-104',
      customerName: 'Pedro Ruiz',
      status: 'CANCELADA',
    } as unknown as ReceivableDto;
    dataset = [pending, unknown];

    renderPage();

    const row = await waitFor(() => rowOf('FAC-104'));
    expect(within(row).getByText('Pedro Ruiz')).toBeInTheDocument();
    expect(within(row).getByText(/Estado no reconocido: CANCELADA/)).toBeInTheDocument();
    // No se disfraza de pagada ni anulada, y la fila conocida sigue mostrándose
    expect(within(row).queryByText('Pagada')).not.toBeInTheDocument();
    expect(within(row).queryByText('Anulada')).not.toBeInTheDocument();
    expect(within(rowOf('FAC-101')).getByText('Pendiente')).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: 'Detalle' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(dialog).getByText(/no es reconocido/i)).toBeInTheDocument();
    });
    expect(within(dialog).queryByLabelText(/Monto del abono/i)).not.toBeInTheDocument();
  });
});

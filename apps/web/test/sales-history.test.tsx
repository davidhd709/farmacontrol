import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES, type SaleDto } from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as salesApi from '../src/features/sales/api/sales.api';
import { SalesHistoryPage } from '../src/features/sales/pages/SalesHistoryPage';
import { appTheme } from '../src/theme/app-theme';

const mockSalesList: SaleDto[] = [
  {
    id: 'sale-001',
    invoiceNumber: 'VEN-20260926-0001',
    customerId: 'cust-1',
    customerName: 'Consumidor Final',
    customerDocument: '222222222222',
    status: 'COMPLETED',
    paymentMethod: 'EFECTIVO',
    subtotal: 5000,
    taxTotal: 0,
    discountTotal: 0,
    total: 5000,
    amountPaid: 10000,
    changeGiven: 5000,
    createdById: 'user-cajero',
    createdByUsername: 'cajero_1',
    lines: [
      {
        id: 'line-1',
        productId: 'prod-1',
        productName: 'Ibuprofeno 800mg',
        presentationFactorHistorical: 1,
        quantityCommercial: 5,
        quantityBaseUnits: 5,
        unitPrice: 1000,
        discount: 0,
        subtotal: 5000,
        taxRate: 0,
        taxAmount: 0,
        total: 5000,
      },
    ],
    createdAt: '2026-09-26T14:30:00.000Z',
  },
  {
    id: 'sale-002',
    invoiceNumber: 'VEN-20260926-0002',
    customerId: 'cust-2',
    customerName: 'Juan Pérez',
    customerDocument: '1017123456',
    status: 'CANCELLED',
    paymentMethod: 'TARJETA_DEBITO',
    subtotal: 12000,
    taxTotal: 0,
    discountTotal: 0,
    total: 12000,
    amountPaid: 12000,
    changeGiven: 0,
    notes: 'Anulada por error en producto',
    createdById: 'user-cajero',
    createdByUsername: 'cajero_1',
    lines: [],
    createdAt: '2026-09-26T15:00:00.000Z',
  },
];

const mockAuthContext: AuthContextValue = {
  user: {
    id: 'user-admin',
    username: 'admin_1',
    isActive: true,
    roles: [SYSTEM_ROLES.ADMIN],
    permissions: [
      SYSTEM_PERMISSIONS.SALES_CREATE,
      SYSTEM_PERMISSIONS.SALES_READ,
      SYSTEM_PERMISSIONS.SALES_CANCEL,
    ],
  },
  roles: [SYSTEM_ROLES.ADMIN],
  permissions: [
    SYSTEM_PERMISSIONS.SALES_CREATE,
    SYSTEM_PERMISSIONS.SALES_READ,
    SYSTEM_PERMISSIONS.SALES_CANCEL,
  ],
  status: 'authenticated',
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
  isLoggingIn: false,
  isLoggingOut: false,
};

const renderComponent = () => {
  return render(
    <ThemeProvider theme={appTheme}>
      <MemoryRouter>
        <AuthContext.Provider value={mockAuthContext}>
          <SalesHistoryPage />
        </AuthContext.Provider>
      </MemoryRouter>
    </ThemeProvider>,
  );
};

describe('SalesHistoryPage (Frontend Historial y Anulación UX-04 / UX-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValue({
      items: mockSalesList,
      total: 2,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    });
    vi.spyOn(salesApi, 'cancelSale').mockResolvedValue({
      ...mockSalesList[0],
      status: 'CANCELLED',
    });
  });

  it('debe listar las ventas históricas con sus estados y totales', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('VEN-20260926-0001')).toBeInTheDocument();
      expect(screen.getByText('VEN-20260926-0002')).toBeInTheDocument();
    });

    expect(screen.getByText('Consumidor Final')).toBeInTheDocument();
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('Completada')).toBeInTheDocument();
    expect(screen.getByText('Anulada')).toBeInTheDocument();
  });

  it('debe abrir el diálogo de comprobante al presionar "Comprobante"', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('VEN-20260926-0001')).toBeInTheDocument();
    });

    const receiptBtn = screen.getByTestId('view-receipt-btn-sale-001');
    fireEvent.click(receiptBtn);

    expect(await screen.findByText(/Comprobante N°: VEN-20260926-0001/i)).toBeInTheDocument();

    const receiptDialog = screen.getByRole('dialog');
    expect(receiptDialog).toHaveClass('sale-receipt-print');
    expect(screen.queryByText(/NIT:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Régimen Común/i)).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Descuento' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Total línea' })).toBeInTheDocument();

    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir Comprobante' }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('debe permitir anular una venta completada solicitando motivo obligatorio (HU-019)', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('VEN-20260926-0001')).toBeInTheDocument();
    });

    // La venta completada tiene botón de anular
    const cancelBtn = screen.getByTestId('cancel-sale-btn-sale-001');
    fireEvent.click(cancelBtn);

    // Diálogo de confirmación con advertencia irreversible
    expect(await screen.findByTestId('cancel-sale-dialog')).toBeInTheDocument();
    expect(
      screen.getByText(/Esta acción restituirá el stock automáticamente a los lotes originales/i),
    ).toBeInTheDocument();

    const confirmCancelBtn = screen.getByTestId('confirm-cancel-sale-btn');
    expect(confirmCancelBtn).toBeDisabled();

    // Escribimos motivo válido
    const reasonInput = screen.getByTestId('cancel-reason-input').querySelector('textarea')!;
    fireEvent.change(reasonInput, {
      target: { value: 'Devolución de cliente por medicamento incorrecto' },
    });

    expect(confirmCancelBtn).not.toBeDisabled();
    fireEvent.click(confirmCancelBtn);

    await waitFor(() => {
      expect(salesApi.cancelSale).toHaveBeenCalledWith(
        'sale-001',
        'Devolución de cliente por medicamento incorrecto',
      );
    });
  });
});

import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  type CustomerDto,
  type ProductDto,
  type SaleDto,
} from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as customersApi from '../src/features/customers/api/customers.api';
import * as productsApi from '../src/features/catalog/api/products.api';
import * as salesApi from '../src/features/sales/api/sales.api';
import { PosPage } from '../src/features/sales/pages/PosPage';
import { appTheme } from '../src/theme/app-theme';

const mockDefaultCustomer: CustomerDto = {
  id: 'cust-default',
  documentType: 'CC',
  documentNumber: '222222222222',
  name: 'Consumidor Final',
  isDefault: true,
  isActive: true,
  createdAt: '2026-09-26T00:00:00.000Z',
  updatedAt: '2026-09-26T00:00:00.000Z',
};

const mockProduct: ProductDto = {
  id: 'prod-1',
  categoryId: 'cat-1',
  code: 'MED-001',
  barcode: '7701234567890',
  name: 'Acetaminofén 500mg',
  genericName: 'Acetaminofén',
  concentration: '500mg',
  sanitaryRegistry: 'INVIMA 2020M-001',
  manufacturer: 'Genfar',
  description: 'Analgésico',
  requiresLotControl: true,
  prescriptionRequired: false,
  baseUnit: 'TABLETA',
  basePrice: '500.00',
  baseCost: '250.00',
  isActive: true,
  createdAt: '2026-09-26T00:00:00.000Z',
  updatedAt: '2026-09-26T00:00:00.000Z',
};

const mockConfirmedSale: SaleDto = {
  id: 'sale-123',
  invoiceNumber: 'VEN-20260926-0001',
  customerId: 'cust-default',
  customerName: 'Consumidor Final',
  customerDocument: '222222222222',
  status: 'COMPLETED',
  paymentMethod: 'EFECTIVO',
  subtotal: 1000,
  taxTotal: 0,
  discountTotal: 0,
  total: 1000,
  amountPaid: 2000,
  changeGiven: 1000,
  createdById: 'user-cajero',
  createdByUsername: 'cajero_1',
  lines: [
    {
      id: 'line-1',
      productId: 'prod-1',
      productName: 'Acetaminofén 500mg',
      presentationFactorHistorical: 1,
      quantityCommercial: 2,
      quantityBaseUnits: 2,
      unitPrice: 500,
      discount: 0,
      subtotal: 1000,
      taxRate: 0,
      taxAmount: 0,
      total: 1000,
      lotAllocations: [
        {
          id: 'alloc-1',
          lotId: 'lot-1',
          lotNumber: 'LOT-A1',
          expirationDate: '2027-01-01',
          quantityBaseUnits: 2,
        },
      ],
    },
  ],
  createdAt: '2026-09-26T16:00:00.000Z',
};

const mockAuthContext: AuthContextValue = {
  user: {
    id: 'user-cajero',
    username: 'cajero_1',
    isActive: true,
    roles: [SYSTEM_ROLES.CAJERO],
    permissions: [
      SYSTEM_PERMISSIONS.SALES_CREATE,
      SYSTEM_PERMISSIONS.SALES_READ,
    ],
  },
  roles: [SYSTEM_ROLES.CAJERO],
  permissions: [
    SYSTEM_PERMISSIONS.SALES_CREATE,
    SYSTEM_PERMISSIONS.SALES_READ,
  ],
  status: 'authenticated',
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
  isLoggingIn: false,
  isLoggingOut: false,
};

const renderComponent = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={mockAuthContext}>
            <PosPage />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

describe('PosPage (Frontend POS UX-03 / HU-017)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(customersApi, 'fetchDefaultCustomer').mockResolvedValue(mockDefaultCustomer);
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue({
      items: [mockProduct],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
    vi.spyOn(salesApi, 'confirmSale').mockResolvedValue(mockConfirmedSale);
  });

  it('debe cargar y mostrar el cliente por defecto Consumidor Final', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Consumidor Final')).toBeInTheDocument();
    });

    expect(screen.getByText(/Doc: 222222222222/)).toBeInTheDocument();
  });

  it('debe permitir buscar un producto y agregarlo al carrito de compras', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Consumidor Final')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText(/Buscar producto por nombre/i);
    fireEvent.change(searchInput, { target: { value: 'Aceta' } });

    await waitFor(() => {
      expect(productsApi.fetchProducts).toHaveBeenCalledWith({ search: 'Aceta' });
    });

    const option = await screen.findByRole('option');
    fireEvent.click(option);

    await waitFor(() => {
      expect(screen.getByText('TOTAL A PAGAR')).toBeInTheDocument();
      expect(screen.getByText('Acetaminofén 500mg')).toBeInTheDocument();
    });
  });

  it('debe abrir el diálogo de pago y liquidar la venta en efectivo', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Consumidor Final')).toBeInTheDocument();
    });

    // Buscamos y agregamos producto con click en opción
    const searchInput = screen.getByLabelText(/Buscar producto por nombre/i);
    fireEvent.change(searchInput, { target: { value: 'Acetaminofén' } });
    await waitFor(() => {
      expect(productsApi.fetchProducts).toHaveBeenCalledWith({ search: 'Acetaminofén' });
    });
    const option = await screen.findByRole('option');
    fireEvent.click(option);

    await waitFor(() => {
      expect(screen.getByText('Acetaminofén 500mg')).toBeInTheDocument();
    });

    // Botón Cobrar (F12)
    const cobrarBtn = screen.getByRole('button', { name: /Cobrar /i });
    expect(cobrarBtn).not.toBeDisabled();
    fireEvent.click(cobrarBtn);

    // Diálogo de Pago abierto
    expect(await screen.findByText('Cobro y Liquidación de Venta')).toBeInTheDocument();

    // Ingresamos dinero recibido
    const cashInput = screen.getByLabelText(/Efectivo Recibido/i);
    fireEvent.change(cashInput, { target: { value: '2000' } });

    // Confirmamos la venta
    const confirmBtn = screen.getByTestId('confirm-payment-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(salesApi.confirmSale).toHaveBeenCalled();
    });

    // Se muestra el Comprobante de venta (HU-018)
    expect(await screen.findByText(/Comprobante N°: VEN-20260926-0001/i)).toBeInTheDocument();
  });
});

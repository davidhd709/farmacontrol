import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES, type PurchaseDto, type SupplierDto, type ProductDto } from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as purchasesApi from '../src/features/purchases/api/purchases.api';
import * as suppliersApi from '../src/features/suppliers/api/suppliers.api';
import * as productsApi from '../src/features/catalog/api/products.api';
import { PurchasesListPage } from '../src/features/purchases/pages/PurchasesListPage';
import { ReceivePurchasePage } from '../src/features/purchases/pages/ReceivePurchasePage';
import { appTheme } from '../src/theme/app-theme';

const mockSuppliers: SupplierDto[] = [
  {
    id: 'sup-1',
    taxId: '900111222-1',
    name: 'Distribuidora Médica del Norte',
    contactName: 'Carlos Gómez',
    phone: '3001112233',
    email: 'ventas@distrimedica.com',
    address: 'Calle 10 # 20-30',
    isActive: true,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
];

const mockProducts: ProductDto[] = [
  {
    id: 'prod-1',
    categoryId: 'cat-1',
    code: 'AMX-500',
    name: 'Amoxicilina 500mg',
    basePrice: '1200.00',
    baseCost: '800.00',
    baseUnit: 'UNIDAD',
    requiresLotControl: true,
    prescriptionRequired: true,
    isActive: true,
    presentationsCount: 0,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
];

const mockPurchases: PurchaseDto[] = [
  {
    id: 'purch-1',
    supplierId: 'sup-1',
    supplierName: 'Distribuidora Médica del Norte',
    supplierTaxId: '900111222-1',
    invoiceNumber: 'FAC-2026-789',
    purchaseDate: '2026-09-26',
    totalAmount: '80000.00',
    status: 'RECEIVED',
    notes: 'Entrega inicial',
    lines: [
      {
        id: 'line-1',
        purchaseId: 'purch-1',
        productId: 'prod-1',
        productName: 'Amoxicilina 500mg',
        lotId: 'lot-1',
        lotNumber: 'LOTE-AMX-2026',
        expirationDate: '2028-12-31',
        quantityCommercial: '100.0000',
        quantityBaseUnits: 100,
        unitCost: '800.00',
        subtotal: '80000.00',
        createdAt: '2026-09-26T10:00:00.000Z',
      },
    ],
    createdAt: '2026-09-26T10:00:00.000Z',
    updatedAt: '2026-09-26T10:00:00.000Z',
  },
];

function createMockAuthContext(permissions: string[] = []): AuthContextValue {
  return {
    user: {
      id: 'usr-1',
      username: 'admin_farmacia',
      isActive: true,
      roles: [SYSTEM_ROLES.ADMIN],
      permissions,
    },
    status: 'authenticated',
    login: vi.fn(),
    logout: vi.fn(),
    refreshSession: vi.fn(),
  };
}

describe('Purchases Frontend (UX-15 & UX-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(suppliersApi, 'fetchSuppliers').mockResolvedValue({
      items: mockSuppliers,
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue({
      items: mockProducts,
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    vi.spyOn(purchasesApi, 'fetchPurchases').mockResolvedValue({
      items: mockPurchases,
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    vi.spyOn(purchasesApi, 'receivePurchase').mockResolvedValue(mockPurchases[0]);
  });

  describe('PurchasesListPage (UX-15)', () => {
    it('renderiza la lista de facturas de compras y abre el detalle', async () => {
      const authValue = createMockAuthContext([
        SYSTEM_PERMISSIONS.PURCHASES_READ,
        SYSTEM_PERMISSIONS.PURCHASES_RECEIVE,
      ]);

      const user = userEvent.setup();
      render(
        <ThemeProvider theme={appTheme}>
          <MemoryRouter>
            <AuthContext.Provider value={authValue}>
              <PurchasesListPage />
            </AuthContext.Provider>
          </MemoryRouter>
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Historial de Compras y Abastecimiento/i)).toBeInTheDocument();
        expect(screen.getByText('FAC-2026-789')).toBeInTheDocument();
        expect(screen.getByText('Distribuidora Médica del Norte')).toBeInTheDocument();
        expect(screen.getByText(/\$80[.,]000/)).toBeInTheDocument();
      });

      // Clic en Ver Detalle
      const detailBtn = screen.getByRole('button', { name: 'Ver Detalle' });
      await user.click(detailBtn);

      await waitFor(() => {
        expect(screen.getByText('Detalle de Factura de Compra: FAC-2026-789')).toBeInTheDocument();
        expect(screen.getByText('LOTE-AMX-2026')).toBeInTheDocument();
      });
    });
  });

  describe('ReceivePurchasePage (UX-16)', () => {
    it('renderiza el formulario de captura dinámica de compras', async () => {
      const authValue = createMockAuthContext([SYSTEM_PERMISSIONS.PURCHASES_RECEIVE]);

      render(
        <ThemeProvider theme={appTheme}>
          <MemoryRouter>
            <AuthContext.Provider value={authValue}>
              <ReceivePurchasePage />
            </AuthContext.Provider>
          </MemoryRouter>
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Recepción de Compras e Ingreso de Lotes/i)).toBeInTheDocument();
        expect(screen.getByText('Datos del Comprobante / Factura')).toBeInTheDocument();
        expect(screen.getByText('Confirmar Recepción de Compra')).toBeInTheDocument();
      });
    });
  });
});

import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  type PurchaseDto,
  type SupplierDto,
  type ProductDto,
} from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as purchasesApi from '../src/features/purchases/api/purchases.api';
import * as suppliersApi from '../src/features/suppliers/api/suppliers.api';
import * as productsApi from '../src/features/catalog/api/products.api';
import { PurchasesListPage } from '../src/features/purchases/pages/PurchasesListPage';
import { ReceivePurchasePage } from '../src/features/purchases/pages/ReceivePurchasePage';
import { DebitNoteDialog } from '../src/features/purchases/components/DebitNoteDialog';
import * as accountingApi from '../src/features/accounting/api/accounting.api';
import { businessToday, addDaysToDate } from '../src/utils/business-date';
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
    inventoryControlMode: 'LOT_EXPIRY',
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
        </ThemeProvider>,
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
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/Recepción de Compras e Ingreso de Lotes/i)).toBeInTheDocument();
        expect(screen.getByText('Datos del Comprobante / Factura')).toBeInTheDocument();
        expect(screen.getByText('Confirmar Recepción de Compra')).toBeInTheDocument();
      });
    });
  });
  async function choose(user: ReturnType<typeof userEvent.setup>, label: RegExp, option: RegExp) {
    await user.click(screen.getByRole('combobox', { name: label }));
    await user.click(screen.getByRole('option', { name: option }));
  }

  it('recepción inválida muestra errores por campo, enfoca el proveedor y no llama a la API', async () => {
    render(
      <MemoryRouter>
        <ReceivePurchasePage />
      </MemoryRouter>,
    );
    const submit = await screen.findByRole('button', { name: 'Confirmar Recepción de Compra' });
    fireEvent.click(submit);
    expect(await screen.findByText('Debes seleccionar un proveedor.')).toBeInTheDocument();
    expect(screen.getByText('El número de factura es obligatorio.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Proveedor/ })).toHaveFocus());
    expect(purchasesApi.receivePurchase).not.toHaveBeenCalled();
  });

  it('recepción manda el payload original una sola vez', async () => {
    const user = userEvent.setup();
    vi.mocked(purchasesApi.receivePurchase).mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <ReceivePurchasePage />
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'Confirmar Recepción de Compra' });
    await choose(user, /Proveedor/, /Distribuidora/);
    fireEvent.change(screen.getByLabelText(/Número de Factura/), { target: { value: ' fac-42 ' } });
    await choose(user, /^Producto/, /Amoxicilina/);
    fireEvent.change(screen.getByLabelText(/Número de Lote/), { target: { value: ' lote-42 ' } });
    fireEvent.change(screen.getByLabelText(/^Fecha de Vencimiento \*/), {
      target: { value: '2099-12-31' },
    });
    fireEvent.change(screen.getByLabelText(/^Cantidad/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Observaciones/), {
      target: { value: ' Entrega completa ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Recepción de Compra' }));
    const confirm = await screen.findByRole('button', { name: 'Sí, Confirmar Recepción' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    const date = businessToday();
    const due = addDaysToDate(date, 30);
    await waitFor(() =>
      expect(purchasesApi.receivePurchase).toHaveBeenCalledExactlyOnceWith({
        supplierId: 'sup-1',
        invoiceNumber: 'FAC-42',
        purchaseDate: date,
        dueDate: due,
        paymentCondition: 'CREDITO',
        notes: `[Factura Vence: ${due} | Condición: Crédito (30 días)] Entrega completa`,
        lines: [
          {
            productId: 'prod-1',
            presentationId: null,
            lotNumber: 'LOTE-42',
            expirationDate: '2099-12-31',
            quantityCommercial: 2,
            unitCost: 800,
          },
        ],
      }),
    );
    expect(screen.getByRole('button', { name: 'Procesando Transacción...' })).toBeDisabled();
  });

  it('las líneas dinámicas conservan sus valores al eliminar otra y cambiar de vista', async () => {
    render(
      <MemoryRouter>
        <ReceivePurchasePage />
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'Confirmar Recepción de Compra' });
    // Lote y vencimiento solo aparecen con un producto que los requiere; el costo siempre está
    fireEvent.change(screen.getByLabelText(/Costo por/), { target: { value: '111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Producto' }));
    fireEvent.change(screen.getAllByLabelText(/Costo por/)[1], { target: { value: '222' } });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar línea 1' }));
    expect(screen.getByLabelText(/Costo por/)).toHaveValue(222);
    fireEvent.click(screen.getByRole('button', { name: 'Tabla', exact: true }));
    expect(screen.getByRole('spinbutton', { name: 'Costo línea 1' })).toHaveValue(222);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Recepción de Compra' }));
    expect(await screen.findByText('Selecciona un producto.')).toBeInTheDocument();
    expect(purchasesApi.receivePurchase).not.toHaveBeenCalled();
  });

  it('nota débito inválida muestra errores por campo y enfoca la cantidad sin enviar', async () => {
    const api = vi.spyOn(accountingApi, 'createPurchaseDebitNote');
    render(
      <DebitNoteDialog open purchase={mockPurchases[0]} onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar nota débito' }));
    expect(
      await screen.findByText('Selecciona al menos una cantidad a devolver.'),
    ).toBeInTheDocument();
    expect(screen.getByText('El motivo debe tener mínimo 5 caracteres.')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toHaveFocus();
    expect(api).not.toHaveBeenCalled();
  });

  it('nota débito conserva payload, bloquea doble envío y reutiliza la clave tras error', async () => {
    const api = vi
      .spyOn(accountingApi, 'createPurchaseDebitNote')
      .mockRejectedValueOnce(new Error('Fallo temporal'))
      .mockReturnValue(new Promise(() => {}));
    render(
      <DebitNoteDialog open purchase={mockPurchases[0]} onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Motivo de la devolución/), {
      target: { value: '  Envase roto  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar nota débito' }));
    expect(await screen.findByText('Fallo temporal')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Confirmar nota débito' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    const expected = [
      'purch-1',
      {
        purchaseId: 'purch-1',
        reason: 'Envase roto',
        items: [{ purchaseLineId: 'line-1', quantityCommercial: 2 }],
      },
      expect.any(String),
    ];
    expect(api.mock.calls[0]).toEqual(expected);
    expect(api.mock.calls[1]).toEqual(api.mock.calls[0]);
    expect(screen.getByRole('button', { name: 'Registrando…' })).toBeDisabled();
  });
});

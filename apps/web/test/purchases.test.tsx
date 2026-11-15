import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  type PurchaseDto,
  type SupplierDto,
  type ProductDto,
  type InventoryLotDto,
} from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as purchasesApi from '../src/features/purchases/api/purchases.api';
import * as suppliersApi from '../src/features/suppliers/api/suppliers.api';
import * as productsApi from '../src/features/catalog/api/products.api';
import { PurchasesListPage } from '../src/features/purchases/pages/PurchasesListPage';
import { ReceivePurchasePage } from '../src/features/purchases/pages/ReceivePurchasePage';
import { DebitNoteDialog } from '../src/features/purchases/components/DebitNoteDialog';
import * as accountingApi from '../src/features/accounting/api/accounting.api';
import * as inventoryApi from '../src/features/inventory/api/inventory.api';
import * as companyApi from '../src/features/company/api/company.api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { businessToday, addDaysToDate } from '../src/utils/business-date';
import { appTheme } from '../src/theme/app-theme';
import { setDateField } from './support-date';

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
    vi.spyOn(accountingApi, 'fetchPurchaseDebitNotes').mockResolvedValue([]);
    vi.spyOn(inventoryApi, 'fetchInventoryLots').mockResolvedValue({
      items: [{ id: 'lot-1', currentQuantity: 100 } as InventoryLotDto],
      total: 1,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    });
  });

  function renderDebitNote(onCreated = vi.fn()) {
    return render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DebitNoteDialog open purchase={mockPurchases[0]} onClose={vi.fn()} onCreated={onCreated} />
      </QueryClientProvider>,
    );
  }

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
        expect(screen.getByText(/\$\s?80[.,]000/)).toBeInTheDocument();
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

  it('filtra por la factura que llega en la URL (enlace desde el Libro Diario)', async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ThemeProvider theme={appTheme}>
          <MemoryRouter initialEntries={['/purchases?q=FAC-2026-789']}>
            <AuthContext.Provider
              value={createMockAuthContext([SYSTEM_PERMISSIONS.PURCHASES_READ])}
            >
              <PurchasesListPage />
            </AuthContext.Provider>
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('FAC-2026-789')).toBeInTheDocument();
    expect(purchasesApi.fetchPurchases).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceNumber: 'FAC-2026-789' }),
    );
  });

  it('la compra y su nota débito se imprimen con el formato común y el membrete real (fase 4)', async () => {
    vi.spyOn(companyApi, 'fetchCompanyLetterhead').mockResolvedValue({
      company: {
        legalName: 'Droguería La Esperanza S.A.S.',
        tradeName: null,
        taxId: '900123456',
        taxIdCheckDigit: '8',
        address: 'Calle 1 # 2-3',
        phone: null,
        email: null,
      },
    } as never);
    vi.spyOn(accountingApi, 'fetchPurchaseDebitNotes').mockResolvedValue([
      {
        id: 'dn-1',
        debitNoteNumber: 'ND-000003',
        purchaseId: 'purch-1',
        purchaseInvoiceNumber: 'FAC-2026-789',
        supplierId: 'sup-1',
        supplierName: 'Distribuidora Médica del Norte',
        reason: 'Empaque dañado',
        subtotal: 8000,
        taxTotal: 0,
        total: 8000,
        createdById: 'usr-1',
        createdByName: 'compras',
        createdAt: '2026-09-27T10:00:00.000Z',
        lines: [],
      },
    ]);
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ThemeProvider theme={appTheme}>
          <MemoryRouter>
            <AuthContext.Provider
              value={createMockAuthContext([SYSTEM_PERMISSIONS.PURCHASES_READ])}
            >
              <PurchasesListPage />
            </AuthContext.Provider>
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole('button', { name: 'Ver Detalle' }));
    const notes = await screen.findByTestId('purchase-debit-notes');
    expect(notes).toHaveTextContent('ND-000003');
    await user.click(screen.getByRole('button', { name: 'Imprimir ND-000003' }));

    // Un solo diálogo abierto: el detalle se cierra para que la impresión no salga con los dos
    const noteDialog = await screen.findByRole('dialog');
    await waitFor(() => expect(noteDialog).toHaveTextContent('Nota Débito a Proveedor ND-000003'));
    expect(noteDialog).toHaveTextContent('Droguería La Esperanza S.A.S.');
    expect(noteDialog).toHaveTextContent('NIT 900123456-8');
    expect(noteDialog).not.toHaveTextContent('900.000.000-1');
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    // Esperar a que termine la transición de salida: mientras tanto el fondo sigue aria-hidden
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(await screen.findByRole('button', { name: 'Ver Detalle' }));
    await user.click(await screen.findByRole('button', { name: 'Imprimir' }));
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1));
    const purchaseDialog = screen.getByRole('dialog');
    expect(purchaseDialog).toHaveTextContent('Comprobante de Recepción de Compra');
    expect(purchaseDialog).toHaveTextContent('Recibida');
    expect(purchaseDialog).toHaveTextContent('NIT 900123456-8');
    expect(
      within(purchaseDialog).getByRole('button', { name: 'Descargar PDF' }),
    ).toBeInTheDocument();
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
        expect(screen.getByRole('button', { name: 'Continuar a productos' })).toBeInTheDocument();
      });
    });
  });
  async function choose(user: ReturnType<typeof userEvent.setup>, label: RegExp, option: RegExp) {
    await user.click(screen.getByRole('combobox', { name: label }));
    await user.click(screen.getByRole('option', { name: option }));
  }

  // Paso 1 válido para llegar a productos y lotes
  async function fillHeaderAndContinue(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('button', { name: 'Continuar a productos' });
    await choose(user, /Proveedor/, /Distribuidora/);
    fireEvent.change(screen.getByLabelText(/Número de Factura/), { target: { value: ' fac-42 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a productos' }));
    await screen.findByRole('button', { name: 'Revisar totales' });
  }

  it('recepción inválida muestra errores por campo, enfoca el proveedor y no llama a la API', async () => {
    render(
      <MemoryRouter>
        <ReceivePurchasePage />
      </MemoryRouter>,
    );
    const submit = await screen.findByRole('button', { name: 'Continuar a productos' });
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
    await screen.findByRole('button', { name: 'Continuar a productos' });
    await choose(user, /Proveedor/, /Distribuidora/);
    fireEvent.change(screen.getByLabelText(/Número de Factura/), { target: { value: ' fac-42 ' } });
    fireEvent.change(screen.getByLabelText(/Observaciones/), {
      target: { value: ' Entrega completa ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a productos' }));
    await screen.findByRole('button', { name: 'Revisar totales' });
    // Proveedor y comprobante siguen a la vista en los pasos siguientes
    expect(screen.getByTestId('purchase-summary')).toHaveTextContent(/Distribuidora/);
    expect(screen.getByTestId('purchase-summary')).toHaveTextContent('FAC-42');
    await choose(user, /^Producto/, /Amoxicilina/);
    fireEvent.change(screen.getByLabelText(/Número de Lote/), { target: { value: ' lote-42 ' } });
    setDateField(/^Fecha de Vencimiento \*/, '2099-12-31');
    fireEvent.change(screen.getByLabelText(/^Cantidad/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar totales' }));
    const confirm = await screen.findByRole('button', { name: 'Confirmar recepción de compra' });
    const review = screen.getByRole('table', { name: 'Líneas a recibir' });
    expect(review).toHaveTextContent('LOTE-42');
    expect(screen.getByTestId('purchase-effects')).toHaveTextContent(/Entran 2 unidades base/);
    expect(screen.getByTestId('purchase-effects')).toHaveTextContent(
      /Se abre una cuenta por pagar a Distribuidora/,
    );
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
    expect(screen.getByRole('button', { name: 'Registrando compra…' })).toBeDisabled();
  });

  it('la pistola lectora llena la primera línea, suma unidades al repetir y avisa códigos inexistentes', async () => {
    const lookup = vi
      .spyOn(productsApi, 'lookupProductByCode')
      .mockImplementation(async (code) =>
        code === '7700000000001' ? { product: mockProducts[0], presentationId: null } : null,
      );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ReceivePurchasePage />
      </MemoryRouter>,
    );
    await fillHeaderAndContinue(user);
    const scan = screen.getByLabelText('Escanear código de barras');
    for (const code of ['7700000000001', '7700000000001']) {
      fireEvent.change(scan, { target: { value: code } });
      fireEvent.keyDown(scan, { key: 'Enter' });
      await waitFor(() => expect(lookup).toHaveBeenCalledWith(code));
    }
    await waitFor(() => expect(screen.getByLabelText(/Costo por/)).toHaveValue(800));
    await waitFor(() => expect(screen.getByLabelText(/Cantidad/)).toHaveValue(2));
    expect(screen.getAllByLabelText(/Costo por/)).toHaveLength(1);

    fireEvent.change(scan, { target: { value: '123' } });
    fireEvent.keyDown(scan, { key: 'Enter' });
    expect(
      await screen.findByText('El código "123" no existe en el catálogo.'),
    ).toBeInTheDocument();
    expect(scan).toHaveValue('');
  });

  it('las líneas dinámicas conservan sus valores al eliminar otra y cambiar de vista', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ReceivePurchasePage />
      </MemoryRouter>,
    );
    await fillHeaderAndContinue(user);
    // Lote y vencimiento solo aparecen con un producto que los requiere; el costo siempre está
    fireEvent.change(screen.getByLabelText(/Costo por/), { target: { value: '111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Producto' }));
    fireEvent.change(screen.getAllByLabelText(/Costo por/)[1], { target: { value: '222' } });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar línea 1' }));
    expect(screen.getByLabelText(/Costo por/)).toHaveValue(222);
    fireEvent.click(screen.getByRole('button', { name: 'Tabla', exact: true }));
    expect(screen.getByRole('spinbutton', { name: 'Costo línea 1' })).toHaveValue(222);
    fireEvent.click(screen.getByRole('button', { name: 'Revisar totales' }));
    expect(await screen.findByText('Selecciona un producto.')).toBeInTheDocument();
    expect(purchasesApi.receivePurchase).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza la recepción se queda en la revisión y permite volver a corregir (fase 3)', async () => {
    const user = userEvent.setup();
    vi.mocked(purchasesApi.receivePurchase).mockRejectedValue(
      new Error('Ya existe la factura FAC-42 de este proveedor.'),
    );
    render(
      <MemoryRouter>
        <ReceivePurchasePage />
      </MemoryRouter>,
    );
    await fillHeaderAndContinue(user);
    await choose(user, /^Producto/, /Amoxicilina/);
    fireEvent.change(screen.getByLabelText(/Número de Lote/), { target: { value: 'L-1' } });
    setDateField(/^Fecha de Vencimiento \*/, '2099-12-31');
    fireEvent.change(screen.getByLabelText(/^Cantidad/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar totales' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar recepción de compra' }));
    expect(
      await screen.findByText('Ya existe la factura FAC-42 de este proveedor.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Líneas a recibir' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar factura' }));
    expect(screen.getByLabelText(/Número de Factura/)).toHaveValue(' fac-42 ');
  });

  it('nota débito inválida muestra errores por campo y enfoca la cantidad sin enviar', async () => {
    const api = vi.spyOn(accountingApi, 'createPurchaseDebitNote');
    renderDebitNote();
    await screen.findByText('100 u. base');
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
    renderDebitNote();
    await screen.findByText('100 u. base');
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

  it('la devolución al proveedor muestra lo devuelto, lo devolvible y su efecto (fase 3)', async () => {
    const create = vi.spyOn(accountingApi, 'createPurchaseDebitNote');
    vi.mocked(accountingApi.fetchPurchaseDebitNotes).mockResolvedValue([
      {
        id: 'nd-1',
        debitNoteNumber: 'ND-000001',
        lines: [{ purchaseLineId: 'line-1', quantityBaseUnits: 30 }],
      } as accountingApi.DebitNoteDto,
    ]);
    vi.mocked(inventoryApi.fetchInventoryLots).mockResolvedValue({
      items: [{ id: 'lot-1', currentQuantity: 50 } as InventoryLotDto],
      total: 1,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    });
    renderDebitNote();
    expect(await screen.findByText('50 u. base')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByTestId('returnable-line-1')).toHaveTextContent('50');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText(/Motivo de la devolución/), {
      target: { value: 'Envase roto' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar nota débito' }));
    expect(await screen.findByText('Solo se pueden devolver 50.')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    const effects = screen.getByTestId('debit-note-effects');
    expect(effects).toHaveTextContent('Salen 5 unidades base del lote LOTE-AMX-2026');
    expect(effects).toHaveTextContent(
      /Baja \$4\.000,00 la cuenta por pagar a Distribuidora Médica del Norte/,
    );
  });

  it('si la existencia cambió el error del servidor ofrece actualizar sin perder lo escrito (fase 3)', async () => {
    vi.spyOn(accountingApi, 'createPurchaseDebitNote').mockRejectedValue(
      new Error('Existencias insuficientes en el lote LOTE-AMX-2026 para devolver la mercancía.'),
    );
    renderDebitNote();
    await screen.findByText('100 u. base');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Motivo de la devolución/), {
      target: { value: 'Producto averiado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar nota débito' }));
    expect(await screen.findByText(/Existencias insuficientes en el lote/)).toBeInTheDocument();
    vi.mocked(inventoryApi.fetchInventoryLots).mockResolvedValue({
      items: [{ id: 'lot-1', currentQuantity: 4 } as InventoryLotDto],
      total: 1,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar existencias' }));
    expect(await screen.findByText('4 u. base')).toBeInTheDocument();
    expect(screen.getByTestId('returnable-line-1')).toHaveTextContent('4');
    expect(screen.getByRole('spinbutton')).toHaveValue(10);
  });
});

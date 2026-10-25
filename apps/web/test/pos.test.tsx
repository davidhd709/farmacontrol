import { ThemeProvider } from '@mui/material';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    permissions: [SYSTEM_PERMISSIONS.SALES_CREATE, SYSTEM_PERMISSIONS.SALES_READ],
  },
  status: 'authenticated',
  login: vi.fn(),
  logout: vi.fn(),
  retrySession: vi.fn(),
  sessionError: null,
  isLoggingIn: false,
  isLoggingOut: false,
};

const renderComponent = (permissions: string[] = mockAuthContext.user!.permissions!) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider
            value={{ ...mockAuthContext, user: { ...mockAuthContext.user!, permissions } }}
          >
            <PosPage />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

afterEach(() => vi.unstubAllGlobals());

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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url) => {
        if (!String(url).endsWith('/sales/fefo-preview'))
          throw new Error(`Unexpected request: ${url}`);
        return new Response(
          JSON.stringify({
            businessDay: '2026-10-18',
            lines: [
              {
                productId: mockProduct.id,
                presentationId: null,
                requiredBaseUnits: 1,
                availableBaseUnits: 10,
                shortfallBaseUnits: 0,
                allocations: [
                  {
                    lotId: 'lot-preview',
                    lotNumber: 'FEFO-2027',
                    expirationDate: '2027-01-01',
                    quantityBaseUnits: 1,
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
  });

  it('debe cargar y mostrar el cliente por defecto Consumidor Final', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Consumidor Final')).toBeInTheDocument();
    });

    expect(screen.getByText(/Doc: 222222222222/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Buscar cliente existente')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear cliente nuevo' })).not.toBeInTheDocument();
  });

  it('debe permitir buscar un producto y agregarlo al carrito de compras', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Consumidor Final')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText(/Buscar producto por nombre/i);
    fireEvent.change(searchInput, { target: { value: 'Aceta' } });

    await waitFor(() => {
      expect(productsApi.fetchProducts).toHaveBeenCalledWith(
        { search: 'Aceta' },
        expect.any(AbortSignal),
      );
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
      expect(productsApi.fetchProducts).toHaveBeenCalledWith(
        { search: 'Acetaminofén' },
        expect.any(AbortSignal),
      );
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
    await waitFor(() => expect(confirmBtn).not.toBeDisabled());
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(salesApi.confirmSale).toHaveBeenCalled();
    });

    // Se muestra el Comprobante de venta (HU-018)
    expect(await screen.findByText(/Comprobante N°: VEN-20260926-0001/i)).toBeInTheDocument();
  });

  it('AUD-003: reintentar tras un fallo de red reutiliza la misma Idempotency-Key', async () => {
    vi.mocked(salesApi.confirmSale)
      .mockRejectedValueOnce(new Error('No fue posible conectar con el servidor.'))
      .mockResolvedValueOnce(mockConfirmedSale);

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Consumidor Final')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Buscar producto por nombre/i), {
      target: { value: 'Acetaminofén' },
    });
    fireEvent.click(await screen.findByRole('option'));
    await waitFor(() => {
      expect(screen.getByText('Acetaminofén 500mg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Cobrar /i }));
    expect(await screen.findByText('Cobro y Liquidación de Venta')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Efectivo Recibido/i), { target: { value: '2000' } });

    await waitFor(() => expect(screen.getByTestId('confirm-payment-btn')).not.toBeDisabled());
    // Primer intento: falla la red y el diálogo sigue abierto
    fireEvent.click(screen.getByTestId('confirm-payment-btn'));
    await waitFor(() => {
      expect(salesApi.confirmSale).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId('confirm-payment-btn')).not.toBeDisabled();
    });

    // Reintento con el mismo contenido
    fireEvent.click(screen.getByTestId('confirm-payment-btn'));
    await waitFor(() => {
      expect(salesApi.confirmSale).toHaveBeenCalledTimes(2);
    });

    const [firstPayload, firstKey] = vi.mocked(salesApi.confirmSale).mock.calls[0];
    const [secondPayload, secondKey] = vi.mocked(salesApi.confirmSale).mock.calls[1];
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
    expect(secondPayload).toEqual(firstPayload);
    expect(await screen.findByText(/Comprobante N°: VEN-20260926-0001/i)).toBeInTheDocument();
  });
  it('AUD-014: varias teclas rápidas producen una sola consulta con cancelación', async () => {
    vi.mocked(productsApi.fetchProducts).mockRestore();
    const searchSpy = vi.spyOn(productsApi, 'fetchProducts');
    vi.mocked(fetch).mockImplementation(
      async () =>
        new Response(JSON.stringify({ items: [mockProduct], total: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    renderComponent();
    const input = screen.getByLabelText(/Buscar producto por nombre/i);
    fireEvent.change(input, { target: { value: 'Ac' } });
    fireEvent.change(input, { target: { value: 'Ace' } });
    fireEvent.change(input, { target: { value: 'Aceta' } });
    expect(productsApi.fetchProducts).not.toHaveBeenCalled();
    await screen.findByRole('option');
    expect(productsApi.fetchProducts).toHaveBeenCalledTimes(1);
    expect(searchSpy).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('products?search=Aceta'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(productsApi.fetchProducts).toHaveBeenCalledWith(
      { search: 'Aceta' },
      expect.any(AbortSignal),
    );
  });

  it('AUD-014: una respuesta antigua no reemplaza resultados nuevos y se aborta', async () => {
    const old = deferred<Awaited<ReturnType<typeof productsApi.fetchProducts>>>();
    vi.mocked(productsApi.fetchProducts).mockImplementation(({ search }, signal) => {
      if (search === 'Viejo') {
        oldSignal = signal;
        return old.promise;
      }
      return Promise.resolve({
        items: [{ ...mockProduct, id: 'new', name: 'Producto nuevo' }],
        total: 1,
      });
    });
    let oldSignal: AbortSignal | undefined;
    renderComponent();
    const input = screen.getByLabelText(/Buscar producto por nombre/i);
    fireEvent.change(input, { target: { value: 'Viejo' } });
    await waitFor(() => expect(productsApi.fetchProducts).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: 'Nuevo' } });
    expect(oldSignal?.aborted).toBe(true);
    expect(await screen.findByRole('option')).toHaveTextContent('Producto nuevo');
    await act(async () => old.resolve({ items: [mockProduct], total: 1 }));
    expect(screen.getByRole('option')).toHaveTextContent('Producto nuevo');
    expect(screen.queryByRole('option', { name: /Acetaminofén/ })).not.toBeInTheDocument();
  });

  it('AUD-014: Enter antes del debounce consulta el texto actual y agrega sólo ese producto', async () => {
    const pending = deferred<Awaited<ReturnType<typeof productsApi.fetchProducts>>>();
    vi.mocked(productsApi.fetchProducts).mockImplementation(({ search }) =>
      search === '770nuevo' ? pending.promise : Promise.resolve({ items: [mockProduct], total: 1 }),
    );
    renderComponent();
    const input = screen.getByLabelText(/Buscar producto por nombre/i);
    fireEvent.change(input, { target: { value: 'Viejo' } });
    await screen.findByRole('option');
    fireEvent.change(input, { target: { value: '770nuevo' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(productsApi.fetchProducts).toHaveBeenCalledWith(
      { search: '770nuevo' },
      expect.any(AbortSignal),
    );
    fireEvent.keyDown(input, { key: 'Enter' });
    await act(async () =>
      pending.resolve({
        items: [{ ...mockProduct, id: 'prod-new', name: 'Producto escaneado' }],
        total: 1,
      }),
    );
    expect(screen.getByRole('cell', { name: /Producto escaneado/ })).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: /Acetaminofén/ })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /Cantidad de Producto escaneado/ })).toHaveValue(
      1,
    );
    expect(productsApi.fetchProducts).toHaveBeenCalledTimes(2);
  });

  it('Enter agrega la opción marcada con las flechas, no el primer resultado', async () => {
    vi.mocked(productsApi.fetchProducts).mockResolvedValue({
      items: [mockProduct, { ...mockProduct, id: 'prod-second', name: 'Segundo producto' }],
      total: 2,
    });
    renderComponent();
    const input = screen.getByLabelText(/Buscar producto por nombre/i);
    fireEvent.change(input, { target: { value: 'Prod' } });
    expect(await screen.findAllByRole('option')).toHaveLength(2);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByRole('cell', { name: /Segundo producto/ })).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: /Acetaminofén/ })).not.toBeInTheDocument();
    expect(productsApi.fetchProducts).toHaveBeenCalledTimes(1);
  });

  it('asigna un cliente existente al payload de confirmación', async () => {
    const delayedDefault = deferred<CustomerDto>();
    vi.mocked(customersApi.fetchDefaultCustomer).mockReturnValueOnce(delayedDefault.promise);
    vi.spyOn(customersApi, 'fetchCustomers').mockResolvedValue({
      items: [
        {
          ...mockDefaultCustomer,
          id: 'customer-ana',
          name: 'Ana Pérez',
          documentNumber: '123456',
          isDefault: false,
        },
      ],
      total: 1,
    });
    renderComponent([SYSTEM_PERMISSIONS.SALES_CREATE, SYSTEM_PERMISSIONS.CUSTOMERS_READ]);
    fireEvent.change(screen.getByLabelText('Buscar cliente existente'), {
      target: { value: 'Ana' },
    });
    fireEvent.click(await screen.findByRole('option', { name: /Ana Pérez · 123456/ }));
    await act(async () => delayedDefault.resolve(mockDefaultCustomer));
    expect(screen.getByText(/Doc: 123456/)).toBeInTheDocument();
    await addProductAndPay();
    await waitFor(() => expect(screen.getByTestId('confirm-payment-btn')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('confirm-payment-btn'));
    await waitFor(() =>
      expect(salesApi.confirmSale).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'customer-ana' }),
        expect.any(String),
      ),
    );
  });

  it('permite volver a Consumidor final y respeta los permisos de clientes', async () => {
    vi.spyOn(customersApi, 'fetchCustomers').mockResolvedValue({
      items: [{ ...mockDefaultCustomer, id: 'ana', name: 'Ana', isDefault: false }],
      total: 1,
    });
    renderComponent([SYSTEM_PERMISSIONS.SALES_CREATE, SYSTEM_PERMISSIONS.CUSTOMERS_READ]);
    await screen.findByText('Consumidor Final');
    expect(screen.queryByRole('button', { name: 'Crear cliente nuevo' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar cliente existente'), {
      target: { value: 'Ana' },
    });
    fireEvent.click(await screen.findByRole('option', { name: /Ana/ }));
    expect(screen.getByText('Ana')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a Consumidor final' }));
    expect(await screen.findByText('Consumidor Final')).toBeInTheDocument();
    expect(customersApi.fetchDefaultCustomer).toHaveBeenCalledTimes(2);
  });

  it('muestra asignaciones FEFO con lotes y fechas explícitas', async () => {
    renderComponent();
    await addProductAndPay();
    await waitFor(() => expect(screen.getByTestId('confirm-payment-btn')).not.toBeDisabled());
    expect(screen.getByText('Asignación prevista; se confirma al cobrar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Línea 1: 1 unidades base/ }));
    expect(
      screen.getByText(/Lote FEFO-2027 · Vencimiento: 1 de enero de 2027 · 1 unidades base/),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sales/fefo-preview'),
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
        body: JSON.stringify({
          items: [{ productId: mockProduct.id, presentationId: null, quantityCommercial: 1 }],
        }),
      }),
    );
  });

  it('un faltante FEFO impide confirmar e identifica producto y unidades', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          businessDay: '2026-10-18',
          lines: [
            {
              productId: mockProduct.id,
              presentationId: null,
              requiredBaseUnits: 1,
              availableBaseUnits: 0,
              shortfallBaseUnits: 1,
              allocations: [],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderComponent();
    await addProductAndPay();
    expect(
      await screen.findByText(/Acetaminofén 500mg: faltan 1 unidades base/),
    ).toBeInTheDocument();
    expect(screen.getByTestId('confirm-payment-btn')).toBeDisabled();
    fireEvent.submit(screen.getByTestId('confirm-payment-btn').closest('form')!);
    expect(salesApi.confirmSale).not.toHaveBeenCalled();
  });

  it('una falla de vista previa avisa y permite confirmar', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    renderComponent();
    await addProductAndPay();
    expect(
      await screen.findByText(
        'No se pudo cargar la vista previa; los lotes se asignarán al confirmar',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('confirm-payment-btn')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('confirm-payment-btn'));
    await waitFor(() => expect(salesApi.confirmSale).toHaveBeenCalledOnce());
  });

  it('suma 0,10 y 0,20 exactamente y calcula el cambio en centavos', async () => {
    vi.mocked(productsApi.fetchProducts).mockImplementation(({ search }) =>
      Promise.resolve({
        items: [
          {
            ...mockProduct,
            id: search!,
            name: search!,
            basePrice: search === 'Diez' ? '0.10' : '0.20',
          },
        ],
        total: 1,
      }),
    );
    renderComponent();
    const input = screen.getByLabelText(/Buscar producto por nombre/i);
    fireEvent.change(input, { target: { value: 'Diez' } });
    fireEvent.click(await screen.findByRole('option'));
    fireEvent.change(input, { target: { value: 'Veinte' } });
    fireEvent.click(await screen.findByRole('option'));
    fireEvent.click(screen.getByRole('button', { name: /Cobrar /i }));
    const cash = await screen.findByLabelText(/Efectivo Recibido/i);
    expect(cash).toHaveValue(0.3);
    fireEvent.change(cash, { target: { value: '0.50' } });
    expect(screen.getByText(/Cambio \/ Devuelta/).parentElement).toHaveTextContent('0,2');
    await waitFor(() => expect(screen.getByTestId('confirm-payment-btn')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('confirm-payment-btn'));
    await waitFor(() =>
      expect(salesApi.confirmSale).toHaveBeenCalledWith(
        expect.objectContaining({ amountPaid: 0.5 }),
        expect.any(String),
      ),
    );
  });
});

async function addProductAndPay() {
  fireEvent.change(screen.getByLabelText(/Buscar producto por nombre/i), {
    target: { value: 'Aceta' },
  });
  fireEvent.click(await screen.findByRole('option'));
  fireEvent.click(screen.getByRole('button', { name: /Cobrar /i }));
  await screen.findByText('Cobro y Liquidación de Venta');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

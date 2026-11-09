import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES, type CreditNoteDto, type SaleDto } from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as salesApi from '../src/features/sales/api/sales.api';
import * as accountingApi from '../src/features/accounting/api/accounting.api';
import { CreditNotesPage } from '../src/features/sales/pages/CreditNotesPage';
import { appTheme } from '../src/theme/app-theme';

const mockCreditNotes: CreditNoteDto[] = [
  {
    id: 'cn-1',
    creditNoteNumber: 'NC-000001',
    saleId: 'sale-1',
    saleInvoiceNumber: 'VEN-20261001-0001',
    customerId: 'cust-1',
    customerName: 'María Rodríguez',
    customerDocument: '1017001002',
    reason: 'Producto defectuoso',
    subtotal: 10000,
    taxTotal: 1900,
    total: 11900,
    refundMethod: 'EFECTIVO',
    restock: true,
    status: 'CONFIRMADA',
    createdById: 'usr-1',
    createdAt: '2026-10-01T10:00:00.000Z',
    lines: [
      {
        id: 'line-1',
        creditNoteId: 'cn-1',
        saleLineId: 'sline-1',
        productId: 'prod-1',
        productName: 'Amoxicilina 500mg',
        lotNumber: 'LOTE-AMX-01',
        expirationDate: '2027-12-31',
        quantityCommercial: 2,
        quantityBaseUnits: 2,
        unitPrice: 5000,
        subtotal: 10000,
        taxRate: 19,
        taxAmount: 1900,
        total: 11900,
        createdAt: '2026-10-01T10:00:00.000Z',
      },
    ],
  },
  {
    id: 'cn-2',
    creditNoteNumber: 'NC-000002',
    saleId: 'sale-2',
    saleInvoiceNumber: 'VEN-20261002-0005',
    customerId: 'cust-2',
    customerName: 'Carlos Gómez',
    customerDocument: '71234567',
    reason: 'Error en facturación',
    subtotal: 5000,
    taxTotal: 0,
    total: 5000,
    refundMethod: 'CREDITO_CARTERA',
    restock: false,
    status: 'ANULADA',
    cancelledAt: '2026-10-02T12:00:00.000Z',
    cancellationReason: 'Cliente desistió de la devolución',
    createdById: 'usr-1',
    createdAt: '2026-10-02T11:00:00.000Z',
    lines: [],
  },
];

const mockCompletedSale: SaleDto = {
  id: 'sale-100',
  invoiceNumber: 'FAC-000100',
  customerId: 'cust-1',
  customerName: 'María Rodríguez',
  customerDocument: '1017001002',
  status: 'COMPLETED',
  paymentMethod: 'EFECTIVO',
  subtotal: 20000,
  taxTotal: 3800,
  discountTotal: 0,
  total: 23800,
  amountPaid: 23800,
  changeGiven: 0,
  createdById: 'usr-1',
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
  lines: [
    {
      id: 'sline-100',
      saleId: 'sale-100',
      productId: 'prod-1',
      productName: 'Ibuprofeno 800mg',
      quantityCommercial: 4,
      quantityBaseUnits: 4,
      unitPrice: 5000,
      discount: 0,
      subtotal: 20000,
      taxRate: 19,
      taxAmount: 3800,
      total: 23800,
      createdAt: '2026-10-10T10:00:00.000Z',
      lotAllocations: [],
    },
  ],
};

const mockCancelledSale: SaleDto = {
  id: 'sale-200',
  invoiceNumber: 'FAC-000200',
  customerId: 'cust-2',
  customerName: 'Carlos Gómez',
  status: 'CANCELLED',
  paymentMethod: 'EFECTIVO',
  subtotal: 10000,
  taxTotal: 1900,
  discountTotal: 0,
  total: 11900,
  amountPaid: 11900,
  changeGiven: 0,
  createdById: 'usr-1',
  createdAt: '2026-10-11T10:00:00.000Z',
  updatedAt: '2026-10-11T10:00:00.000Z',
  lines: [
    {
      id: 'sline-200',
      saleId: 'sale-200',
      productId: 'prod-2',
      productName: 'Acetaminofén 500mg',
      quantityCommercial: 2,
      quantityBaseUnits: 2,
      unitPrice: 5000,
      discount: 0,
      subtotal: 10000,
      taxRate: 19,
      taxAmount: 1900,
      total: 11900,
      createdAt: '2026-10-11T10:00:00.000Z',
      lotAllocations: [],
    },
  ],
};

const renderCreditNotesPage = (permissions: string[] = [SYSTEM_PERMISSIONS.SALES_READ]) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const authValue: AuthContextValue = {
    user: {
      id: 'usr-1',
      username: 'admin',
      fullName: 'Administrador',
      role: SYSTEM_ROLES.ADMIN,
      permissions,
      mustChangePassword: false,
    },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasPermission: (perm: string) => permissions.includes(perm),
    hasAnyRole: () => true,
    completePasswordReset: vi.fn(),
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={appTheme}>
        <AuthContext.Provider value={authValue}>
          <MemoryRouter>
            <CreditNotesPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
};

describe('CreditNotesPage (REQ-005)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(salesApi, 'fetchCreditNotes').mockResolvedValue(mockCreditNotes);
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValue({
      items: [mockCompletedSale, mockCancelledSale],
      total: 2,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    });
  });

  it('lista las notas crédito con su número, factura, cliente, total y estado', async () => {
    renderCreditNotesPage([SYSTEM_PERMISSIONS.SALES_READ]);

    expect(await screen.findByRole('heading', { name: 'Notas Crédito' })).toBeInTheDocument();
    expect(screen.getByText('NC-000001')).toBeInTheDocument();
    expect(screen.getByText('VEN-20261001-0001')).toBeInTheDocument();
    expect(screen.getByText('María Rodríguez')).toBeInTheDocument();
    expect(screen.getByText('NC-000002')).toBeInTheDocument();
    expect(screen.getByText('Carlos Gómez')).toBeInTheDocument();
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
    expect(screen.getByText('Anulada')).toBeInTheDocument();
  });

  it('permite ver el detalle completo de una nota crédito con sus líneas', async () => {
    renderCreditNotesPage([SYSTEM_PERMISSIONS.SALES_READ]);

    expect(await screen.findByText('NC-000001')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('view-detail-btn-cn-1'));

    expect(await screen.findByTestId('credit-note-detail-dialog')).toBeInTheDocument();
    expect(screen.getByText('Detalle de Nota Crédito NC-000001')).toBeInTheDocument();
    expect(screen.getByText('Amoxicilina 500mg')).toBeInTheDocument();
    expect(screen.getByText('LOTE-AMX-01')).toBeInTheDocument();
    expect(screen.getByText('Producto defectuoso')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => {
      expect(screen.queryByTestId('credit-note-detail-dialog')).not.toBeInTheDocument();
    });
  });

  it('permite anular una nota confirmada con motivo obligatorio cuando tiene SALES_CANCEL', async () => {
    const cancelSpy = vi.spyOn(salesApi, 'cancelCreditNote').mockResolvedValue({
      ...mockCreditNotes[0],
      status: 'ANULADA',
    });

    renderCreditNotesPage([
      SYSTEM_PERMISSIONS.SALES_READ,
      SYSTEM_PERMISSIONS.SALES_CANCEL,
    ]);

    expect(await screen.findByText('NC-000001')).toBeInTheDocument();

    // NC-000001 está confirmada: tiene botón Anular
    const cancelBtn = screen.getByTestId('cancel-note-btn-cn-1');
    expect(cancelBtn).toBeInTheDocument();

    // NC-000002 está anulada: NO tiene botón Anular
    expect(screen.queryByTestId('cancel-note-btn-cn-2')).toBeNull();

    fireEvent.click(cancelBtn);

    expect(await screen.findByTestId('cancel-credit-note-dialog')).toBeInTheDocument();

    // Motivo menor a 5 caracteres no permite confirmar
    const reasonInput = screen.getByLabelText(/Motivo de anulación/);
    fireEvent.change(reasonInput, { target: { value: 'Err' } });

    const confirmBtn = screen.getByRole('button', { name: 'Confirmar Anulación' });
    expect(confirmBtn).toBeDisabled();

    // Con motivo válido
    fireEvent.change(reasonInput, { target: { value: 'Error en digitación de unidades devueltas' } });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(cancelSpy).toHaveBeenCalledWith('cn-1', 'Error en digitación de unidades devueltas');
    });
  });

  it('controla la visualización del botón "Nueva Nota Crédito" según los permisos del usuario', async () => {
    // Sin permiso SALES_CREDIT_NOTE
    const { unmount } = renderCreditNotesPage([SYSTEM_PERMISSIONS.SALES_READ]);
    expect(await screen.findByRole('heading', { name: 'Notas Crédito' })).toBeInTheDocument();
    expect(screen.queryByTestId('new-credit-note-btn')).not.toBeInTheDocument();
    unmount();

    // Con permiso SALES_CREDIT_NOTE
    renderCreditNotesPage([
      SYSTEM_PERMISSIONS.SALES_READ,
      SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE,
    ]);
    expect(await screen.findByTestId('new-credit-note-btn')).toBeInTheDocument();
  });

  it('permite abrir el diálogo de búsqueda, seleccionar una factura elegible y rechazar facturas no elegibles', async () => {
    renderCreditNotesPage([
      SYSTEM_PERMISSIONS.SALES_READ,
      SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE,
    ]);

    const newBtn = await screen.findByTestId('new-credit-note-btn');
    fireEvent.click(newBtn);

    // Diálogo de selección se abre
    expect(await screen.findByTestId('select-sale-for-credit-note-dialog')).toBeInTheDocument();
    expect(screen.getByText('FAC-000100')).toBeInTheDocument();
    expect(screen.getByText('FAC-000200')).toBeInTheDocument();

    // Factura CANCELLED (FAC-000200) tiene botón deshabilitado
    const ineligibleBtn = screen.getByTestId('select-sale-btn-sale-200');
    expect(ineligibleBtn).toBeDisabled();

    // Factura COMPLETED (FAC-000100) permite seleccionar
    const eligibleBtn = screen.getByTestId('select-sale-btn-sale-100');
    expect(eligibleBtn).not.toBeDisabled();

    fireEvent.click(eligibleBtn);

    // Se cierra el selector y se abre el diálogo de elaboración de nota crédito
    await waitFor(() => {
      expect(screen.queryByTestId('select-sale-for-credit-note-dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Devolución / Nota Crédito — Factura FAC-000100')).toBeInTheDocument();
    expect(screen.getByText('Ibuprofeno 800mg')).toBeInTheDocument();
  });

  it('elabora una nota crédito válida, calcula el resumen y actualiza el listado al confirmar', async () => {
    const createSpy = vi.spyOn(accountingApi, 'createSaleCreditNote').mockResolvedValue({
      id: 'cn-3',
      creditNoteNumber: 'NC-000003',
      saleId: 'sale-100',
      saleInvoiceNumber: 'FAC-000100',
      customerId: 'cust-1',
      customerName: 'María Rodríguez',
      reason: 'Producto devuelto por defectos de empaque',
      subtotal: 5000,
      taxTotal: 950,
      total: 5950,
      refundMethod: 'EFECTIVO',
      restock: true,
      status: 'CONFIRMADA',
      createdById: 'usr-1',
      createdAt: '2026-10-12T10:00:00.000Z',
      lines: [],
    });

    renderCreditNotesPage([
      SYSTEM_PERMISSIONS.SALES_READ,
      SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE,
    ]);

    fireEvent.click(await screen.findByTestId('new-credit-note-btn'));
    fireEvent.click(await screen.findByTestId('select-sale-btn-sale-100'));

    // Diálogo de nota crédito abierto
    expect(await screen.findByText('Devolución / Nota Crédito — Factura FAC-000100')).toBeInTheDocument();

    // Ingresar cantidad a devolver
    const qtyInput = screen.getByLabelText(/Cantidad a devolver de Ibuprofeno 800mg/);
    fireEvent.change(qtyInput, { target: { value: '1' } });

    // Ingresar motivo de devolución
    const reasonInput = screen.getByLabelText(/Motivo de la devolución/);
    fireEvent.change(reasonInput, { target: { value: 'Producto devuelto por defectos de empaque' } });

    // Confirmar
    const submitBtn = screen.getByRole('button', { name: 'Confirmar nota crédito' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        'sale-100',
        expect.objectContaining({
          saleId: 'sale-100',
          reason: 'Producto devuelto por defectos de empaque',
          restock: true,
          refundMethod: 'EFECTIVO',
          items: [{ saleLineId: 'sline-100', quantityCommercial: 1 }],
        }),
        expect.any(String),
      );
    });

    // Se actualiza el listado automáticamente
    await waitFor(() => {
      expect(salesApi.fetchCreditNotes).toHaveBeenCalledTimes(2);
    });
  });

  it('rechaza cantidades inválidas superiores a lo vendido', async () => {
    const createSpy = vi.spyOn(accountingApi, 'createSaleCreditNote');

    renderCreditNotesPage([
      SYSTEM_PERMISSIONS.SALES_READ,
      SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE,
    ]);

    fireEvent.click(await screen.findByTestId('new-credit-note-btn'));
    fireEvent.click(await screen.findByTestId('select-sale-btn-sale-100'));

    expect(await screen.findByText('Devolución / Nota Crédito — Factura FAC-000100')).toBeInTheDocument();

    // Cantidad vendida es 4: intentamos ingresar 10
    const qtyInput = screen.getByLabelText(/Cantidad a devolver de Ibuprofeno 800mg/);
    fireEvent.change(qtyInput, { target: { value: '10' } });

    const reasonInput = screen.getByLabelText(/Motivo de la devolución/);
    fireEvent.change(reasonInput, { target: { value: 'Motivo válido de prueba' } });

    const submitBtn = screen.getByRole('button', { name: 'Confirmar nota crédito' });
    fireEvent.click(submitBtn);

    // Debe mostrar error de validación y NO enviar la petición
    expect(await screen.findByText('Ingresa una cantidad entre 0 y lo vendido.')).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  describe('Búsqueda multicriterio y paginación en selección de facturas (REQ-005)', () => {
    it('criterio 1: busca facturas por número de factura (invoiceNumber)', async () => {
      const fetchSalesSpy = vi.spyOn(salesApi, 'fetchSales').mockResolvedValue({
        items: [mockCompletedSale],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      renderCreditNotesPage([
        SYSTEM_PERMISSIONS.SALES_READ,
        SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE,
      ]);

      fireEvent.click(await screen.findByTestId('new-credit-note-btn'));
      expect(await screen.findByTestId('select-sale-for-credit-note-dialog')).toBeInTheDocument();

      const searchInput = screen.getByTestId('sale-search-input');
      fireEvent.change(searchInput, { target: { value: 'FAC-000100' } });
      fireEvent.click(screen.getByTestId('search-sale-submit-btn'));

      await waitFor(() => {
        expect(fetchSalesSpy).toHaveBeenCalledWith({
          search: 'FAC-000100',
          page: 1,
          limit: 20,
        });
      });
    });

    it('criterio 2: busca facturas por nombre del cliente (customerName)', async () => {
      const fetchSalesSpy = vi.spyOn(salesApi, 'fetchSales').mockResolvedValue({
        items: [mockCompletedSale],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      renderCreditNotesPage([
        SYSTEM_PERMISSIONS.SALES_READ,
        SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE,
      ]);

      fireEvent.click(await screen.findByTestId('new-credit-note-btn'));
      expect(await screen.findByTestId('select-sale-for-credit-note-dialog')).toBeInTheDocument();

      const searchInput = screen.getByTestId('sale-search-input');
      fireEvent.change(searchInput, { target: { value: 'María Rodríguez' } });
      fireEvent.click(screen.getByTestId('search-sale-submit-btn'));

      await waitFor(() => {
        expect(fetchSalesSpy).toHaveBeenCalledWith({
          search: 'María Rodríguez',
          page: 1,
          limit: 20,
        });
      });
    });

    it('criterio 3: busca facturas por documento de identidad del cliente (customerDocument)', async () => {
      const fetchSalesSpy = vi.spyOn(salesApi, 'fetchSales').mockResolvedValue({
        items: [mockCompletedSale],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      renderCreditNotesPage([
        SYSTEM_PERMISSIONS.SALES_READ,
        SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE,
      ]);

      fireEvent.click(await screen.findByTestId('new-credit-note-btn'));
      expect(await screen.findByTestId('select-sale-for-credit-note-dialog')).toBeInTheDocument();

      const searchInput = screen.getByTestId('sale-search-input');
      fireEvent.change(searchInput, { target: { value: '1017001002' } });
      fireEvent.click(screen.getByTestId('search-sale-submit-btn'));

      await waitFor(() => {
        expect(fetchSalesSpy).toHaveBeenCalledWith({
          search: '1017001002',
          page: 1,
          limit: 20,
        });
      });
    });

    it('soporta paginación con más de 50 facturas y navega entre páginas', async () => {
      const page1Items = Array.from({ length: 20 }, (_, i) => ({
        ...mockCompletedSale,
        id: `sale-p1-${i + 1}`,
        invoiceNumber: `FAC-0000${String(i + 1).padStart(2, '0')}`,
      }));

      const page2Items = Array.from({ length: 20 }, (_, i) => ({
        ...mockCompletedSale,
        id: `sale-p2-${i + 21}`,
        invoiceNumber: `FAC-0000${String(i + 21).padStart(2, '0')}`,
      }));

      const fetchSalesSpy = vi.spyOn(salesApi, 'fetchSales').mockImplementation(async (params) => {
        if (params?.page === 2) {
          return {
            items: page2Items,
            total: 75,
            page: 2,
            pageSize: 20,
            totalPages: 4,
          };
        }
        return {
          items: page1Items,
          total: 75,
          page: 1,
          pageSize: 20,
          totalPages: 4,
        };
      });

      renderCreditNotesPage([
        SYSTEM_PERMISSIONS.SALES_READ,
        SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE,
      ]);

      fireEvent.click(await screen.findByTestId('new-credit-note-btn'));
      expect(await screen.findByTestId('select-sale-for-credit-note-dialog')).toBeInTheDocument();

      // Debe mostrar el conteo de 75 facturas totales
      expect(screen.getByText('1–20 de 75')).toBeInTheDocument();
      expect(screen.getByText('FAC-000001')).toBeInTheDocument();

      // Avanzar a la página 2
      const nextPageBtn = screen.getByRole('button', { name: /página siguiente/i });
      fireEvent.click(nextPageBtn);

      await waitFor(() => {
        expect(fetchSalesSpy).toHaveBeenCalledWith({
          search: undefined,
          page: 2,
          limit: 20,
        });
      });

      // En la página 2 se muestran los documentos correspondientes
      expect(await screen.findByText('FAC-000021')).toBeInTheDocument();
      expect(screen.getByText('21–40 de 75')).toBeInTheDocument();
    });

    it('permite limpiar la búsqueda activa y recargar la primera página', async () => {
      const fetchSalesSpy = vi.spyOn(salesApi, 'fetchSales').mockResolvedValue({
        items: [mockCompletedSale],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      renderCreditNotesPage([
        SYSTEM_PERMISSIONS.SALES_READ,
        SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE,
      ]);

      fireEvent.click(await screen.findByTestId('new-credit-note-btn'));
      expect(await screen.findByTestId('select-sale-for-credit-note-dialog')).toBeInTheDocument();

      const searchInput = screen.getByTestId('sale-search-input');
      fireEvent.change(searchInput, { target: { value: 'FAC-000100' } });
      fireEvent.click(screen.getByTestId('search-sale-submit-btn'));

      // Botón limpiar aparece al estar activa la búsqueda
      const clearBtn = await screen.findByTestId('clear-sale-search-btn');
      expect(clearBtn).toBeInTheDocument();

      fireEvent.click(clearBtn);

      await waitFor(() => {
        expect(fetchSalesSpy).toHaveBeenLastCalledWith({
          search: undefined,
          page: 1,
          limit: 20,
        });
      });
      expect(screen.queryByTestId('clear-sale-search-btn')).not.toBeInTheDocument();
    });

    it('al cambiar la cantidad de filas conserva la búsqueda activa, vuelve a la página 1 y ejecuta una sola consulta', async () => {
      const fetchSalesSpy = vi.spyOn(salesApi, 'fetchSales').mockResolvedValue({
        items: [mockCompletedSale],
        total: 60,
        page: 1,
        pageSize: 20,
        totalPages: 3,
      });

      renderCreditNotesPage([
        SYSTEM_PERMISSIONS.SALES_READ,
        SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE,
      ]);

      fireEvent.click(await screen.findByTestId('new-credit-note-btn'));
      expect(await screen.findByTestId('select-sale-for-credit-note-dialog')).toBeInTheDocument();

      // 1. Realizar una búsqueda activa por cliente
      const searchInput = screen.getByTestId('sale-search-input');
      fireEvent.change(searchInput, { target: { value: 'María Rodríguez' } });
      fireEvent.click(screen.getByTestId('search-sale-submit-btn'));

      await waitFor(() => {
        expect(fetchSalesSpy).toHaveBeenCalledWith({
          search: 'María Rodríguez',
          page: 1,
          limit: 20,
        });
      });

      fetchSalesSpy.mockClear();

      // 2. Cambiar la cantidad de filas por página a 50
      const combobox = screen.getByRole('combobox', { name: /Filas por página:/i });
      fireEvent.mouseDown(combobox);
      const option50 = await screen.findByRole('option', { name: '50' });
      fireEvent.click(option50);

      // 3. Debe ejecutarse exactamente UNA consulta con la búsqueda activa y limit 50, en página 1
      await waitFor(() => {
        expect(fetchSalesSpy).toHaveBeenCalledTimes(1);
        expect(fetchSalesSpy).toHaveBeenCalledWith({
          search: 'María Rodríguez',
          page: 1,
          limit: 50,
        });
      });

      // 4. El input y la búsqueda activa deben conservarse
      expect(screen.getByTestId('sale-search-input')).toHaveValue('María Rodríguez');
      expect(screen.getByTestId('clear-sale-search-btn')).toBeInTheDocument();
    });

    it('vuelve a la página 1 al cambiar el tamaño de página estando en una página posterior', async () => {
      const fetchSalesSpy = vi.spyOn(salesApi, 'fetchSales').mockImplementation(async (params) => {
        return {
          items: [mockCompletedSale],
          total: 80,
          page: params?.page ?? 1,
          pageSize: params?.limit ?? 20,
          totalPages: 4,
        };
      });

      renderCreditNotesPage([
        SYSTEM_PERMISSIONS.SALES_READ,
        SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE,
      ]);

      fireEvent.click(await screen.findByTestId('new-credit-note-btn'));
      expect(await screen.findByTestId('select-sale-for-credit-note-dialog')).toBeInTheDocument();

      // Ir a página 2
      const nextPageBtn = screen.getByRole('button', { name: /página siguiente/i });
      fireEvent.click(nextPageBtn);

      await waitFor(() => {
        expect(fetchSalesSpy).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 20 }));
      });

      fetchSalesSpy.mockClear();

      // Cambiar filas a 10
      const combobox = screen.getByRole('combobox', { name: /Filas por página:/i });
      fireEvent.mouseDown(combobox);
      const option10 = await screen.findByRole('option', { name: '10' });
      fireEvent.click(option10);

      // Debe solicitar página 1 con limit 10
      await waitFor(() => {
        expect(fetchSalesSpy).toHaveBeenCalledTimes(1);
        expect(fetchSalesSpy).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10 }));
      });
    });

    it('las respuestas lentas antiguas no sobrescriben los resultados de una búsqueda posterior más rápida', async () => {
      let resolveSlowRequest!: (value: any) => void;
      const slowPromise = new Promise((resolve) => {
        resolveSlowRequest = resolve;
      });

      const fastSale: SaleDto = {
        ...mockCompletedSale,
        id: 'sale-fast',
        invoiceNumber: 'FAC-RAPIDA-999',
        customerName: 'Cliente Rápido',
      };

      const slowSale: SaleDto = {
        ...mockCompletedSale,
        id: 'sale-slow',
        invoiceNumber: 'FAC-LENTA-000',
        customerName: 'Cliente Lento',
      };

      vi.spyOn(salesApi, 'fetchSales').mockImplementation(async (params) => {
        if (params?.search === 'LENTA') {
          return slowPromise as any;
        }
        if (params?.search === 'RAPIDA') {
          return {
            items: [fastSale],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          };
        }
        return {
          items: [mockCompletedSale],
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        };
      });

      renderCreditNotesPage([
        SYSTEM_PERMISSIONS.SALES_READ,
        SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE,
      ]);

      fireEvent.click(await screen.findByTestId('new-credit-note-btn'));
      expect(await screen.findByTestId('select-sale-for-credit-note-dialog')).toBeInTheDocument();

      const searchInput = screen.getByTestId('sale-search-input');

      // 1. Iniciar búsqueda lenta "LENTA"
      fireEvent.change(searchInput, { target: { value: 'LENTA' } });
      fireEvent.click(screen.getByTestId('search-sale-submit-btn'));

      // 2. Inmediatamente iniciar búsqueda rápida "RAPIDA"
      fireEvent.change(searchInput, { target: { value: 'RAPIDA' } });
      fireEvent.click(screen.getByTestId('search-sale-submit-btn'));

      // 3. La búsqueda rápida responde primero y se muestra en pantalla
      expect(await screen.findByText('FAC-RAPIDA-999')).toBeInTheDocument();
      expect(screen.getByText('Cliente Rápido')).toBeInTheDocument();

      // 4. Ahora resuelve la respuesta lenta anterior
      resolveSlowRequest({
        items: [slowSale],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      // Esperar un ciclo y verificar que la respuesta lenta NO sobrescribe el estado
      await new Promise((r) => setTimeout(r, 50));

      expect(screen.getByText('FAC-RAPIDA-999')).toBeInTheDocument();
      expect(screen.queryByText('FAC-LENTA-000')).toBeNull();
    });

    it('al cerrar y volver a abrir el diálogo, se restablecen correctamente los filtros', async () => {
      const fetchSalesSpy = vi.spyOn(salesApi, 'fetchSales').mockResolvedValue({
        items: [mockCompletedSale],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      renderCreditNotesPage([
        SYSTEM_PERMISSIONS.SALES_READ,
        SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE,
      ]);

      // Abrir diálogo
      fireEvent.click(await screen.findByTestId('new-credit-note-btn'));
      expect(await screen.findByTestId('select-sale-for-credit-note-dialog')).toBeInTheDocument();

      // Escribir y buscar
      const searchInput = screen.getByTestId('sale-search-input');
      fireEvent.change(searchInput, { target: { value: 'María Rodríguez' } });
      fireEvent.click(screen.getByTestId('search-sale-submit-btn'));

      await waitFor(() => {
        expect(fetchSalesSpy).toHaveBeenCalledWith(expect.objectContaining({ search: 'María Rodríguez' }));
      });
      expect(screen.getByTestId('clear-sale-search-btn')).toBeInTheDocument();

      fetchSalesSpy.mockClear();

      // Cerrar diálogo haciendo clic en Cancelar
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      await waitFor(() => {
        expect(screen.queryByTestId('select-sale-for-credit-note-dialog')).not.toBeInTheDocument();
      });

      // Volver a abrir el diálogo
      fireEvent.click(screen.getByTestId('new-credit-note-btn'));
      expect(await screen.findByTestId('select-sale-for-credit-note-dialog')).toBeInTheDocument();

      // El campo de búsqueda debe estar vacío y sin botón limpiar
      expect(screen.getByTestId('sale-search-input')).toHaveValue('');
      expect(screen.queryByTestId('clear-sale-search-btn')).not.toBeInTheDocument();

      // Se debe haber consultado sin filtro de búsqueda
      await waitFor(() => {
        expect(fetchSalesSpy).toHaveBeenCalledWith({
          search: undefined,
          page: 1,
          limit: 20,
        });
      });
    });
  });
});

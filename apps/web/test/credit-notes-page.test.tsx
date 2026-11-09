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
});

import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES, type CreditNoteDto } from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as salesApi from '../src/features/sales/api/sales.api';
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
});


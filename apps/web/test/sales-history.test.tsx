import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES, type SaleDto } from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as salesApi from '../src/features/sales/api/sales.api';
import { SalesHistoryPage } from '../src/features/sales/pages/SalesHistoryPage';
import { CreditNoteDialog } from '../src/features/sales/components/CreditNoteDialog';
import * as accountingApi from '../src/features/accounting/api/accounting.api';
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
    // Un solo comprobante por venta: el título no se repite y el diálogo se imprime como documento
    expect(receiptDialog).toHaveClass('print-document');
    expect(screen.getAllByText(/Comprobante de venta/i)).toHaveLength(1);
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
      screen.getByText(/Las unidades vuelven a sus lotes de origen/i),
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

describe('Formulario nota crédito', () => {
  it('muestra errores y foco sin enviar una devolución inválida', async () => {
    const api = vi.spyOn(accountingApi, 'createSaleCreditNote');
    render(<CreditNoteDialog open sale={mockSalesList[0]} onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar nota crédito' }));
    expect(
      await screen.findByText('Selecciona al menos una cantidad a devolver.'),
    ).toBeInTheDocument();
    expect(screen.getByText('El motivo debe tener mínimo 5 caracteres.')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toHaveFocus();
    expect(api).not.toHaveBeenCalled();
  });

  it('"Devolver todo" llena lo vendido y un cambio de producto entrega la nota al punto de venta', async () => {
    const api = vi
      .spyOn(accountingApi, 'createSaleCreditNote')
      .mockResolvedValue({
        id: 'nc-1',
        creditNoteNumber: 'NC-000001',
      } as accountingApi.CreditNoteDto);
    const onCreated = vi.fn();
    render(
      <CreditNoteDialog open sale={mockSalesList[0]} onClose={vi.fn()} onCreated={onCreated} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Devolver todo' }));
    expect(screen.getByRole('spinbutton')).toHaveValue(
      Number(mockSalesList[0].lines[0].quantityCommercial),
    );
    fireEvent.change(screen.getByLabelText(/Motivo de la devolución/), {
      target: { value: 'Cambio por otra marca' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /cambio de producto/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar nota crédito' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('NC-000001', 'nc-1'));
    expect(api.mock.calls[0][1].items).toEqual([
      {
        saleLineId: 'line-1',
        quantityCommercial: Number(mockSalesList[0].lines[0].quantityCommercial),
      },
    ]);
  });

  it.each(['EFECTIVO', 'TRANSFERENCIA', 'CREDITO'] as const)(
    'conserva payload y medio de reembolso para %s, evita doble envío y conserva clave al reintentar',
    async (paymentMethod) => {
      const api = vi
        .spyOn(accountingApi, 'createSaleCreditNote')
        .mockRejectedValueOnce(new Error('Fallo temporal'))
        .mockReturnValue(new Promise(() => {}));
      render(
        <CreditNoteDialog
          open
          sale={{ ...mockSalesList[0], paymentMethod }}
          onClose={vi.fn()}
          onCreated={vi.fn()}
        />,
      );
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText(/Motivo de la devolución/), {
        target: { value: '  Envase roto  ' },
      });
      fireEvent.click(screen.getByRole('checkbox', { name: /Reintegrar unidades/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar nota crédito' }));
      expect(await screen.findByText('Fallo temporal')).toBeInTheDocument();
      const confirm = screen.getByRole('button', { name: 'Confirmar nota crédito' });
      fireEvent.click(confirm);
      fireEvent.click(confirm);
      await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
      expect(api.mock.calls[0]).toEqual([
        'sale-001',
        {
          saleId: 'sale-001',
          reason: 'Envase roto',
          restock: false,
          refundMethod: paymentMethod === 'CREDITO' ? 'CREDITO_CARTERA' : paymentMethod,
          items: [{ saleLineId: 'line-1', quantityCommercial: 2 }],
        },
        expect.any(String),
      ]);
      expect(api.mock.calls[1]).toEqual(api.mock.calls[0]);
      expect(screen.getByRole('button', { name: 'Registrando…' })).toBeDisabled();
    },
  );
});

describe('Historial de Acciones por Factura (REQ-006)', () => {
  it('muestra el botón Historial de Acciones y abre el diálogo con la trazabilidad cronológica', async () => {
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValue({
      items: mockSalesList,
      total: mockSalesList.length,
      page: 1,
      limit: 100,
      totalPages: 1,
    });

    const mockHistory = {
      saleId: 'sale-001',
      invoiceNumber: 'VEN-20260926-0001',
      status: 'COMPLETED' as const,
      customerName: 'Consumidor Final',
      total: 5000,
      events: [
        {
          id: 'ev-1',
          type: 'VENTA_CREADA' as const,
          title: 'Venta creada',
          description: 'Factura VEN-20260926-0001 registrada por valor de $5.000,00.',
          timestamp: '2026-09-26T14:30:00.000Z',
          userName: 'cajero_1',
          documentNumber: 'VEN-20260926-0001',
          amount: 5000,
        },
        {
          id: 'ev-2',
          type: 'NOTA_CREDITO_CREADA' as const,
          title: 'Nota crédito aplicada',
          description: 'Nota crédito NC-000001 por devolución.',
          timestamp: '2026-09-26T16:00:00.000Z',
          userName: 'admin_1',
          documentNumber: 'NC-000001',
          amount: 2000,
          reason: 'Cambio de producto',
        },
      ],
    };

    const historySpy = vi.spyOn(salesApi, 'fetchSaleActionHistory').mockResolvedValue(mockHistory);

    render(
      <ThemeProvider theme={appTheme}>
        <AuthContext.Provider value={mockAuthContext}>
          <MemoryRouter>
            <SalesHistoryPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </ThemeProvider>,
    );

    // Esperar a que cargue la lista
    expect(await screen.findByText('VEN-20260926-0001')).toBeInTheDocument();

    // Comprobar que existe el botón Historial de Acciones
    const historyBtn = screen.getByTestId('action-history-btn-sale-001');
    expect(historyBtn).toBeInTheDocument();
    expect(historyBtn).toHaveTextContent('Historial de Acciones');

    // Clic en el botón
    fireEvent.click(historyBtn);

    // Debe abrir el diálogo
    expect(await screen.findByTestId('sale-action-history-dialog')).toBeInTheDocument();
    expect(screen.getByText(/Historial de Acciones — Factura VEN-20260926-0001/)).toBeInTheDocument();

    // Debe mostrar los eventos
    await waitFor(() => {
      expect(screen.getByText('Venta creada')).toBeInTheDocument();
      expect(screen.getByText('Nota crédito aplicada')).toBeInTheDocument();
      expect(screen.getByText('NC-000001')).toBeInTheDocument();
      expect(screen.getByText(/Cambio de producto/)).toBeInTheDocument();
    });

    expect(historySpy).toHaveBeenCalledWith('sale-001');

    // Cerrar el diálogo
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => {
      expect(screen.queryByTestId('sale-action-history-dialog')).not.toBeInTheDocument();
    });
  });
});

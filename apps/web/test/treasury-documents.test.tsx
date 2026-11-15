import { ThemeProvider } from '@mui/material';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appTheme } from '../src/theme/app-theme';
import * as treasuryApi from '../src/features/treasury/api/treasury.api';
import * as thirdPartiesApi from '../src/features/third-parties/api/third-parties.api';
import * as receivablesApi from '../src/features/receivables/api/receivables.api';
import * as payablesApi from '../src/features/payables/api/payables.api';
import * as customersApi from '../src/features/customers/api/customers.api';
import {
  SYSTEM_PERMISSIONS,
  type CustomerDto,
  type ThirdPartyDto,
  type TreasuryDocumentDto,
} from '@farmacia/contracts';
import { withAuth } from './support-auth';
import { ReceivablesPage } from '../src/features/receivables/pages/ReceivablesPage';
import {
  CashReceiptsPage,
  DisbursementVouchersPage,
} from '../src/features/treasury/pages/TreasuryDocumentsPage';

const ADMIN_PERMISSIONS = Object.values(SYSTEM_PERMISSIONS);

function renderPage(
  page: React.ReactElement,
  permissions: string[] = ADMIN_PERMISSIONS,
  initialEntries: string[] = ['/'],
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={appTheme}>
        <MemoryRouter initialEntries={initialEntries}>{withAuth(page, permissions)}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

const marta = {
  id: 'cust-1',
  documentType: 'CC',
  documentNumber: '1030',
  name: 'Marta Crédito',
  isActive: true,
} as CustomerDto;

const egreso = {
  id: 'doc-1',
  documentType: 'COMPROBANTE_EGRESO' as const,
  documentNumber: 'CE-000001',
  documentDate: '2026-10-05',
  amount: '185000.00',
  paymentMethod: 'EFECTIVO',
  source: 'CAJA' as const,
  bankAccountName: null,
  concept: 'Pago energía',
  referenceDocumentType: 'EXPENSE',
  referenceDocumentId: 'exp-1',
  thirdPartyName: 'Air-e S.A. E.S.P.',
  origin: 'AUTOMATICO' as const,
  counterpartAccount: null,
  applications: [],
  createdByName: 'contadora',
  createdAt: '2026-10-05T15:00:00.000Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Recibos de caja y comprobantes de egreso', () => {
  it('cada apartado consulta solo su tipo de documento', async () => {
    const spy = vi
      .spyOn(treasuryApi, 'getTreasuryDocuments')
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 });
    renderPage(<CashReceiptsPage />);
    expect(
      await screen.findByText('No hay documentos para los filtros seleccionados.'),
    ).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'RECIBO_CAJA' }));
  });

  it('filtra por estado desde la URL y exporta a Excel exactamente lo filtrado', async () => {
    const list = vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue({
      items: [{ ...egreso, status: 'ANULADO' as const }],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
    const exportSpy = vi.spyOn(treasuryApi, 'exportTreasuryDocuments').mockResolvedValue();
    renderPage(<DisbursementVouchersPage />, ADMIN_PERMISSIONS, [
      '/?estado=ANULADO&desde=2026-10-01&hasta=2026-10-31',
    ]);
    expect(await screen.findByText('Air-e S.A. E.S.P.')).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'COMPROBANTE_EGRESO',
        status: 'ANULADO',
        fromDate: '2026-10-01',
        toDate: '2026-10-31',
      }),
    );
    expect(screen.getByTestId('treasury-status-filter')).toHaveValue('ANULADO');

    fireEvent.click(screen.getByRole('button', { name: 'Exportar a Excel (1)' }));
    await waitFor(() =>
      expect(exportSpy).toHaveBeenCalledWith(
        {
          type: 'COMPROBANTE_EGRESO',
          status: 'ANULADO',
          fromDate: '2026-10-01',
          toDate: '2026-10-31',
          search: undefined,
        },
        'comprobantes_egreso_2026-10-01_2026-10-31.xlsx',
      ),
    );
  });

  it('sin documentos no se ofrece exportar', async () => {
    vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
    renderPage(<CashReceiptsPage />);
    expect(await screen.findByRole('button', { name: 'Exportar a Excel (0)' })).toBeDisabled();
  });

  it('si el servidor rechaza la exportación muestra su motivo', async () => {
    vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue({
      items: [egreso],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
    vi.spyOn(treasuryApi, 'exportTreasuryDocuments').mockRejectedValue(
      new Error('La consulta tiene 6000 documentos y la exportación admite hasta 5000.'),
    );
    renderPage(<DisbursementVouchersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar a Excel (1)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('admite hasta 5000');
  });

  it('lista el comprobante con su tercero y muestra el detalle imprimible', async () => {
    vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue({
      items: [egreso],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
    renderPage(<DisbursementVouchersPage />);
    expect(
      await screen.findByRole('heading', { name: 'Comprobantes de Egreso' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Air-e S.A. E.S.P.')).toBeInTheDocument();
    expect(screen.getByText('$185.000,00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'CE-000001' }));
    expect(await screen.findByText('Comprobante de egreso CE-000001')).toBeInTheDocument();
    expect(screen.getByText(/Pagado a/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeInTheDocument();
  });

  it('el recibo de caja abona facturas del cliente elegidas y confirma su impacto antes de registrar', async () => {
    vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
    vi.spyOn(customersApi, 'fetchCustomers').mockResolvedValue({
      items: [marta],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    vi.spyOn(receivablesApi, 'fetchReceivables').mockResolvedValue({
      items: [
        {
          id: 'rec-1',
          saleId: 's-1',
          customerId: 'cust-1',
          invoiceNumber: 'FAC-001',
          totalAmount: '10000.00',
          amountPaid: '0.00',
          balance: '10000.00',
          status: 'PENDIENTE',
          dueDate: '2026-11-30',
          notes: null,
          createdAt: '2026-10-31T10:00:00.000Z',
          updatedAt: '2026-10-31T10:00:00.000Z',
        },
        {
          id: 'rec-2',
          saleId: 's-2',
          customerId: 'cust-1',
          invoiceNumber: 'FAC-002',
          totalAmount: '5000.00',
          amountPaid: '0.00',
          balance: '5000.00',
          status: 'PENDIENTE',
          dueDate: '2026-11-30',
          notes: null,
          createdAt: '2026-10-31T11:00:00.000Z',
          updatedAt: '2026-10-31T11:00:00.000Z',
        },
      ],
      total: 2,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    });
    const create = vi.spyOn(treasuryApi, 'createCashReceipt').mockResolvedValue({
      ...egreso,
      id: 'rc-1',
      documentType: 'RECIBO_CAJA',
      documentNumber: 'RC-000001',
      amount: '4000.00',
      origin: 'CARTERA',
    } as TreasuryDocumentDto);

    renderPage(<CashReceiptsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo recibo de caja' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo recibo de caja' });
    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: /Cliente/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Marta Crédito/ }));
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: 'Seleccionar FAC-001' }));
    fireEvent.change(within(dialog).getByLabelText('Valor a aplicar a FAC-001'), {
      target: { value: '4000' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Concepto/), {
      target: { value: 'Abono de octubre' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    // La confirmación nombra al cliente, el valor y la factura que recibe el abono
    const confirm = await screen.findByRole('dialog', { name: '¿Registrar el recibo de caja?' });
    expect(within(confirm).getByTestId('confirm-subject')).toHaveTextContent(
      /Cliente: Marta Crédito/,
    );
    expect(within(confirm).getByTestId('confirm-effects')).toHaveTextContent(/FAC-001: abono de/);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Registrar recibo de caja' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        {
          kind: 'CARTERA',
          paymentMethod: 'EFECTIVO',
          bankAccountId: undefined,
          concept: 'Abono de octubre',
          customerId: 'cust-1',
          applications: [{ receivableId: 'rec-1', amount: '4000.00' }],
        },
        expect.any(String),
      ),
    );
  });

  it('el comprobante de egreso no deja aplicar más que el saldo y abre el estado de cuenta del proveedor', async () => {
    vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
    vi.spyOn(thirdPartiesApi, 'fetchThirdParties').mockResolvedValue({
      items: [
        {
          id: 'tp-2',
          documentType: 'NIT',
          documentNumber: '900',
          name: 'Droguería Mayorista',
          supplierId: 'sup-1',
        } as ThirdPartyDto,
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    const item = {
      documentType: 'CAUSACION_GASTO' as const,
      documentId: 'exp-1',
      documentNumber: 'FV-88',
      supplierId: 'sup-1',
      supplierName: 'Droguería Mayorista',
      description: 'Arriendo',
      documentDate: '2026-10-05',
      dueDate: null,
      totalAmount: '80000.00',
      amountPaid: '0.00',
      balance: '80000.00',
      status: 'PENDIENTE',
      daysOverdue: 27,
      agingBucket: 'CORRIENTE' as const,
    };
    const aging = {
      current: { amount: '80000.00', count: 1 },
      days31To60: { amount: '0.00', count: 0 },
      days61To90: { amount: '0.00', count: 0 },
      daysOver90: { amount: '0.00', count: 0 },
      totalPending: '80000.00',
      totalCount: 1,
    };
    const statement = vi
      .spyOn(payablesApi, 'fetchPayableStatement')
      .mockResolvedValue({ items: [item], aging });
    const create = vi.spyOn(treasuryApi, 'createDisbursement');

    renderPage(<DisbursementVouchersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo comprobante de egreso' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo comprobante de egreso' });
    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: /Proveedor/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Droguería Mayorista/ }));
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: 'Seleccionar FV-88' }));
    fireEvent.change(within(dialog).getByLabelText('Valor a aplicar a FV-88'), {
      target: { value: '90000' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Concepto/), {
      target: { value: 'Pago arriendo' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(await within(dialog).findByText(/supera su saldo/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Estado de cuenta' }));
    expect(await screen.findByText('Estado de cuenta — Droguería Mayorista')).toBeInTheDocument();
    expect(statement).toHaveBeenLastCalledWith({ supplierId: 'sup-1', includePaid: true });
  });

  describe('permisos por documento', () => {
    const empty = { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 };

    it('cuentas por cobrar es de solo consulta y no muestra el botón de nuevo recibo incluso con permisos de recaudo', async () => {
      vi.spyOn(receivablesApi, 'fetchReceivables').mockResolvedValue(empty);
      vi.spyOn(receivablesApi, 'fetchReceivablesAgingSummary').mockResolvedValue({
        current: { amount: '0.00', count: 0 },
        days31To60: { amount: '0.00', count: 0 },
        days61To90: { amount: '0.00', count: 0 },
        daysOver90: { amount: '0.00', count: 0 },
        totalPending: '0.00',
        totalCount: 0,
      });
      renderPage(<ReceivablesPage />, [
        SYSTEM_PERMISSIONS.RECEIVABLES_READ,
        SYSTEM_PERMISSIONS.RECEIVABLES_MANAGE,
        SYSTEM_PERMISSIONS.CUSTOMERS_READ,
        SYSTEM_PERMISSIONS.CASH_RECEIPTS_COLLECT,
        SYSTEM_PERMISSIONS.TREASURY_ACCOUNTS_SELECT,
      ]);
      expect(
        await screen.findByRole('heading', { name: 'Cuentas por Cobrar' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Nuevo recibo de caja' })).toBeNull();
    });

    it('en recibos de caja con permiso de recaudo se registra el recibo como abono a cartera', async () => {
      vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue(empty);
      vi.spyOn(customersApi, 'fetchCustomers').mockResolvedValue({ ...empty, items: [marta] });
      const thirdParties = vi.spyOn(thirdPartiesApi, 'fetchThirdParties');
      renderPage(<CashReceiptsPage />, [
        SYSTEM_PERMISSIONS.RECEIVABLES_READ,
        SYSTEM_PERMISSIONS.CASH_RECEIPTS_COLLECT,
        SYSTEM_PERMISSIONS.CUSTOMERS_READ,
      ]);
      fireEvent.click(await screen.findByRole('button', { name: 'Nuevo recibo de caja' }));
      const dialog = await screen.findByRole('dialog', { name: 'Nuevo recibo de caja' });
      // Sin permiso contable no se ofrece el ingreso manual
      expect(within(dialog).queryByRole('button', { name: 'Ingreso manual' })).toBeNull();
      fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: /Cliente/ }));
      expect(await screen.findByRole('option', { name: /Marta Crédito/ })).toBeInTheDocument();
      expect(thirdParties).not.toHaveBeenCalled();
    });

    it('sin recibo_caja.crear_abono cuentas por cobrar no muestra el botón del recibo', async () => {
      vi.spyOn(receivablesApi, 'fetchReceivables').mockResolvedValue(empty);
      renderPage(<ReceivablesPage />, [SYSTEM_PERMISSIONS.RECEIVABLES_READ]);
      expect(await screen.findByText('Cuentas por Cobrar')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Nuevo recibo de caja' })).toBeNull();
    });

    it('sin comprobante_egreso.crear no se ofrece el comprobante de egreso', async () => {
      vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue(empty);
      renderPage(<DisbursementVouchersPage />, [
        SYSTEM_PERMISSIONS.ACCOUNTING_READ,
        SYSTEM_PERMISSIONS.PAYABLES_MANAGE,
        SYSTEM_PERMISSIONS.EXPENSES_MANAGE,
      ]);
      expect(
        await screen.findByText('No hay documentos para los filtros seleccionados.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Nuevo comprobante de egreso' })).toBeNull();
    });

    it('accounting:read solo consulta: registrar un recibo manual exige recibo_caja.crear_manual', async () => {
      vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue(empty);
      renderPage(<CashReceiptsPage />, [SYSTEM_PERMISSIONS.ACCOUNTING_READ]);
      expect(await screen.findByText(/Recibos de Caja/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Nuevo recibo de caja' })).toBeNull();
    });

    it('tesorería (recibo_caja.crear_manual, sin contabilidad) registra solo recibos manuales', async () => {
      vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue(empty);
      renderPage(<CashReceiptsPage />, [SYSTEM_PERMISSIONS.CASH_RECEIPTS_MANUAL]);
      fireEvent.click(await screen.findByRole('button', { name: 'Nuevo recibo de caja' }));
      const dialog = await screen.findByRole('dialog', { name: 'Nuevo recibo de caja' });
      expect(within(dialog).queryByRole('button', { name: 'Abono a cartera' })).toBeNull();
      expect(within(dialog).getByRole('combobox', { name: /Tercero/ })).toBeInTheDocument();
    });
  });

  describe('REQ-008: Corrección y edición de documentos de tesorería', () => {
    it('corrige un recibo asociado a una factura (permite modificar concepto, valor aplicado, muestra diff, exige motivo y realiza reemplazo transaccional)', async () => {
      const rcCartera: TreasuryDocumentDto = {
        id: 'rc-101',
        documentType: 'RECIBO_CAJA',
        documentNumber: 'RC-000101',
        documentDate: '2026-10-10',
        amount: '50000.00',
        paymentMethod: 'EFECTIVO',
        source: 'CAJA',
        bankAccountName: null,
        concept: 'Abono factura FAC-001',
        referenceDocumentType: null,
        referenceDocumentId: null,
        thirdPartyName: 'Marta Crédito',
        customerId: 'cust-1',
        origin: 'CARTERA',
        counterpartAccount: null,
        applications: [
          {
            documentType: 'FACTURA_VENTA',
            documentId: 'rec-1',
            documentNumber: 'FAC-001',
            amount: '50000.00',
            isReversed: false,
          },
        ],
        status: 'VIGENTE',
        cancelledAt: null,
        cancelledByName: null,
        cancellationReason: null,
        createdByName: 'cajero',
        createdAt: '2026-10-10T10:00:00.000Z',
      };

      vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue({
        items: [rcCartera],
        total: 1,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      });
      const correctSpy = vi.spyOn(treasuryApi, 'correctTreasuryDocument').mockResolvedValue({
        ...rcCartera,
        id: 'rc-102',
        documentNumber: 'RC-000102',
        amount: '40000.00',
      });

      renderPage(<CashReceiptsPage />);
      expect(await screen.findByRole('button', { name: 'RC-000101' })).toBeInTheDocument();

      // Abrir detalle imprimible
      fireEvent.click(screen.getByRole('button', { name: 'RC-000101' }));
      expect(await screen.findByText('Recibo de caja RC-000101')).toBeInTheDocument();

      // Abrir diálogo de corrección
      fireEvent.click(screen.getByRole('button', { name: 'Corregir Documento' }));
      expect(await screen.findByText(/Corregir Recibo de Caja RC-000101/)).toBeInTheDocument();

      // Verificar que muestra la información original y el diff view
      expect(
        screen.getByText('1. Información del Documento Original a Corregir'),
      ).toBeInTheDocument();
      expect(screen.getByText('3. Comparación de Diferencias (Diff View)')).toBeInTheDocument();

      // Modificar concepto y valor aplicado
      fireEvent.change(screen.getByLabelText('Concepto Corregido *'), {
        target: { value: 'Abono corregido FAC-001' },
      });
      fireEvent.change(screen.getByDisplayValue('50000.00'), {
        target: { value: '40000' },
      });

      // Seleccionar motivo obligatorio
      fireEvent.click(screen.getByRole('button', { name: 'Ajuste en valores aplicados' }));

      // Enviar corrección
      const corregirBtns = screen.getAllByRole('button', { name: 'Corregir Documento' });
      fireEvent.click(corregirBtns[corregirBtns.length - 1]);

      // Confirmar en SweetModal
      expect(await screen.findByText('¿Confirmar Corrección del Documento?')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar y Reemplazar' }));

      // Una sola llamada: el servidor anula y emite el reemplazo en la misma transacción
      await waitFor(() => {
        expect(correctSpy).toHaveBeenCalledWith(
          'rc-101',
          {
            reason: 'Ajuste en valores aplicados',
            replacement: expect.objectContaining({
              kind: 'CARTERA',
              customerId: 'cust-1',
              applications: [{ receivableId: 'rec-1', amount: '40000.00' }],
            }),
          },
          expect.any(String),
        );
      });
    });

    it('corrige un comprobante de pago a proveedor (modificando facturas y concepto)', async () => {
      const ceProveedor: TreasuryDocumentDto = {
        id: 'ce-201',
        documentType: 'COMPROBANTE_EGRESO',
        documentNumber: 'CE-000201',
        documentDate: '2026-10-15',
        amount: '80000.00',
        paymentMethod: 'EFECTIVO',
        source: 'CAJA',
        bankAccountName: null,
        concept: 'Pago factura proveedor FV-88',
        referenceDocumentType: null,
        referenceDocumentId: null,
        thirdPartyName: 'Droguería Mayorista',
        supplierId: 'sup-1',
        origin: 'PROVEEDOR',
        counterpartAccount: null,
        applications: [
          {
            documentType: 'FACTURA_COMPRA',
            documentId: 'pay-1',
            documentNumber: 'FV-88',
            amount: '80000.00',
            isReversed: false,
          },
        ],
        status: 'VIGENTE',
        cancelledAt: null,
        cancelledByName: null,
        cancellationReason: null,
        createdByName: 'tesorero',
        createdAt: '2026-10-15T11:00:00.000Z',
      };

      vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue({
        items: [ceProveedor],
        total: 1,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      });
      const correctSpy = vi.spyOn(treasuryApi, 'correctTreasuryDocument').mockResolvedValue({
        ...ceProveedor,
        id: 'ce-202',
        documentNumber: 'CE-000202',
        amount: '70000.00',
      });

      renderPage(<DisbursementVouchersPage />);
      expect(await screen.findByRole('button', { name: 'CE-000201' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'CE-000201' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Corregir Documento' }));
      expect(
        await screen.findByText(/Corregir Comprobante de Egreso CE-000201/),
      ).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Concepto Corregido *'), {
        target: { value: 'Pago corregido proveedor' },
      });
      fireEvent.change(screen.getByDisplayValue('80000.00'), {
        target: { value: '70000' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Error en el concepto digitado' }));

      const corregirBtns = screen.getAllByRole('button', { name: 'Corregir Documento' });
      fireEvent.click(corregirBtns[corregirBtns.length - 1]);

      expect(await screen.findByText('¿Confirmar Corrección del Documento?')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar y Reemplazar' }));

      await waitFor(() => {
        expect(correctSpy).toHaveBeenCalledWith(
          'ce-201',
          {
            reason: 'Error en el concepto digitado',
            replacement: expect.objectContaining({
              kind: 'PROVEEDOR',
              supplierId: 'sup-1',
              applications: [
                { documentType: 'FACTURA_COMPRA', documentId: 'pay-1', amount: '70000.00' },
              ],
            }),
          },
          expect.any(String),
        );
      });
    });

    it('corrige un documento cuyo medio de pago sea incorrecto (efectivo a transferencia con banco)', async () => {
      const rcManual: TreasuryDocumentDto = {
        id: 'rc-301',
        documentType: 'RECIBO_CAJA',
        documentNumber: 'RC-000301',
        documentDate: '2026-10-18',
        amount: '30000.00',
        paymentMethod: 'EFECTIVO',
        source: 'CAJA',
        bankAccountName: null,
        concept: 'Ingreso manual por servicios',
        referenceDocumentType: null,
        referenceDocumentId: null,
        thirdPartyName: 'Cliente Varios',
        origin: 'MANUAL',
        counterpartAccount: '413501 - Comercio',
        counterpartAccountId: 'acc-4135',
        applications: [],
        status: 'VIGENTE',
        cancelledAt: null,
        cancelledByName: null,
        cancellationReason: null,
        createdByName: 'contador',
        createdAt: '2026-10-18T09:00:00.000Z',
      };

      vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue({
        items: [rcManual],
        total: 1,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      });
      vi.spyOn(treasuryApi, 'getBankAccountOptions').mockResolvedValue([
        {
          id: 'bank-1',
          name: 'Principal',
          bankName: 'Bancolombia',
          accountNumberLast4: '1234',
          isActive: true,
        },
      ]);
      const correctSpy = vi.spyOn(treasuryApi, 'correctTreasuryDocument').mockResolvedValue({
        ...rcManual,
        id: 'rc-302',
        documentNumber: 'RC-000302',
        paymentMethod: 'TRANSFERENCIA',
        bankAccountId: 'bank-1',
      });

      renderPage(<CashReceiptsPage />);
      expect(await screen.findByRole('button', { name: 'RC-000301' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'RC-000301' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Corregir Documento' }));
      expect(await screen.findByText(/Corregir Recibo de Caja RC-000301/)).toBeInTheDocument();

      // Cambiar medio de pago a Transferencia
      fireEvent.mouseDown(screen.getByLabelText('Medio de Pago Corregido'));
      fireEvent.click(await screen.findByRole('option', { name: 'Transferencia Bancaria' }));

      // Seleccionar cuenta bancaria
      fireEvent.mouseDown(await screen.findByLabelText(/Cuenta Bancaria de Destino/));
      fireEvent.click(await screen.findByRole('option', { name: /Principal — Bancolombia/ }));

      // Seleccionar motivo
      fireEvent.click(screen.getByRole('button', { name: 'Corrección de medio de pago' }));

      const corregirBtns = screen.getAllByRole('button', { name: 'Corregir Documento' });
      fireEvent.click(corregirBtns[corregirBtns.length - 1]);

      expect(await screen.findByText('¿Confirmar Corrección del Documento?')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar y Reemplazar' }));

      await waitFor(() => {
        expect(correctSpy).toHaveBeenCalledWith(
          'rc-301',
          {
            reason: 'Corrección de medio de pago',
            replacement: expect.objectContaining({
              kind: 'MANUAL',
              paymentMethod: 'TRANSFERENCIA',
              bankAccountId: 'bank-1',
              counterpartAccountId: 'acc-4135',
            }),
          },
          expect.any(String),
        );
      });
    });

    it('soporta guardar y recuperar borrador en el formulario sin generar movimientos contables', async () => {
      vi.spyOn(treasuryApi, 'getTreasuryDocuments').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      });
      localStorage.clear();

      renderPage(<CashReceiptsPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Nuevo recibo de caja' }));
      const dialog = await screen.findByRole('dialog', { name: 'Nuevo recibo de caja' });

      // Ingresar concepto y observaciones de borrador
      fireEvent.change(within(dialog).getByLabelText(/Concepto/), {
        target: { value: 'Borrador de prueba de tesorería' },
      });
      fireEvent.change(within(dialog).getByLabelText(/Observaciones/), {
        target: { value: 'Pendiente de verificar soporte físico' },
      });

      // Guardar borrador
      fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar Borrador' }));
      expect(
        await within(dialog).findByText(/Borrador guardado correctamente/i),
      ).toBeInTheDocument();

      // Cerrar modal y esperar a que desaparezca
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
      await waitForElementToBeRemoved(() =>
        screen.queryByRole('dialog', { name: 'Nuevo recibo de caja' }),
      );

      // Volver a abrir: debe detectar el borrador pendiente
      fireEvent.click(await screen.findByRole('button', { name: 'Nuevo recibo de caja' }));
      const dialog2 = await screen.findByRole('dialog', { name: 'Nuevo recibo de caja' });
      expect(
        await within(dialog2).findByText(/Existe un borrador guardado sin contabilizar/i),
      ).toBeInTheDocument();

      // Cargar el borrador
      fireEvent.click(within(dialog2).getByRole('button', { name: 'Cargar borrador' }));
      expect(
        await within(dialog2).findByDisplayValue('Borrador de prueba de tesorería'),
      ).toBeInTheDocument();
      expect(
        within(dialog2).getByDisplayValue('Pendiente de verificar soporte físico'),
      ).toBeInTheDocument();
    });
  });
});

describe('Rediseño fase 4: acciones de cada documento y su motivo', () => {
  const cartera: TreasuryDocumentDto = {
    id: 'rc-500',
    documentType: 'RECIBO_CAJA',
    documentNumber: 'RC-000500',
    documentDate: '2026-11-10',
    amount: '30000.00',
    paymentMethod: 'EFECTIVO',
    source: 'CAJA',
    bankAccountName: null,
    concept: 'Abono FAC-9',
    referenceDocumentType: null,
    referenceDocumentId: null,
    thirdPartyName: 'Marta Crédito',
    customerId: 'cust-1',
    origin: 'CARTERA',
    counterpartAccount: null,
    applications: [
      {
        documentType: 'FACTURA_VENTA',
        documentId: 'rec-9',
        documentNumber: 'FAC-9',
        amount: '30000.00',
        isReversed: false,
      },
      {
        documentType: 'FACTURA_VENTA',
        documentId: 'rec-8',
        documentNumber: 'FAC-8',
        amount: '5000.00',
        isReversed: true,
      },
    ],
    status: 'VIGENTE',
    cancelledAt: null,
    cancelledByName: null,
    cancellationReason: null,
    createdByName: 'cartera',
    createdAt: '2026-11-10T10:00:00.000Z',
  };
  const list = (items: TreasuryDocumentDto[]) =>
    vi
      .spyOn(treasuryApi, 'getTreasuryDocuments')
      .mockResolvedValue({ items, total: items.length, page: 1, pageSize: 25, totalPages: 1 });

  it('un egreso automático solo se imprime y dice desde dónde se corrige', async () => {
    list([
      {
        ...egreso,
        status: 'VIGENTE',
        cancelledAt: null,
        cancelledByName: null,
        cancellationReason: null,
      },
    ]);
    renderPage(<DisbursementVouchersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'CE-000001' }));
    const notice = await screen.findByTestId('treasury-actions-restriction');
    expect(notice).toHaveTextContent('Lo generó el gasto exp-1');
    expect(notice).toHaveTextContent('se corrige o anula desde ese documento');
    expect(within(notice).getByRole('link', { name: 'Ir a gastos' })).toHaveAttribute(
      'href',
      '/expenses',
    );
    expect(screen.queryByRole('button', { name: 'Corregir Documento' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Anular Documento' })).toBeNull();
    expect(screen.getByTestId('treasury-doc-origin')).toHaveTextContent(
      'Emitido automáticamente por el gasto exp-1',
    );
  });

  it('un automático con documento de origen identificado enlaza a ese documento exacto', async () => {
    list([
      {
        ...egreso,
        referenceDocumentType: 'EXPENSE_PAYMENT_REVERSAL',
        referenceDocumentId: '5b0c1f3e-8a7d-4c2b-9e6f-1a2b3c4d5e6f',
        sourceDocument: {
          kind: 'GASTO',
          id: 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b',
          number: 'G-0012',
        },
        status: 'VIGENTE',
        cancelledAt: null,
        cancelledByName: null,
        cancellationReason: null,
      },
    ]);
    renderPage(<DisbursementVouchersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'CE-000001' }));
    const notice = await screen.findByTestId('treasury-actions-restriction');
    // El id interno no se muestra: se nombra el gasto por su número
    expect(notice).toHaveTextContent('Lo generó la reversión del pago del gasto G-0012');
    expect(notice).not.toHaveTextContent('5b0c1f3e');
    expect(within(notice).getByRole('link', { name: 'Abrir el gasto G-0012' })).toHaveAttribute(
      'href',
      '/expenses?gasto=f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b',
    );
  });

  it('sin permiso de anular no hay acciones y se nombra el permiso que falta', async () => {
    list([cartera]);
    renderPage(<CashReceiptsPage />, [SYSTEM_PERMISSIONS.CASH_RECEIPTS_COLLECT]);
    fireEvent.click(await screen.findByRole('button', { name: 'RC-000500' }));
    expect(await screen.findByTestId('treasury-actions-restriction')).toHaveTextContent(
      'Anular o corregir exige el permiso «Anular recibos de caja» (recibo_caja.anular)',
    );
    expect(screen.queryByRole('button', { name: 'Anular Documento' })).toBeNull();
  });

  it('con permiso de anular pero no de registrar el reemplazo: anula, no corrige, y explica', async () => {
    list([cartera]);
    renderPage(<CashReceiptsPage />, [SYSTEM_PERMISSIONS.CASH_RECEIPTS_ANNUL]);
    fireEvent.click(await screen.findByRole('button', { name: 'RC-000500' }));
    expect(await screen.findByTestId('treasury-actions-restriction')).toHaveTextContent(
      'Puedes anularlo. Corregirlo emite un documento de reemplazo',
    );
    expect(screen.getByRole('button', { name: 'Anular Documento' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corregir Documento' })).toBeNull();
  });

  it('un documento anulado muestra su estado y no admite cambios', async () => {
    list([
      {
        ...cartera,
        status: 'ANULADO',
        cancelledAt: '2026-11-11T10:00:00.000Z',
        cancelledByName: 'admin',
        cancellationReason: 'Corregido con RC-000501: valor mal digitado',
      },
    ]);
    renderPage(<CashReceiptsPage />);
    const row = (await screen.findByRole('button', { name: 'RC-000500' })).closest('tr')!;
    expect(within(row).getByText('Anulado')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'RC-000500' }));
    expect(await screen.findByTestId('treasury-actions-restriction')).toHaveTextContent(
      'Documento anulado: no admite cambios',
    );
    expect(screen.getByText(/Corregido con RC-000501/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corregir Documento' })).toBeNull();
  });

  it('la corrección no reaplica abonos revertidos y, si el servidor la rechaza, avisa que el original sigue vigente', async () => {
    list([cartera]);
    const correctSpy = vi
      .spyOn(treasuryApi, 'correctTreasuryDocument')
      .mockRejectedValue(
        new Error('No es posible reversar asientos: los documentos están bloqueados.'),
      );
    renderPage(<CashReceiptsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'RC-000500' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Corregir Documento' }));
    await screen.findByText(/Corregir Recibo de Caja RC-000500/);
    // Solo la factura con abono vigente
    expect(screen.getByText('FAC-9')).toBeInTheDocument();
    expect(screen.queryByText('FAC-8')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ajuste en valores aplicados' }));
    const buttons = screen.getAllByRole('button', { name: 'Corregir Documento' });
    fireEvent.click(buttons[buttons.length - 1]);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar y Reemplazar' }));

    expect(
      await screen.findByText(/RC-000500 sigue vigente; no se aplicó ningún cambio/),
    ).toBeInTheDocument();
    expect(correctSpy).toHaveBeenCalledWith(
      'rc-500',
      expect.objectContaining({
        replacement: expect.objectContaining({
          applications: [{ receivableId: 'rec-9', amount: '30000.00' }],
        }),
      }),
      expect.any(String),
    );
  });

  it('los filtros de fecha y búsqueda se toman de la URL', async () => {
    const spy = list([]);
    renderPage(<CashReceiptsPage />, ADMIN_PERMISSIONS, [
      '/treasury/receipts?desde=2026-11-01&hasta=2026-11-30&q=Marta',
    ]);
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ fromDate: '2026-11-01', toDate: '2026-11-30', search: 'Marta' }),
      ),
    );
    expect(screen.getByLabelText('Buscar número, concepto o documento')).toHaveValue('Marta');
  });
});

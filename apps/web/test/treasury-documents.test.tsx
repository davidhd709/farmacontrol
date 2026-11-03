import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function renderPage(page: React.ReactElement, permissions: string[] = ADMIN_PERMISSIONS) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={appTheme}>
        <MemoryRouter>{withAuth(page, permissions)}</MemoryRouter>
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
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));

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

    it('cartera registra el recibo desde cuentas por cobrar, solo como abono a cartera', async () => {
      vi.spyOn(receivablesApi, 'fetchReceivables').mockResolvedValue(empty);
      vi.spyOn(receivablesApi, 'fetchReceivablesAgingSummary').mockResolvedValue({
        current: { amount: '0.00', count: 0 },
        days31To60: { amount: '0.00', count: 0 },
        days61To90: { amount: '0.00', count: 0 },
        daysOver90: { amount: '0.00', count: 0 },
        totalPending: '0.00',
        totalCount: 0,
      });
      vi.spyOn(customersApi, 'fetchCustomers').mockResolvedValue({ ...empty, items: [marta] });
      const thirdParties = vi.spyOn(thirdPartiesApi, 'fetchThirdParties');
      renderPage(<ReceivablesPage />, [
        SYSTEM_PERMISSIONS.RECEIVABLES_READ,
        SYSTEM_PERMISSIONS.RECEIVABLES_MANAGE,
        SYSTEM_PERMISSIONS.CUSTOMERS_READ,
        SYSTEM_PERMISSIONS.CASH_RECEIPTS_COLLECT,
        SYSTEM_PERMISSIONS.TREASURY_ACCOUNTS_SELECT,
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
});

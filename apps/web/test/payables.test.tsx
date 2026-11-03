import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayableStatementDto, ThirdPartyDto } from '@farmacia/contracts';
import * as payablesApi from '../src/features/payables/api/payables.api';
import * as thirdPartiesApi from '../src/features/third-parties/api/third-parties.api';
import { PayablesPage } from '../src/features/payables/pages/PayablesPage';
import { appTheme } from '../src/theme/app-theme';
import { withAuth } from './support-auth';

import { setDateField } from './support-date';
const statement: PayableStatementDto = {
  items: [
    {
      documentType: 'FACTURA_COMPRA',
      documentId: 'pay-1',
      documentNumber: 'FAC-PROV-101',
      supplierId: 'sup-1',
      supplierName: 'Distribuciones del Valle',
      description: 'Factura de compra',
      documentDate: '2026-08-01',
      dueDate: '2026-08-31',
      totalAmount: '500000.00',
      amountPaid: '200000.00',
      balance: '300000.00',
      status: 'PENDIENTE',
      daysOverdue: 62,
      agingBucket: 'DIAS_61_90',
    },
    {
      documentType: 'CAUSACION_GASTO',
      documentId: 'exp-1',
      documentNumber: 'FV-88',
      supplierId: 'sup-1',
      supplierName: 'Distribuciones del Valle',
      description: 'Arriendo bodega',
      documentDate: '2026-10-20',
      dueDate: null,
      totalAmount: '80000.00',
      amountPaid: '0.00',
      balance: '80000.00',
      status: 'PENDIENTE',
      daysOverdue: 12,
      agingBucket: 'CORRIENTE',
    },
  ],
  aging: {
    current: { amount: '80000.00', count: 1 },
    days31To60: { amount: '0.00', count: 0 },
    days61To90: { amount: '300000.00', count: 1 },
    daysOver90: { amount: '0.00', count: 0 },
    totalPending: '380000.00',
    totalCount: 2,
  },
};

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{withAuth(<PayablesPage />)}</MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

describe('PayablesPage: consulta por proveedor y fechas con edades', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(thirdPartiesApi, 'fetchThirdParties').mockResolvedValue({
      items: [
        {
          id: 'tp-1',
          documentType: 'NIT',
          documentNumber: '900',
          name: 'Distribuciones del Valle',
          supplierId: 'sup-1',
        } as ThirdPartyDto,
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  });

  it('no muestra nada por defecto ni consulta sin filtro', async () => {
    const spy = vi.spyOn(payablesApi, 'fetchPayableStatement');
    renderPage();
    expect(screen.getByText(/Consulta por proveedor o por fecha/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByText(/Elige un proveedor o un rango de fechas/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('consulta por proveedor y fechas, clasifica por edad y abre el detalle de cada documento', async () => {
    const spy = vi.spyOn(payablesApi, 'fetchPayableStatement').mockResolvedValue(statement);
    vi.spyOn(payablesApi, 'fetchPayableMovements').mockResolvedValue({
      payableId: 'pay-1',
      invoiceNumber: 'FAC-PROV-101',
      supplierName: 'Distribuciones del Valle',
      totalAmount: '500000.00',
      amountPaid: '200000.00',
      balance: '300000.00',
      status: 'PENDIENTE',
      dueDate: '2026-08-31',
      movements: [],
    });
    renderPage();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Proveedor/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Distribuciones del Valle/ }));
    setDateField('Fecha desde', '2026-08-01');
    setDateField('Fecha hasta', '2026-10-31');
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        supplierId: 'sup-1',
        fromDate: '2026-08-01',
        toDate: '2026-10-31',
        includePaid: undefined,
      }),
    );
    expect(await screen.findByText('FAC-PROV-101')).toBeInTheDocument();
    expect(screen.getAllByText('Corriente (hasta 30 días)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('90 días').length).toBeGreaterThan(0);
    expect(screen.getByText('$380.000,00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Pagar$/ })).not.toBeInTheDocument();

    const row = screen.getByText('FAC-PROV-101').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Detalle' }));
    expect(await screen.findByText(/registra un comprobante de egreso/)).toBeInTheDocument();
  });
});

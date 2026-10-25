import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  InventoryValuationReportDto,
  ExpirationsReportDto,
  SalesReportDto,
  CashSummaryReportDto,
  TopProductsReportDto,
} from '@farmacia/contracts';
import * as reportsApi from '../src/features/reports/api/reports.api';
import { ReportsPage } from '../src/features/reports/pages/ReportsPage';
import { appTheme } from '../src/theme/app-theme';

const mockValuation: InventoryValuationReportDto = {
  generatedAt: '2026-09-26T22:00:00.000Z',
  totalProducts: 2,
  totalUnits: 120,
  totalCostValuation: 1500,
  totalPriceValuation: 2400,
  totalPotentialMargin: 900,
  productsWithValuationIssues: 0,
  items: [
    {
      productId: 'p1',
      productCode: 'MED-001',
      productName: 'Amoxicilina 500mg',
      categoryName: 'Antibióticos',
      baseUnit: 'CAP',
      currentStock: 50,
      baseCost: 10,
      basePrice: 16,
      totalCostValue: 500,
      totalPriceValue: 800,
      activeLotsCount: 2,
      potentialMargin: 300,
      valuationIssue: null,
    },
    {
      productId: 'p2',
      productCode: 'MED-002',
      productName: 'Ibuprofeno 400mg',
      categoryName: 'Analgésicos',
      baseUnit: 'TAB',
      currentStock: 70,
      baseCost: 14.28,
      basePrice: 22.85,
      totalCostValue: 1000,
      totalPriceValue: 1600,
      activeLotsCount: 1,
      potentialMargin: 600,
      valuationIssue: null,
    },
  ],
};

const mockExpirations: ExpirationsReportDto = {
  generatedAt: '2026-09-26T22:00:00.000Z',
  totalLots: 2,
  vencidosCount: 1,
  criticosCount: 1,
  alertasCount: 0,
  proximosCount: 0,
  items: [
    {
      lotId: 'l1',
      lotNumber: 'LOT-VENC-01',
      productId: 'p1',
      productCode: 'MED-001',
      productName: 'Amoxicilina 500mg',
      categoryName: 'Antibióticos',
      locationName: 'Bodega Principal',
      expirationDate: '2026-05-15',
      daysRemaining: -10,
      severity: 'VENCIDO',
      currentQuantity: 20,
      baseUnit: 'CAP',
    },
    {
      lotId: 'l2',
      lotNumber: 'LOT-CRIT-02',
      productId: 'p2',
      productCode: 'MED-002',
      productName: 'Ibuprofeno 400mg',
      categoryName: 'Analgésicos',
      locationName: 'Bodega Principal',
      expirationDate: '2026-06-15',
      daysRemaining: 15,
      severity: 'CRITICO',
      currentQuantity: 50,
      baseUnit: 'TAB',
    },
  ],
};

const mockSales: SalesReportDto = {
  generatedAt: '2026-09-26T22:00:00.000Z',
  fromDate: '2026-09-01',
  toDate: '2026-09-30',
  totalSales: 1,
  totalAmount: 100,
  byPaymentMethod: { EFECTIVO: 100 },
  items: [
    {
      saleId: 's1',
      invoiceNumber: 'FAC-000001',
      soldAt: '2026-09-26T15:00:00.000Z',
      customerName: 'Cliente Ocasional',
      customerDocument: '12345678',
      paymentMethod: 'EFECTIVO',
      status: 'CONFIRMED',
      itemsCount: 5,
      subtotal: 81,
      taxAmount: 19,
      totalAmount: 100,
    },
  ],
};

const mockCashSummary: CashSummaryReportDto = {
  generatedAt: '2026-09-26T22:00:00.000Z',
  fromDate: '2026-09-01',
  toDate: '2026-09-30',
  totalMovements: 2,
  totalInflows: 200,
  totalOutflows: 50,
  netCashFlow: 150,
  items: [
    {
      id: 'm1',
      createdAt: '2026-09-26T15:00:00.000Z',
      movementType: 'IN',
      concept: 'VENTA_EFECTIVO',
      amount: 200,
      paymentMethod: 'EFECTIVO',
      referenceDocumentType: 'VENTA',
      referenceDocumentId: 'FAC-000001',
      userName: 'Administrador',
    },
    {
      id: 'm2',
      createdAt: '2026-09-26T16:00:00.000Z',
      movementType: 'OUT',
      concept: 'RETIRO_MANUAL',
      amount: 50,
      paymentMethod: 'EFECTIVO',
      referenceDocumentType: null,
      referenceDocumentId: null,
      userName: 'Administrador',
    },
  ],
};

const mockTopProducts: TopProductsReportDto = {
  generatedAt: '2026-10-18T15:00:00Z',
  fromDate: null,
  toDate: null,
  sortBy: 'units',
  limit: 20,
  items: [
    {
      rank: 1,
      productId: 'p1',
      productCode: 'MED-001',
      productName: 'Amoxicilina 500mg',
      baseUnit: 'CAP',
      soldBaseUnits: 120,
      returnedBaseUnits: 10,
      netBaseUnits: 110,
      soldValue: 12000,
      returnedValue: 1000,
      netValue: 11000,
      salesCount: 7,
    },
  ],
};

function renderReportsPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={appTheme}>
        <MemoryRouter>
          <ReportsPage />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('ReportsPage (UX-27)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(reportsApi, 'fetchInventoryValuationReport').mockResolvedValue(mockValuation);
    vi.spyOn(reportsApi, 'fetchExpirationsReport').mockResolvedValue(mockExpirations);
    vi.spyOn(reportsApi, 'fetchSalesReport').mockResolvedValue(mockSales);
    vi.spyOn(reportsApi, 'fetchCashSummaryReport').mockResolvedValue(mockCashSummary);
    vi.spyOn(reportsApi, 'fetchTopProductsReport').mockResolvedValue(mockTopProducts);
    vi.spyOn(reportsApi, 'downloadReportCsv').mockResolvedValue(undefined);
  });

  it('renders inventory valuation report initially and displays KPI metrics', async () => {
    renderReportsPage();

    expect(screen.getByText(/Reportes Operativos y Exportación/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Amoxicilina 500mg')).toBeInTheDocument();
      expect(screen.getByText('Ibuprofeno 400mg')).toBeInTheDocument();
    });

    expect(screen.getByText('VALORIZACIÓN AL COSTO')).toBeInTheDocument();
    expect(screen.getByText('VALORIZACIÓN A LA VENTA')).toBeInTheDocument();
  });

  it('switches to expirations tab and shows expiration details', async () => {
    renderReportsPage();

    const expirationsTab = screen.getByTestId('tab-expirations');
    fireEvent.click(expirationsTab);

    await waitFor(() => {
      expect(reportsApi.fetchExpirationsReport).toHaveBeenCalled();
      expect(screen.getByText('LOT-VENC-01')).toBeInTheDocument();
      expect(screen.getByText('LOT-CRIT-02')).toBeInTheDocument();
    });

    expect(screen.getByText(/VENCIDOS/i)).toBeInTheDocument();
    expect(screen.getByText(/CRÍTICOS/i)).toBeInTheDocument();
  });

  it('switches to sales tab and displays sales totals and invoices', async () => {
    renderReportsPage();

    const salesTab = screen.getByTestId('tab-sales');
    fireEvent.click(salesTab);

    await waitFor(() => {
      expect(reportsApi.fetchSalesReport).toHaveBeenCalled();
      expect(screen.getByText('FAC-000001')).toBeInTheDocument();
      expect(screen.getByText('TOTAL VENTAS')).toBeInTheDocument();
    });
  });

  it('switches to cash summary tab and displays cash flow metrics and movements', async () => {
    renderReportsPage();

    const cashTab = screen.getByTestId('tab-cash');
    fireEvent.click(cashTab);

    await waitFor(() => {
      expect(reportsApi.fetchCashSummaryReport).toHaveBeenCalled();
      expect(screen.getByText('FLUJO NETO')).toBeInTheDocument();
      expect(screen.getByText('RETIRO_MANUAL')).toBeInTheDocument();
    });
  });

  it('triggers CSV download when clicking Export button', async () => {
    renderReportsPage();

    await waitFor(() => {
      expect(screen.getByText('Amoxicilina 500mg')).toBeInTheDocument();
    });

    const exportBtn = screen.getByTestId('export-csv-btn');
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(reportsApi.downloadReportCsv).toHaveBeenCalledWith(
        'inventory-valuation',
        expect.any(Object),
      );
    });
  });
});

describe('Reportes T-32 y T-34', () => {
  beforeEach(() => {
    vi.spyOn(reportsApi, 'fetchInventoryValuationReport').mockResolvedValue(mockValuation);
    vi.spyOn(reportsApi, 'fetchTopProductsReport').mockResolvedValue(mockTopProducts);
    vi.spyOn(reportsApi, 'downloadReportCsv').mockResolvedValue(undefined);
  });

  it('muestra margen potencial sin porcentaje y las tres causas de exclusión', async () => {
    vi.mocked(reportsApi.fetchInventoryValuationReport).mockResolvedValue({
      ...mockValuation,
      totalPotentialMargin: 3000000,
      productsWithValuationIssues: 3,
      items: [
        mockValuation.items[0],
        ...(['MISSING_COST', 'MISSING_PRICE', 'MISSING_COST_AND_PRICE'] as const).map(
          (valuationIssue, i) => ({
            ...mockValuation.items[1],
            productId: `missing-${i}`,
            potentialMargin: null,
            valuationIssue,
          }),
        ),
      ],
    });
    renderReportsPage();
    expect(await screen.findByText('$ 3.000.000,00')).toBeInTheDocument();
    expect(
      screen.getByText(
        'No es utilidad realizada: diferencia entre valor a precio de venta y valor al costo del inventario actual',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('3 productos sin costo o precio: el total de margen potencial los excluye.'),
    ).toBeInTheDocument();
    for (const text of ['Sin costo', 'Sin precio', 'Sin costo ni precio'])
      expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('renderiza unidades base y valores, cambia orden, límite y fechas y exporta los mismos filtros', async () => {
    renderReportsPage();
    fireEvent.click(screen.getByTestId('tab-top-products'));
    expect(await screen.findByText('120 CAP')).toBeInTheDocument();
    expect(screen.getByText('10 CAP')).toBeInTheDocument();
    expect(screen.getByText('110 CAP')).toBeInTheDocument();
    expect(screen.getByText('$ 11.000,00')).toBeInTheDocument();
    expect(reportsApi.fetchTopProductsReport).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'units', limit: 20 }),
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Ordenar por' }));
    fireEvent.click(screen.getByRole('option', { name: 'Valor' }));
    fireEvent.change(screen.getByLabelText('Límite'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-18' } });
    const filters = { fromDate: '2026-10-01', toDate: '2026-10-18', sortBy: 'value', limit: 5 };
    await waitFor(() => expect(reportsApi.fetchTopProductsReport).toHaveBeenCalledWith(filters));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar productos más vendidos a CSV' }));
    await waitFor(() =>
      expect(reportsApi.downloadReportCsv).toHaveBeenCalledWith('top-products', filters),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    await waitFor(() =>
      expect(reportsApi.fetchTopProductsReport).toHaveBeenLastCalledWith(
        expect.objectContaining({
          fromDate: screen.getByLabelText('Desde').getAttribute('value'),
          toDate: screen.getByLabelText('Hasta').getAttribute('value'),
        }),
      ),
    );
  });

  it('muestra vacío sin una tabla de ceros', async () => {
    vi.mocked(reportsApi.fetchTopProductsReport).mockResolvedValue({
      ...mockTopProducts,
      items: [],
    });
    renderReportsPage();
    fireEvent.click(screen.getByTestId('tab-top-products'));
    expect(await screen.findByText('Sin ventas en el período')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('distingue carga, error y reintento', async () => {
    let rejectQuery!: (error: Error) => void;
    vi.mocked(reportsApi.fetchTopProductsReport).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectQuery = reject;
        }),
    );
    renderReportsPage();
    fireEvent.click(screen.getByTestId('tab-top-products'));
    expect(screen.getByText('Cargando productos más vendidos…')).toBeInTheDocument();
    rejectQuery(new Error('offline'));
    expect(
      await screen.findByText('No fue posible cargar los productos más vendidos.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Sin ventas en el período')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('120 CAP')).toBeInTheDocument();
  });

  it('rechaza límites fuera de 1..100 y rangos invertidos sin consultar ni exportar', async () => {
    renderReportsPage();
    fireEvent.click(screen.getByTestId('tab-top-products'));
    await screen.findByText('120 CAP');
    const calls = vi.mocked(reportsApi.fetchTopProductsReport).mock.calls.length;
    fireEvent.change(screen.getByLabelText('Límite'), { target: { value: '101' } });
    expect(
      screen.getByRole('button', { name: 'Exportar productos más vendidos a CSV' }),
    ).toBeDisabled();
    expect(reportsApi.fetchTopProductsReport).toHaveBeenCalledTimes(calls);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-18' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    expect(
      screen.getByText('La fecha inicial debe ser anterior o igual a la final.'),
    ).toBeInTheDocument();
  });
});

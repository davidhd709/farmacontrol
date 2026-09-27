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

import type {
  SupplierReturnReportDto,
  CashSummaryReportDto,
  ExpirationsReportDto,
  InventoryValuationReportDto,
  ReportDateFilter,
  SalesReportDto,
  TopProductsFilter,
  TopProductsReportDto,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';
import { businessToday } from '../../../utils/business-date';

const DEFAULT_API_URL = '/api/v1';
const apiUrl = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, '');

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
}

function unwrapReportData<T>(res: ApiResponse<T> | T): T {
  if (
    res &&
    typeof res === 'object' &&
    'data' in res &&
    (res as ApiResponse<T>).data !== undefined
  ) {
    return (res as ApiResponse<T>).data as T;
  }
  return res as T;
}

export async function fetchInventoryValuationReport(): Promise<InventoryValuationReportDto> {
  const res = await apiRequest<
    ApiResponse<InventoryValuationReportDto> | InventoryValuationReportDto
  >('reports/inventory-valuation', { method: 'GET' });
  return unwrapReportData(res);
}

export async function fetchSupplierReturnsReport(): Promise<SupplierReturnReportDto> {
  const res = await apiRequest<ApiResponse<SupplierReturnReportDto> | SupplierReturnReportDto>(
    'reports/supplier-returns',
    { method: 'GET' },
  );
  return unwrapReportData(res);
}

export async function fetchExpirationsReport(): Promise<ExpirationsReportDto> {
  const res = await apiRequest<ApiResponse<ExpirationsReportDto> | ExpirationsReportDto>(
    'reports/expirations',
    { method: 'GET' },
  );
  return unwrapReportData(res);
}

export async function fetchSalesReport(filter: ReportDateFilter = {}): Promise<SalesReportDto> {
  const query = new URLSearchParams();
  if (filter.fromDate) query.set('fromDate', filter.fromDate);
  if (filter.toDate) query.set('toDate', filter.toDate);

  const qs = query.toString();
  const res = await apiRequest<ApiResponse<SalesReportDto> | SalesReportDto>(
    qs ? `reports/sales?${qs}` : 'reports/sales',
    { method: 'GET' },
  );
  return unwrapReportData(res);
}

export async function fetchCashSummaryReport(
  filter: ReportDateFilter = {},
): Promise<CashSummaryReportDto> {
  const query = new URLSearchParams();
  if (filter.fromDate) query.set('fromDate', filter.fromDate);
  if (filter.toDate) query.set('toDate', filter.toDate);

  const qs = query.toString();
  const res = await apiRequest<ApiResponse<CashSummaryReportDto> | CashSummaryReportDto>(
    qs ? `reports/cash-summary?${qs}` : 'reports/cash-summary',
    { method: 'GET' },
  );
  return unwrapReportData(res);
}

function topProductsParams(filter: TopProductsFilter): URLSearchParams {
  const query = new URLSearchParams();
  if (filter.fromDate) query.set('fromDate', filter.fromDate);
  if (filter.toDate) query.set('toDate', filter.toDate);
  if (filter.sortBy) query.set('sortBy', filter.sortBy);
  if (filter.limit !== undefined) query.set('limit', String(filter.limit));
  return query;
}

export async function fetchTopProductsReport(
  filter: TopProductsFilter = {},
): Promise<TopProductsReportDto> {
  const query = topProductsParams(filter);
  const res = await apiRequest<ApiResponse<TopProductsReportDto> | TopProductsReportDto>(
    `reports/top-products?${query.toString()}`,
    { method: 'GET' },
  );
  return unwrapReportData(res);
}

/**
 * Descarga directamente el reporte solicitado en formato CSV con UTF-8 BOM.
 */
export async function downloadReportCsv(
  reportPath:
    | 'inventory-valuation'
    | 'expirations'
    | 'sales'
    | 'cash-summary'
    | 'supplier-returns'
    | 'top-products',
  filter: TopProductsFilter = {},
): Promise<void> {
  const query = topProductsParams(filter);
  query.set('format', 'csv');

  const url = `${apiUrl}/reports/${reportPath}?${query.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Error al generar la exportación en archivo CSV.');
  }

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `reporte_${reportPath}_${businessToday()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(blobUrl);
}

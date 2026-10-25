import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request, type APIRequestContext } from '@playwright/test';

export const baseURL = (() => {
  const url = process.env.E2E_BASE_URL;
  if (!url) throw new Error('E2E_BASE_URL no está definido: ejecute `pnpm test:e2e`.');
  return url;
})();

export const outputDir = process.env.E2E_OUTPUT_DIR ?? '.test-runs/e2e-local';
export const fixturesFile = `${outputDir}/fixtures.json`;
export const adminStateFile = `${outputDir}/admin.storage.json`;
export const cashierStateFile = `${outputDir}/cashier.storage.json`;

export interface E2eFixtures {
  admin: { username: string; password: string };
  cashier: { username: string; password: string };
  categoryId: string;
  supplierId: string;
  customer: { id: string; name: string; documentNumber: string };
}

export function loadFixtures(): E2eFixtures {
  return JSON.parse(readFileSync(fixturesFile, 'utf8')) as E2eFixtures;
}

/** Algunas rutas responden `{ success, data }` y otras el DTO directo. */
function unwrap<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export async function apiAs(username: string, password: string): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL });
  const response = await api.post('/api/v1/auth/login', { data: { username, password } });
  if (!response.ok()) {
    throw new Error(`Login de ${username} falló: ${response.status()} ${await response.text()}`);
  }
  return api;
}

export async function call<T>(
  api: APIRequestContext,
  method: 'get' | 'post' | 'put' | 'patch',
  path: string,
  data?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const response = await api[method](`/api/v1/${path}`, { data, headers });
  if (!response.ok()) {
    throw new Error(
      `${method.toUpperCase()} ${path} → ${response.status()}: ${await response.text()}`,
    );
  }
  return unwrap<T>(await response.json());
}

/** Día calendario de Bogotá desplazado `days` días, como YYYY-MM-DD. */
export function businessDay(days = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const uniqueCode = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;

export interface StockedProduct {
  id: string;
  code: string;
  name: string;
  lots: { lotNumber: string; expirationDate: string; quantity: number }[];
}

/**
 * Crea un producto con control de lote y lo abastece con una compra real (kardex incluido).
 * Los lotes se reciben en el orden dado; FEFO debe ignorar ese orden y usar el vencimiento.
 */
export async function createStockedProduct(
  api: APIRequestContext,
  fixtures: E2eFixtures,
  options: {
    name: string;
    basePrice: number;
    baseCost?: number;
    lots: { suffix: string; daysToExpire: number; quantity: number }[];
  },
): Promise<StockedProduct> {
  const code = uniqueCode('E2E');
  const product = await call<{ id: string }>(api, 'post', 'products', {
    categoryId: fixtures.categoryId,
    code,
    name: `${options.name} ${code}`,
    inventoryControlMode: 'LOT_EXPIRY',
    basePrice: options.basePrice,
    baseCost: options.baseCost ?? Math.round(options.basePrice / 2),
  });
  const lots = options.lots.map((lot) => ({
    lotNumber: `${code}-${lot.suffix}`,
    expirationDate: businessDay(lot.daysToExpire),
    quantity: lot.quantity,
  }));
  await call(api, 'post', 'purchases/receive', {
    supplierId: fixtures.supplierId,
    invoiceNumber: uniqueCode('FAC'),
    purchaseDate: businessDay(),
    paymentCondition: 'CONTADO',
    lines: lots.map((lot) => ({
      productId: product.id,
      lotNumber: lot.lotNumber,
      expirationDate: lot.expirationDate,
      quantityCommercial: lot.quantity,
      unitCost: options.baseCost ?? Math.round(options.basePrice / 2),
    })),
  });
  return { id: product.id, code, name: `${options.name} ${code}`, lots };
}

export async function lotQuantities(
  api: APIRequestContext,
  productId: string,
): Promise<Record<string, number>> {
  const response = await api.get(`/api/v1/inventory/lots?productId=${productId}&pageSize=100`);
  if (!response.ok()) throw new Error(`Lotes → ${response.status()}`);
  const body = (await response.json()) as {
    items: { lotNumber: string; currentQuantity: number }[];
  };
  return Object.fromEntries(body.items.map((lot) => [lot.lotNumber, lot.currentQuantity]));
}

export async function confirmSaleViaApi(
  api: APIRequestContext,
  payload: Record<string, unknown>,
): Promise<{ id: string; invoiceNumber: string; total: number }> {
  return call(api, 'post', 'sales/confirm', payload, { 'Idempotency-Key': randomUUID() });
}

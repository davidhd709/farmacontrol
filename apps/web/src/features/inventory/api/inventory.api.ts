import type {
  CreateInventoryLotPayload,
  CreateLocationPayload,
  InventoryLotDto,
  InventoryLotQueryFilters,
  LocationDto,
  PaginatedResponse,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function fetchInventoryLots(
  filters: InventoryLotQueryFilters = {},
): Promise<PaginatedResponse<InventoryLotDto>> {
  const query = new URLSearchParams();

  if (filters.productId) query.set('productId', filters.productId);
  if (filters.locationId) query.set('locationId', filters.locationId);
  if (filters.lotNumber?.trim()) query.set('lotNumber', filters.lotNumber.trim());
  if (filters.hasStockOnly) query.set('hasStockOnly', 'true');
  if (filters.expiringBefore) query.set('expiringBefore', filters.expiringBefore);
  if (filters.isActive !== undefined) query.set('isActive', String(filters.isActive));
  if (filters.page) query.set('page', String(filters.page));
  if (filters.pageSize) query.set('pageSize', String(filters.pageSize));

  const qs = query.toString();
  return apiRequest<PaginatedResponse<InventoryLotDto>>(
    qs ? `inventory/lots?${qs}` : 'inventory/lots',
    { method: 'GET' },
  );
}

export async function fetchAvailableLotsFefo(
  productId: string,
  locationId?: string,
): Promise<InventoryLotDto[]> {
  const qs = locationId ? `?locationId=${locationId}` : '';
  const res = await apiRequest<{ data: InventoryLotDto[] }>(
    `inventory/products/${productId}/fefo${qs}`,
    { method: 'GET' },
  );
  return res.data;
}

export async function createInventoryLot(
  payload: CreateInventoryLotPayload,
): Promise<InventoryLotDto> {
  const res = await apiRequest<{ data: InventoryLotDto }>('inventory/lots', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function fetchLocations(): Promise<LocationDto[]> {
  const res = await apiRequest<{ data: LocationDto[] }>('inventory/locations', {
    method: 'GET',
  });
  return res.data;
}

export async function createLocation(
  payload: CreateLocationPayload,
): Promise<LocationDto> {
  const res = await apiRequest<{ data: LocationDto }>('inventory/locations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function fetchInventoryMovements(
  filters: any = {},
): Promise<any> {
  const query = new URLSearchParams();
  if (filters.productId) query.set('productId', filters.productId);
  if (filters.lotId) query.set('lotId', filters.lotId);
  if (filters.movementType) query.set('movementType', filters.movementType);
  if (filters.page) query.set('page', String(filters.page));
  if (filters.pageSize) query.set('pageSize', String(filters.pageSize));

  const qs = query.toString();
  return apiRequest(qs ? `inventory/movements?${qs}` : 'inventory/movements', {
    method: 'GET',
  });
}

export async function adjustInventory(
  payload: {
    productId: string;
    lotId: string;
    adjustmentType: 'INCREMENTO' | 'DECREMENTO';
    quantityBaseUnits: number;
    reason: string;
    notes?: string;
  },
): Promise<any> {
  const res = await apiRequest<{ data: any }>('inventory/movements/adjust', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

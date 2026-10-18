import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { InventoryMovementsPage } from '../src/features/inventory/pages/InventoryMovementsPage';
import * as inventoryApi from '../src/features/inventory/api/inventory.api';
import * as productsApi from '../src/features/catalog/api/products.api';

describe('Movimientos del lote desde alertas', () => {
  it('usa lotId de la URL en la consulta y permite limpiar el filtro', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
      totalPages: 0,
    });
    vi.spyOn(inventoryApi, 'fetchInventoryMovements').mockResolvedValue({ items: [], total: 0 });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/inventory/movements?lotId=lot-2']}>
          <InventoryMovementsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(inventoryApi.fetchInventoryMovements).toHaveBeenCalledWith(
        expect.objectContaining({ lotId: 'lot-2', page: 1 }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtro de lote' }));
    await waitFor(() =>
      expect(inventoryApi.fetchInventoryMovements).toHaveBeenLastCalledWith(
        expect.objectContaining({ lotId: undefined, page: 1 }),
      ),
    );
  });
});

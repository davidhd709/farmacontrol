import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryLotDto, InventoryMovementDto, ProductDto } from '@farmacia/contracts';
import { appTheme } from '../src/theme/app-theme';
import { InventoryLotsPage } from '../src/features/inventory/pages/InventoryLotsPage';
import { InventoryMovementsPage } from '../src/features/inventory/pages/InventoryMovementsPage';
import * as inventoryApi from '../src/features/inventory/api/inventory.api';
import * as productsApi from '../src/features/catalog/api/products.api';

const product = {
  id: 'p-1',
  code: 'LOS50',
  name: 'Losartán 50 mg',
  baseUnit: 'TABLETA',
  inventoryControlMode: 'LOT_EXPIRY',
  availableStock: 120,
} as ProductDto;

const lot = {
  id: 'lot-1',
  productId: 'p-1',
  locationId: 'loc-1',
  lotNumber: 'L-2027',
  expirationDate: '2027-06-30',
  currentQuantity: 120,
  isActive: true,
  product: { name: 'Losartán 50 mg', code: 'LOS50', baseUnit: 'TABLETA' },
} as unknown as InventoryLotDto;

function renderAt(path: string) {
  return render(
    <ThemeProvider theme={appTheme}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/inventory/lots" element={<InventoryLotsPage />} />
          <Route path="/inventory/movements" element={<InventoryMovementsPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Stock por producto y por lote, conectado con el Kardex (rediseño fase 3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue({
      items: [product],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
    vi.spyOn(inventoryApi, 'fetchInventoryLots').mockResolvedValue({
      items: [lot],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
    vi.spyOn(inventoryApi, 'fetchLocations').mockResolvedValue([]);
    vi.spyOn(inventoryApi, 'fetchInventoryMovements').mockResolvedValue({
      items: [
        {
          id: 'm-1',
          movementType: 'SALIDA_DEVOLUCION_COMPRA',
          productId: 'p-1',
          lotId: 'lot-1',
          quantityBaseUnits: 5,
          presentationFactorHistorical: 1,
          balanceAfterBaseUnits: 115,
          referenceDocumentType: 'DEBIT_NOTE',
          referenceDocumentId: 'ND-000001',
          createdAt: '2026-11-14T15:00:00Z',
          product: { name: 'Losartán 50 mg' },
          lot: { lotNumber: 'L-2027' },
        } as unknown as InventoryMovementDto,
      ],
      total: 1,
    });
  });

  it('la vista por producto muestra la existencia vendible y lleva a sus lotes', async () => {
    const user = userEvent.setup();
    renderAt('/inventory/lots?vista=producto');
    const table = await screen.findByRole('table', { name: 'Existencias por producto' });
    expect(within(table).getByText('120 TABLETA')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Kardex' })).toHaveAttribute(
      'href',
      '/inventory/movements?productId=p-1',
    );
    await user.click(within(table).getByRole('button', { name: 'Ver lotes' }));
    await waitFor(() =>
      expect(inventoryApi.fetchInventoryLots).toHaveBeenLastCalledWith(
        expect.objectContaining({ productId: 'p-1' }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Por lote' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await screen.findByRole('link', { name: 'Kardex del lote L-2027' })).toHaveAttribute(
      'href',
      '/inventory/movements?productId=p-1&lotId=lot-1',
    );
  });

  it('el Kardex toma producto y documento de la URL y muestra los códigos en español', async () => {
    renderAt('/inventory/movements?productId=p-1&ref=purch-1&refLabel=la%20compra%20FAC-9');
    await waitFor(() =>
      expect(inventoryApi.fetchInventoryMovements).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'p-1', referenceDocumentId: 'purch-1' }),
      ),
    );
    expect(screen.getByText('Mostrando los movimientos de la compra FAC-9')).toBeInTheDocument();
    expect(await screen.findByText('Salida por devolución a proveedor')).toBeInTheDocument();
    expect(screen.getByText('Nota débito: ND-000001')).toBeInTheDocument();
    expect(screen.queryByText('SALIDA_DEVOLUCION_COMPRA')).not.toBeInTheDocument();
  });
});

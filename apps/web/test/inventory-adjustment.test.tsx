import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryMovementDto } from '@farmacia/contracts';
import * as inventoryApi from '../src/features/inventory/api/inventory.api';
import * as productsApi from '../src/features/catalog/api/products.api';
import { AdjustInventoryDialog } from '../src/features/inventory/components/AdjustInventoryDialog';
import { InventoryMovementsPage } from '../src/features/inventory/pages/InventoryMovementsPage';
import { appTheme } from '../src/theme/app-theme';

const baseMovement = {
  productId: 'prod-1',
  lotId: 'lot-1',
  presentationFactorHistorical: 1,
  createdByUserId: 'user-1',
  product: { id: 'prod-1', code: 'ACE-500', name: 'Acetaminofén 500mg', baseUnit: 'TABLETA' },
  lot: { id: 'lot-1', lotNumber: 'LOT-ACE-01', expirationDate: '2027-06-30' },
};

describe('Ajuste de inventario: motivo y observaciones (FARM-AUD-012)', () => {
  it('limita el motivo a 250 caracteres y las observaciones a 500, mostrando el conteo', () => {
    render(
      <ThemeProvider theme={appTheme}>
        <AdjustInventoryDialog open onClose={vi.fn()} onSuccess={vi.fn()} products={[]} lots={[]} />
      </ThemeProvider>,
    );

    const reason = screen.getByLabelText(/Motivo Justificado/i);
    expect(reason).toHaveAttribute('maxlength', '250');
    expect(screen.getByText('0/250')).toBeInTheDocument();

    const notes = screen.getByLabelText(/Notas Adicionales/i);
    expect(notes).toHaveAttribute('maxlength', '500');
    expect(screen.getByText('0/500')).toBeInTheDocument();
  });
});

describe('Historial de movimientos: motivo del ajuste (FARM-AUD-012)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
      totalPages: 0,
    } as never);
    const movements: InventoryMovementDto[] = [
      {
        ...baseMovement,
        id: 'mov-new',
        movementType: 'AJUSTE_NEGATIVO',
        quantityBaseUnits: -4,
        balanceAfterBaseUnits: 46,
        referenceDocumentType: 'AJUSTE_MANUAL',
        referenceDocumentId: null,
        reason: 'Unidades vencidas retiradas de la estantería',
        notes: 'Acta 15',
        createdAt: '2026-10-12T15:00:00.000Z',
      },
      {
        ...baseMovement,
        id: 'mov-legacy',
        movementType: 'AJUSTE_POSITIVO',
        quantityBaseUnits: 2,
        balanceAfterBaseUnits: 50,
        referenceDocumentType: 'AJUSTE_MANUAL',
        referenceDocumentId: 'MOTIVO: Sobrante en conteo',
        reason: null,
        notes: 'Sobrante en conteo',
        createdAt: '2026-09-01T15:00:00.000Z',
      },
    ];
    vi.spyOn(inventoryApi, 'fetchInventoryMovements').mockResolvedValue({
      items: movements,
      total: movements.length,
    });
  });

  it('muestra el motivo de los ajustes nuevos y conserva el de los heredados', async () => {
    render(
      <ThemeProvider theme={appTheme}>
        <MemoryRouter>
          <InventoryMovementsPage />
        </MemoryRouter>
      </ThemeProvider>,
    );

    const newRow = await waitFor(() => screen.getByText('−4').closest('tr') as HTMLElement);
    expect(
      within(newRow).getByText('Motivo: Unidades vencidas retiradas de la estantería'),
    ).toBeInTheDocument();
    expect(within(newRow).queryByText(/AJUSTE_MANUAL: $/)).not.toBeInTheDocument();

    const legacyRow = screen.getByText('+2').closest('tr') as HTMLElement;
    expect(
      within(legacyRow).getByText('AJUSTE_MANUAL: MOTIVO: Sobrante en conteo'),
    ).toBeInTheDocument();
  });
});

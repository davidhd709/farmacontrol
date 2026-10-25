import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProductDto, InventoryLotDto } from '@farmacia/contracts';
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

describe('Formulario ajuste con RHF + Zod', () => {
  const product = { id: 'prod-1', code: 'ACE-500', name: 'Acetaminofén 500mg' } as ProductDto;
  const lot = {
    id: 'lot-1',
    productId: 'prod-1',
    lotNumber: 'LOT-ACE-01',
    currentQuantity: 10,
    expirationDate: '2099-12-31',
  } as InventoryLotDto;
  const renderForm = () =>
    render(
      <AdjustInventoryDialog
        open
        products={[product]}
        lots={[lot]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
  async function choose(user: ReturnType<typeof userEvent.setup>, label: RegExp, option: RegExp) {
    await user.click(screen.getByRole('combobox', { name: label }));
    await user.click(screen.getByRole('option', { name: option }));
  }
  it('muestra errores de campo y enfoca el primer inválido sin llamar a API', async () => {
    const api = vi.spyOn(inventoryApi, 'adjustInventory');
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y Confirmar' }));
    expect(await screen.findByText('Seleccione el producto a ajustar.')).toBeInTheDocument();
    expect(
      screen.getByText('La justificación o motivo del ajuste es obligatoria.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Producto/ })).toHaveFocus();
    expect(api).not.toHaveBeenCalled();
  });
  it('valida el motivo antes de confirmar y envía exactamente el payload original una vez', async () => {
    const api = vi.spyOn(inventoryApi, 'adjustInventory').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderForm();
    await choose(user, /^Producto/, /Acetaminofén/);
    await choose(user, /Lote Específico/, /LOT-ACE-01/);
    await choose(user, /Tipo de Ajuste/, /Decremento/);
    fireEvent.change(screen.getByLabelText(/Cantidad a Ajustar/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y Confirmar' }));
    expect(
      await screen.findByText('La justificación o motivo del ajuste es obligatoria.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Motivo Justificado/)).toHaveFocus();
    expect(api).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Motivo Justificado/), {
      target: { value: '  Frasco averiado  ' },
    });
    fireEvent.change(screen.getByLabelText(/Notas Adicionales/), {
      target: { value: '  Acta 15  ' },
    });
    await user.click(screen.getByRole('button', { name: 'Revisar y Confirmar' }));
    const confirm = await screen.findByRole('button', { name: 'Asentar Ajuste' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(api).toHaveBeenCalledExactlyOnceWith({
        productId: 'prod-1',
        lotId: 'lot-1',
        adjustmentType: 'DECREMENTO',
        quantityBaseUnits: 3,
        reason: 'Frasco averiado',
        notes: 'Acta 15',
      }),
    );
    expect(screen.getByRole('button', { name: /Procesando/ })).toBeDisabled();
  });
});

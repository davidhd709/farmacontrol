import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpenseCategoryDto } from '@farmacia/contracts';
import { appTheme } from '../src/theme/app-theme';
import * as api from '../src/features/expenses/api/expenses.api';
import { ExpenseCategoriesModal } from '../src/features/expenses/components/ExpenseCategoriesModal';

const category: ExpenseCategoryDto = {
  id: 'cat-1',
  name: 'Servicios públicos',
  description: null,
  accountId: 'acc-5135',
  accountCode: '513525',
  accountName: 'Acueducto y alcantarillado',
  isActive: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'fetchExpenseCategories').mockResolvedValue([category]);
  vi.spyOn(api, 'fetchPucAccounts').mockResolvedValue([
    {
      id: 'acc-5135',
      code: '513525',
      name: 'Acueducto y alcantarillado',
      type: 'EXPENSE',
      allowsMovement: true,
      isActive: true,
    } as never,
  ]);
});

describe('Categorías de gasto', () => {
  it('inactivar una categoría pide confirmación y el error queda dentro del diálogo', async () => {
    const update = vi
      .spyOn(api, 'updateExpenseCategory')
      .mockRejectedValueOnce(new Error('No se pudo guardar la categoría.'))
      .mockResolvedValueOnce({ ...category, isActive: false });
    render(
      <ThemeProvider theme={appTheme}>
        <ExpenseCategoriesModal open onClose={vi.fn()} />
      </ThemeProvider>,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar categoría Servicios públicos' }),
    );
    const form = await screen.findByRole('dialog', { name: 'Editar Categoría de Gasto' });
    fireEvent.click(within(form).getByRole('switch'));
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar categoría' }));

    const confirm = await screen.findByRole('dialog', {
      name: '¿Inactivar la categoría de gasto?',
    });
    expect(within(confirm).getByTestId('confirm-subject')).toHaveTextContent(
      'Servicios públicos · 513525 Acueducto y alcantarillado',
    );
    expect(update).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole('button', { name: 'Inactivar categoría' }));
    expect(await within(confirm).findByRole('alert')).toHaveTextContent(
      'No se pudo guardar la categoría.',
    );
    fireEvent.click(within(confirm).getByRole('button', { name: 'Inactivar categoría' }));
    await waitFor(() =>
      expect(update).toHaveBeenLastCalledWith(
        'cat-1',
        expect.objectContaining({ isActive: false }),
      ),
    );
    expect(
      await screen.findByText('Categoría Servicios públicos actualizada.'),
    ).toBeInTheDocument();
  });

  it('un error al guardar se muestra en el formulario abierto, no detrás de él', async () => {
    vi.spyOn(api, 'createExpenseCategory').mockRejectedValue(
      new Error('Ya existe una categoría con ese nombre.'),
    );
    render(
      <ThemeProvider theme={appTheme}>
        <ExpenseCategoriesModal open onClose={vi.fn()} />
      </ThemeProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Nueva categoría/i }));
    const form = await screen.findByRole('dialog', { name: 'Nueva Categoría de Gasto' });
    fireEvent.change(within(form).getByRole('textbox', { name: /Nombre de la Categoría/ }), {
      target: { value: 'Servicios públicos' },
    });
    fireEvent.mouseDown(within(form).getByRole('combobox', { name: /Cuenta Contable/ }));
    fireEvent.click(await screen.findByRole('option', { name: /513525/ }));
    fireEvent.click(within(form).getByRole('button', { name: 'Crear categoría' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Ya existe una categoría con ese nombre.',
    );
  });
});

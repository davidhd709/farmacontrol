import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS, type UnitOfMeasureDto } from '@farmacia/contracts';
import { appTheme } from '../src/theme/app-theme';
import { withAuth } from './support-auth';
import * as api from '../src/features/catalog/api/units-of-measure.api';
import { UnitsOfMeasurePage } from '../src/features/catalog/pages/UnitsOfMeasurePage';

const unit: UnitOfMeasureDto = {
  id: 'uom-1',
  code: 'TAB',
  name: 'Tableta',
  description: null,
  category: 'FARMACEUTICA',
  isActive: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'fetchUnitsOfMeasure').mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 15,
    totalPages: 0,
  });
});

describe('Unidades de medida', () => {
  it('un doble envío del formulario crea la unidad una sola vez', async () => {
    let resolve: (value: UnitOfMeasureDto) => void = () => {};
    const create = vi.spyOn(api, 'createUnitOfMeasure').mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ThemeProvider theme={appTheme}>
          <MemoryRouter>
            {withAuth(<UnitsOfMeasurePage />, Object.values(SYSTEM_PERMISSIONS))}
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Nueva Unidad/ }));
    const form = await screen.findByRole('dialog', { name: 'Nueva Unidad de Medida' });
    fireEvent.change(within(form).getByLabelText(/Código o Abreviatura/), {
      target: { value: 'tab' },
    });
    fireEvent.change(within(form).getByLabelText(/Nombre de la Unidad/), {
      target: { value: 'Tableta' },
    });
    const submit = within(form).getByRole('button', { name: 'Crear unidad' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() =>
      expect(within(form).getByRole('button', { name: 'Guardando…' })).toBeDisabled(),
    );
    fireEvent.click(within(form).getByRole('button', { name: 'Guardando…' }));
    expect(create).toHaveBeenCalledTimes(1);
    resolve(unit);
    await waitFor(() => expect(form).not.toBeInTheDocument());
  });
});

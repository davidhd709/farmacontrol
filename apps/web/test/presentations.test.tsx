import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  type ProductDto,
  type ProductPresentationDto,
} from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as presentationsApi from '../src/features/catalog/api/presentations.api';
import { ProductPresentationsDialog } from '../src/features/catalog/components/ProductPresentationsDialog';
import { appTheme } from '../src/theme/app-theme';

const mockProduct: ProductDto = {
  id: 'prod-amox',
  categoryId: 'cat-1',
  categoryName: 'Antibióticos',
  code: 'AMOX-500',
  barcode: '7701234567890',
  name: 'Amoxicilina 500mg',
  genericName: 'Amoxicilina Trihidrato',
  concentration: '500 mg',
  sanitaryRegistry: 'INVIMA 2021M-001234',
  manufacturer: 'Genfar',
  description: 'Cápsulas orales',
  requiresLotControl: true,
  prescriptionRequired: true,
  baseUnit: 'UNIDAD',
  basePrice: '1200.00',
  baseCost: '700.00',
  isActive: true,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

const mockPresentations: ProductPresentationDto[] = [
  {
    id: 'pres-1',
    productId: 'prod-amox',
    name: 'Unidad individual',
    barcode: '7701234567890',
    conversionFactor: 1,
    price: '1200.00',
    cost: '700.00',
    isDefault: false,
    isActive: true,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'pres-2',
    productId: 'prod-amox',
    name: 'Caja x 30 cápsulas',
    barcode: '7709999888877',
    conversionFactor: 30,
    price: '32000.00',
    cost: '19000.00',
    isDefault: true,
    isActive: true,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
];

function createMockAuthContext(permissions: string[] = []): AuthContextValue {
  return {
    user: {
      id: 'usr-1',
      username: 'farmaceutico',
      isActive: true,
      roles: [SYSTEM_ROLES.ADMIN],
      permissions,
    },
    status: 'authenticated',
    sessionError: null,
    isLoggingIn: false,
    isLoggingOut: false,
    login: vi.fn(),
    logout: vi.fn(),
    retrySession: vi.fn(),
  };
}

function renderPresentationsDialog(
  product: ProductDto = mockProduct,
  onClose = vi.fn(),
  authContext = createMockAuthContext([
    SYSTEM_PERMISSIONS.PRODUCTS_READ,
    SYSTEM_PERMISSIONS.PRODUCTS_MANAGE,
  ]),
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={authContext}>
          <ProductPresentationsDialog
            open={true}
            onClose={onClose}
            product={product}
          />
        </AuthContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('Gestión de Presentaciones Comerciales y Factores de Conversión (UX-07, RF-003, RF-004)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('muestra la información del producto, unidad base y la lista de presentaciones comerciales', async () => {
    vi.spyOn(presentationsApi, 'fetchProductPresentations').mockResolvedValue(
      mockPresentations,
    );

    renderPresentationsDialog();

    expect(
      screen.getByText('Presentaciones Comerciales y Equivalencias'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Amoxicilina 500mg/)).toBeInTheDocument();
    expect(screen.getByText('AMOX-500')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Unidad individual')).toBeInTheDocument();
      expect(screen.getByText('Caja x 30 cápsulas')).toBeInTheDocument();
    });

    // Validar chips de factores de conversión
    expect(screen.getByText('x 1 UNIDAD')).toBeInTheDocument();
    expect(screen.getByText('x 30 UNIDAD')).toBeInTheDocument();

    // Validar insignia de presentación principal
    expect(screen.getByText('★ Principal')).toBeInTheDocument();
  });

  it('permite registrar una nueva presentación comercial con factor de conversión entero (RN-004)', async () => {
    vi.spyOn(presentationsApi, 'fetchProductPresentations').mockResolvedValue(
      mockPresentations,
    );

    const createSpy = vi
      .spyOn(presentationsApi, 'createProductPresentation')
      .mockResolvedValue({
        id: 'pres-3',
        productId: 'prod-amox',
        name: 'Blíster x 10',
        barcode: '7705555444433',
        conversionFactor: 10,
        price: '11000.00',
        cost: '6500.00',
        isDefault: false,
        isActive: true,
        createdAt: '2026-09-02T10:00:00.000Z',
        updatedAt: '2026-09-02T10:00:00.000Z',
      });

    renderPresentationsDialog();

    await waitFor(() => {
      expect(screen.getByTestId('add-presentation-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-presentation-btn'));

    // Esperar a que abra el diálogo secundario
    expect(
      screen.getByText('Nueva Presentación Comercial'),
    ).toBeInTheDocument();

    // Llenar campos
    const nameInput = screen.getByLabelText(/Nombre de la presentación/i);
    const barcodeInput = screen.getByLabelText(/Código de barras comercial/i);
    const factorInput = screen.getByLabelText(/Factor de conversión/i);
    const priceInput = screen.getByLabelText(/Precio de venta al público/i);
    const costInput = screen.getByLabelText(/Costo de referencia/i);

    fireEvent.change(nameInput, { target: { value: 'Blíster x 10' } });
    fireEvent.change(barcodeInput, { target: { value: '7705555444433' } });
    fireEvent.change(factorInput, { target: { value: '10' } });
    fireEvent.change(priceInput, { target: { value: '11000' } });
    fireEvent.change(costInput, { target: { value: '6500' } });

    // Comprobar la vista previa matemática de equivalencia
    expect(screen.getByText(/Resumen de Equivalencia/i)).toBeInTheDocument();

    const saveBtn = screen.getByTestId('save-presentation-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith('prod-amox', {
        productId: 'prod-amox',
        name: 'Blíster x 10',
        barcode: '7705555444433',
        conversionFactor: 10,
        price: 11000,
        cost: 6500,
        isDefault: false,
      });
    });
  });

  it('valida que el factor de conversión sea mayor o igual a 1 y entero', async () => {
    vi.spyOn(presentationsApi, 'fetchProductPresentations').mockResolvedValue(
      mockPresentations,
    );

    renderPresentationsDialog();

    await waitFor(() => {
      expect(screen.getByTestId('add-presentation-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-presentation-btn'));

    const nameInput = screen.getByLabelText(/Nombre de la presentación/i);
    const factorInput = screen.getByLabelText(/Factor de conversión/i);

    fireEvent.change(nameInput, { target: { value: 'Blíster Inválido' } });
    fireEvent.change(factorInput, { target: { value: '0' } });

    const saveBtn = screen.getByTestId('save-presentation-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/El factor de conversión debe ser mayor o igual a 1/i),
      ).toBeInTheDocument();
    });
  });

  it('permite inactivar una presentación comercial secundaria', async () => {
    vi.spyOn(presentationsApi, 'fetchProductPresentations').mockResolvedValue(
      mockPresentations,
    );

    const deactivateSpy = vi
      .spyOn(presentationsApi, 'deactivateProductPresentation')
      .mockResolvedValue({
        ...mockPresentations[0],
        isActive: false,
      });

    renderPresentationsDialog();

    await waitFor(() => {
      expect(screen.getByText('Unidad individual')).toBeInTheDocument();
    });

    // pres-1 no es la principal, por lo que su botón Inactivar está habilitado
    const deactivateButtons = screen.getAllByRole('button', { name: /Inactivar/i });
    expect(deactivateButtons.length).toBeGreaterThan(0);

    fireEvent.click(deactivateButtons[0]);

    // Diálogo de Confirmación preventiva
    const confirmBtn = await screen.findByRole('button', { name: /Inactivar Presentación/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deactivateSpy).toHaveBeenCalledWith('prod-amox', 'pres-1');
    });
  });

  it('ejecuta el simulador de conversión matemática exacta (RN-004)', async () => {
    vi.spyOn(presentationsApi, 'fetchProductPresentations').mockResolvedValue(
      mockPresentations,
    );

    const convertSpy = vi
      .spyOn(presentationsApi, 'convertProductPresentationUnits')
      .mockResolvedValue({
        presentationId: 'pres-1',
        presentationName: 'Unidad individual',
        conversionFactor: 1,
        direction: 'toBase',
        inputQuantity: 5,
        result: { baseUnits: 5 },
      });

    renderPresentationsDialog();

    await waitFor(() => {
      expect(
        screen.getByText(/Calculadora de Equivalencia/i),
      ).toBeInTheDocument();
    });

    const calcBtn = screen.getByTestId('calculate-conversion-btn');
    fireEvent.click(calcBtn);

    await waitFor(() => {
      expect(convertSpy).toHaveBeenCalledWith('prod-amox', 'pres-1', {
        quantity: 1,
        direction: 'toBase',
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Resultado: 1 Unidad individual = 5 UNIDAD\(s\)/i)).toBeInTheDocument();
    });
  });

  it('oculta botones de gestión si el usuario solo tiene permiso de lectura', async () => {
    vi.spyOn(presentationsApi, 'fetchProductPresentations').mockResolvedValue(
      mockPresentations,
    );

    const readOnlyAuth = createMockAuthContext([SYSTEM_PERMISSIONS.PRODUCTS_READ]);
    renderPresentationsDialog(mockProduct, vi.fn(), readOnlyAuth);

    await waitFor(() => {
      expect(screen.getByText('Unidad individual')).toBeInTheDocument();
    });

    // No debe existir el botón de agregar presentación
    expect(screen.queryByTestId('add-presentation-btn')).not.toBeInTheDocument();

    // No deben existir botones de Editar ni Inactivar
    expect(screen.queryByRole('button', { name: /Editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Inactivar/i })).not.toBeInTheDocument();
  });
});

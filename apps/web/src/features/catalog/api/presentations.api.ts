import type {
  CreateProductPresentationPayload,
  ProductPresentationDto,
  UpdateProductPresentationPayload,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export interface ConvertUnitsResult {
  presentationId: string;
  presentationName: string;
  conversionFactor: number;
  direction: 'toBase' | 'fromBase';
  inputQuantity: number;
  result:
    | { baseUnits: number }
    | { wholePresentations: number; remainderBaseUnits: number };
}

/**
 * Obtiene todas las presentaciones comerciales de un producto.
 */
export async function fetchProductPresentations(
  productId: string,
  isActive?: boolean,
): Promise<ProductPresentationDto[]> {
  const query = new URLSearchParams();
  if (typeof isActive === 'boolean') {
    query.set('isActive', String(isActive));
  }

  const queryString = query.toString();
  const endpoint = queryString
    ? `products/${productId}/presentations?${queryString}`
    : `products/${productId}/presentations`;

  return apiRequest<ProductPresentationDto[]>(endpoint, {
    method: 'GET',
  });
}

/**
 * Obtiene una presentación comercial por su ID.
 */
export async function fetchProductPresentationById(
  productId: string,
  presentationId: string,
): Promise<ProductPresentationDto> {
  return apiRequest<ProductPresentationDto>(
    `products/${productId}/presentations/${presentationId}`,
    {
      method: 'GET',
    },
  );
}

/**
 * Registra una nueva presentación comercial para el producto.
 */
export async function createProductPresentation(
  productId: string,
  payload: CreateProductPresentationPayload,
): Promise<ProductPresentationDto> {
  return apiRequest<ProductPresentationDto>(
    `products/${productId}/presentations`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

/**
 * Actualiza los atributos de una presentación comercial existente.
 */
export async function updateProductPresentation(
  productId: string,
  presentationId: string,
  payload: UpdateProductPresentationPayload,
): Promise<ProductPresentationDto> {
  return apiRequest<ProductPresentationDto>(
    `products/${productId}/presentations/${presentationId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );
}

/**
 * Inactiva lógicamente una presentación comercial.
 */
export async function deactivateProductPresentation(
  productId: string,
  presentationId: string,
): Promise<ProductPresentationDto> {
  return apiRequest<ProductPresentationDto>(
    `products/${productId}/presentations/${presentationId}`,
    {
      method: 'DELETE',
    },
  );
}

/**
 * Ejecuta una conversión matemática exacta entre presentación comercial y unidad base (RN-004).
 */
export async function convertProductPresentationUnits(
  productId: string,
  presentationId: string,
  payload: { quantity: number; direction: 'toBase' | 'fromBase' },
): Promise<ConvertUnitsResult> {
  return apiRequest<ConvertUnitsResult>(
    `products/${productId}/presentations/${presentationId}/convert`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

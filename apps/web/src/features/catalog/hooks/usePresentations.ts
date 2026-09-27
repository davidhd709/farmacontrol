import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProductPresentationPayload,
  UpdateProductPresentationPayload,
} from '@farmacia/contracts';
import {
  convertProductPresentationUnits,
  createProductPresentation,
  deactivateProductPresentation,
  fetchProductPresentations,
  updateProductPresentation,
} from '../api/presentations.api';

export const PRESENTATIONS_QUERY_KEY = (productId: string) => [
  'products',
  productId,
  'presentations',
];

export function useProductPresentations(
  productId: string | null | undefined,
  isActive?: boolean,
) {
  return useQuery({
    queryKey: productId
      ? [...PRESENTATIONS_QUERY_KEY(productId), { isActive }]
      : ['presentations-disabled'],
    queryFn: () => fetchProductPresentations(productId!, isActive),
    enabled: Boolean(productId),
  });
}

export function useCreatePresentation(productId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateProductPresentationPayload) =>
      createProductPresentation(productId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: PRESENTATIONS_QUERY_KEY(productId),
      });
    },
  });
}

export function useUpdatePresentation(productId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      presentationId,
      payload,
    }: {
      presentationId: string;
      payload: UpdateProductPresentationPayload;
    }) => updateProductPresentation(productId, presentationId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: PRESENTATIONS_QUERY_KEY(productId),
      });
    },
  });
}

export function useDeactivatePresentation(productId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (presentationId: string) =>
      deactivateProductPresentation(productId, presentationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: PRESENTATIONS_QUERY_KEY(productId),
      });
    },
  });
}

export function useConvertPresentation(productId: string) {
  return useMutation({
    mutationFn: ({
      presentationId,
      payload,
    }: {
      presentationId: string;
      payload: { quantity: number; direction: 'toBase' | 'fromBase' };
    }) => convertProductPresentationUnits(productId, presentationId, payload),
  });
}

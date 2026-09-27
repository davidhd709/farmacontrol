import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProductPayload,
  ProductQueryFilters,
  UpdateProductPayload,
} from '@farmacia/contracts';
import {
  createProduct,
  deactivateProduct,
  fetchProductById,
  fetchProducts,
  updateProduct,
} from '../api/products.api';

export const PRODUCTS_QUERY_KEY = ['products'];

export function useProducts(filters: ProductQueryFilters = {}) {
  return useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, filters],
    queryFn: () => fetchProducts(filters),
    placeholderData: (previousData) => previousData,
  });
}

export function useProduct(id: string | null) {
  return useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'detail', id],
    queryFn: () => fetchProductById(id!),
    enabled: Boolean(id),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateProductPayload) => createProduct(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateProductPayload }) =>
      updateProduct(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

export function useDeactivateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivateProduct(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryQueryFilters, CreateCategoryPayload, UpdateCategoryPayload } from '@farmacia/contracts';
import {
  createCategory,
  deactivateCategory,
  fetchCategories,
  fetchCategoryById,
  updateCategory,
} from '../api/categories.api';

export const CATEGORIES_QUERY_KEY = ['categories'];

export function useCategories(filters: CategoryQueryFilters = {}) {
  return useQuery({
    queryKey: [...CATEGORIES_QUERY_KEY, filters],
    queryFn: () => fetchCategories(filters),
    placeholderData: (previousData) => previousData,
  });
}

export function useCategory(id: string | null) {
  return useQuery({
    queryKey: [...CATEGORIES_QUERY_KEY, 'detail', id],
    queryFn: () => fetchCategoryById(id!),
    enabled: Boolean(id),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateCategoryPayload) => createCategory(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCategoryPayload }) =>
      updateCategory(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });
}

export function useDeactivateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivateCategory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });
}

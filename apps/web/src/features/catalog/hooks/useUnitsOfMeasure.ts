import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  UnitOfMeasureQueryFilters,
  CreateUnitOfMeasurePayload,
  UpdateUnitOfMeasurePayload,
} from '@farmacia/contracts';
import {
  createUnitOfMeasure,
  deactivateUnitOfMeasure,
  fetchUnitsOfMeasure,
  fetchUnitOfMeasureById,
  updateUnitOfMeasure,
} from '../api/units-of-measure.api';

export const UNITS_OF_MEASURE_QUERY_KEY = ['units-of-measure'];

export function useUnitsOfMeasure(filters: UnitOfMeasureQueryFilters = {}) {
  return useQuery({
    queryKey: [...UNITS_OF_MEASURE_QUERY_KEY, filters],
    queryFn: () => fetchUnitsOfMeasure(filters),
    placeholderData: (previousData) => previousData,
  });
}

export function useUnitOfMeasure(id: string | null) {
  return useQuery({
    queryKey: [...UNITS_OF_MEASURE_QUERY_KEY, 'detail', id],
    queryFn: () => fetchUnitOfMeasureById(id!),
    enabled: Boolean(id),
  });
}

export function useCreateUnitOfMeasure() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateUnitOfMeasurePayload) => createUnitOfMeasure(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: UNITS_OF_MEASURE_QUERY_KEY });
    },
  });
}

export function useUpdateUnitOfMeasure() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUnitOfMeasurePayload }) =>
      updateUnitOfMeasure(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: UNITS_OF_MEASURE_QUERY_KEY });
    },
  });
}

export function useDeactivateUnitOfMeasure() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivateUnitOfMeasure(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: UNITS_OF_MEASURE_QUERY_KEY });
    },
  });
}

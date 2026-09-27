'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CalculationDto, CalculationInput, CalculationSummaryDto } from '@/shared/calculations';
import { api, apiRequest } from '../api-client';
import { queryKeys } from './keys';

export interface CalculationListParams {
  from?: string;
  to?: string;
  status?: 'draft' | 'finalized' | 'cancelled';
  itemId?: number;
  page?: number;
  pageSize?: number;
}

export function useCalculations(params: CalculationListParams) {
  return useQuery({
    queryKey: queryKeys.calculations.list({ ...params }),
    queryFn: ({ signal }) => apiRequest<CalculationSummaryDto[]>('/calculations', { query: { ...params }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useCalculation(id: number | null) {
  return useQuery({
    queryKey: queryKeys.calculations.detail(id ?? 0),
    queryFn: ({ signal }) => api.get<CalculationDto>(`/calculations/${id}`, { signal }),
    enabled: id !== null,
  });
}

function useAfterCalculationChange() {
  const qc = useQueryClient();
  return (calc?: CalculationDto) => {
    if (calc) qc.setQueryData(queryKeys.calculations.detail(calc.id), calc);
    return Promise.all([
      qc.invalidateQueries({ queryKey: ['calculations', 'list'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
  };
}

export function useSaveCalculation() {
  const after = useAfterCalculationChange();
  return useMutation({
    mutationFn: ({
      id,
      version,
      input,
      idempotencyKey,
    }: {
      id?: number;
      version?: number;
      input: CalculationInput;
      idempotencyKey?: string;
    }) =>
      id
        ? api.put<CalculationDto>(`/calculations/${id}`, { ...input, version })
        : api.post<CalculationDto>('/calculations', input, { idempotencyKey }),
    onSuccess: (calc) => after(calc),
  });
}

export function useFinalizeCalculation() {
  const after = useAfterCalculationChange();
  return useMutation({
    mutationFn: ({ id, version }: { id: number; version: number }) =>
      api.post<CalculationDto>(`/calculations/${id}/finalize`, { version }),
    onSuccess: (calc) => after(calc),
  });
}

export function useCancelCalculation() {
  const after = useAfterCalculationChange();
  return useMutation({
    mutationFn: ({ id, version, reason }: { id: number; version: number; reason: string }) =>
      api.post<CalculationDto>(`/calculations/${id}/cancel`, { version, reason }),
    onSuccess: (calc) => after(calc),
  });
}

export function useDeleteDraft() {
  const after = useAfterCalculationChange();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ id: number }>(`/calculations/${id}`),
    onSuccess: ({ id }) => {
      qc.removeQueries({ queryKey: queryKeys.calculations.detail(id) });
      return after();
    },
  });
}

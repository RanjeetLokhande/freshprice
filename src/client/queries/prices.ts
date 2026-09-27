'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BulkPricesInput, BulkPricesResult, DailyPrices, PriceHistoryRow } from '@/shared/prices';
import { api, apiRequest } from '../api-client';
import { queryKeys } from './keys';

export function useDailyPrices(date: string) {
  return useQuery({
    queryKey: queryKeys.prices.byDate(date),
    // Switching dates quickly aborts the older request, so stale data can't land on the new date
    queryFn: ({ signal }) => api.get<DailyPrices>('/prices', { query: { date }, signal }),
    staleTime: 30_000,
  });
}

export function useSaveBulkPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkPricesInput) => api.post<BulkPricesResult>('/prices/bulk', input),
    onSuccess: (_data, input) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.prices.byDate(input.date) }),
        qc.invalidateQueries({ queryKey: ['prices', 'history'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]),
  });
}

export interface PriceHistoryParams {
  itemId?: number;
  categoryId?: number;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function usePriceHistory(params: PriceHistoryParams) {
  return useQuery({
    queryKey: queryKeys.prices.history({ ...params }),
    queryFn: ({ signal }) => apiRequest<PriceHistoryRow[]>('/prices/history', { query: { ...params }, signal }),
    placeholderData: keepPreviousData,
  });
}

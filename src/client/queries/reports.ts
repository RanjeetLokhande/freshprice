'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DailyTotalRow, DashboardStats, ItemSummaryRow, ReportResult } from '@/shared/reports';
import { api } from '../api-client';
import { queryKeys } from './keys';

export function useDashboard(date: string | undefined) {
  return useQuery({
    queryKey: queryKeys.dashboard(date ?? ''),
    queryFn: ({ signal }) => api.get<DashboardStats>('/dashboard', { query: { date }, signal }),
    enabled: Boolean(date),
    staleTime: 30_000,
  });
}

export function useItemSummary(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'items', from, to],
    queryFn: ({ signal }) => api.get<ReportResult<ItemSummaryRow>>('/reports/items', { query: { from, to }, signal }),
    enabled: enabled && from <= to,
    placeholderData: keepPreviousData,
  });
}

export function useDailyTotals(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'daily-totals', from, to],
    queryFn: ({ signal }) => api.get<ReportResult<DailyTotalRow>>('/reports/daily-totals', { query: { from, to }, signal }),
    enabled: enabled && from <= to,
    placeholderData: keepPreviousData,
  });
}

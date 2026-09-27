'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MasterRow } from '@/shared/masters';
import type { SettingDto } from '@/shared/settings-rules';
import type { BatchRowResult } from '@/shared/api';
import { api, apiRequest } from '../api-client';
import { queryKeys } from './keys';

export interface MasterListParams {
  q?: string;
  active?: 'true' | 'false' | 'all';
  page?: number;
  pageSize?: number;
  sort?: string;
}

export function useMasterList(entity: string, params: MasterListParams) {
  return useQuery({
    queryKey: queryKeys.masters.list(entity, { ...params }),
    // signal: typing a new search aborts the previous request
    queryFn: ({ signal }) => apiRequest<MasterRow[]>(`/masters/${entity}`, { query: { ...params }, signal }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/** Any master change can affect lookups/forms everywhere, so bootstrap is refreshed too. */
function useInvalidateMaster(entity: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['masters', entity] }),
      qc.invalidateQueries({ queryKey: queryKeys.bootstrap }),
    ]);
}

export function useSaveMaster(entity: string) {
  const invalidate = useInvalidateMaster(entity);
  return useMutation({
    mutationFn: ({ id, values }: { id?: number; values: Record<string, unknown> }) =>
      id ? api.put<MasterRow>(`/masters/${entity}/${id}`, values) : api.post<MasterRow>(`/masters/${entity}`, values),
    onSuccess: invalidate,
  });
}

export function useDeleteMaster(entity: string) {
  const invalidate = useInvalidateMaster(entity);
  return useMutation({
    mutationFn: (id: number) => api.delete<{ id: number; deleted: 'soft' | 'hard' }>(`/masters/${entity}/${id}`),
    onSuccess: invalidate,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: ({ signal }) => api.get<SettingDto[]>('/settings', { signal }),
  });
}

export interface SaveSettingsResult {
  results: (BatchRowResult<'updated' | 'unchanged'> & { key: string })[];
  summary: { updated: number; unchanged: number; failed: number };
  settings: SettingDto[];
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (changes: { key: string; value: unknown; version: number }[]) =>
      api.put<SaveSettingsResult>('/settings', { changes }),
    onSuccess: (data) => {
      qc.setQueryData(['settings'], data.settings);
      return qc.invalidateQueries({ queryKey: queryKeys.bootstrap });
    },
  });
}

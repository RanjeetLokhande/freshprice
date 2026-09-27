'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuditEntryDto, RoleDto, UserDto } from '@/shared/admin';
import { api, apiRequest } from '../api-client';
import { queryKeys } from './keys';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: ({ signal }) => api.get<{ users: UserDto[]; roles: RoleDto[] }>('/users', { signal }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...body }: { userId: string; roles: string[]; active: boolean; version: number }) =>
      api.put<UserDto>(`/users/${userId}`, body),
    // Your own permissions may have changed too
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: ['users'] }), qc.invalidateQueries({ queryKey: queryKeys.bootstrap })]),
  });
}

export function useAudit(params: { entity?: string; page: number }) {
  return useQuery({
    queryKey: ['audit', params],
    queryFn: ({ signal }) => apiRequest<AuditEntryDto[]>('/audit', { query: { ...params, pageSize: 30 }, signal }),
    placeholderData: keepPreviousData,
  });
}

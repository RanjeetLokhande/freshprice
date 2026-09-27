'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { indexUnits, type UnitIndex } from '@/domain/units';
import type { BootstrapData } from '@/shared/bootstrap';
import { api } from '../api-client';
import { queryKeys } from './keys';

/**
 * Masters + settings + permissions. Long staleTime; the server's ETag makes
 * revalidation a cheap 304 (handled by the browser HTTP cache).
 * Invalidate queryKeys.bootstrap after any master mutation.
 */
export function useBootstrap() {
  return useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: ({ signal }) => api.get<BootstrapData>('/bootstrap', { signal }),
    staleTime: 30 * 60_000,
  });
}

/** Derived lookups, memoized per bootstrap version. */
export function useMasters() {
  const query = useBootstrap();
  const data = query.data;

  const derived = useMemo(() => {
    if (!data) return null;
    const unitIndex: UnitIndex = indexUnits(data.units);
    return {
      unitIndex,
      unitById: new Map(data.units.map((u) => [u.id, u])),
      itemById: new Map(data.items.map((i) => [i.id, i])),
      categoryById: new Map(data.categories.map((c) => [c.id, c])),
      can: (permission: string) => data.permissions.includes(permission),
    };
  }, [data]);

  return { ...query, derived };
}

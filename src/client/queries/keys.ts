// Query-key factory: every cache key is built here so invalidation stays exact.
export const queryKeys = {
  bootstrap: ['bootstrap'] as const,
  masters: {
    all: ['masters'] as const,
    list: (entity: string, params: Record<string, unknown> = {}) => ['masters', entity, 'list', params] as const,
    detail: (entity: string, id: number) => ['masters', entity, 'detail', id] as const,
  },
  prices: {
    all: ['prices'] as const,
    byDate: (date: string) => ['prices', 'date', date] as const,
    history: (params: Record<string, unknown>) => ['prices', 'history', params] as const,
  },
  calculations: {
    all: ['calculations'] as const,
    list: (params: Record<string, unknown>) => ['calculations', 'list', params] as const,
    detail: (id: number) => ['calculations', 'detail', id] as const,
  },
  dashboard: (date: string) => ['dashboard', date] as const,
};

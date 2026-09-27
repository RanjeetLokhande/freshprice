'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/toast';
import { ApiClientError } from './api-client';

function redirectToLoginOn401(error: unknown) {
  if (error instanceof ApiClientError && error.code === 'UNAUTHENTICATED' && typeof window !== 'undefined') {
    const next = encodeURIComponent(window.location.pathname);
    window.location.assign(`/login?next=${next}`);
  }
}

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: redirectToLoginOn401 }),
    mutationCache: new MutationCache({ onError: redirectToLoginOn401 }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: true,
        // GETs only: 2 retries with backoff, never for 4xx or cancelled requests
        retry: (failureCount, error) => {
          if (error instanceof ApiClientError && (error.isClientError || error.code === 'ABORTED')) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        // Saves are never retried automatically; idempotency keys make manual retry safe.
        retry: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

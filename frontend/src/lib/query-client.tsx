'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * A single shared cache for reads that were previously re-fetched
 * independently by every page/component that needed them (getTasks,
 * getUsers, getRooms) — this is what actually deduplicates those requests.
 * staleTime of 30s means a component mounting shortly after another already
 * fetched the same query reads the cache instead of firing a new request;
 * realtime updates still patch the cache directly (see useTaskRealtimeSync),
 * they don't wait out the staleTime.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

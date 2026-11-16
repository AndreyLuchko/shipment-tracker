import { QueryClient } from '@tanstack/react-query';

/** The one place the query defaults are set: no retries, always stale (refetch on mount and on focus). */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
}

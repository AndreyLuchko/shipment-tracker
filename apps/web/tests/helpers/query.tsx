import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { createQueryClient } from '@/lib/query-client';

/** A fresh client from `createQueryClient()` and a wrapper for `renderHook(…, { wrapper })`. */
export function createQueryWrapper(): {
  queryClient: QueryClient;
  wrapper: (props: { children: ReactNode }) => ReactElement;
} {
  const queryClient = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

/** `render` inside that wrapper; the result also carries the client. */
export function renderWithQuery(ui: ReactElement): RenderResult & { queryClient: QueryClient } {
  const { queryClient, wrapper } = createQueryWrapper();
  return Object.assign(render(ui, { wrapper }), { queryClient });
}

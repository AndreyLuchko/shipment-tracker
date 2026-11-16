'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { createQueryClient } from '@/lib/query-client';

/** Owns one `QueryClient` for as long as it stays mounted — rendered inside `AuthGuard`, that is one session. */
export function QueryProvider({ children }: { children: ReactNode }): ReactNode {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

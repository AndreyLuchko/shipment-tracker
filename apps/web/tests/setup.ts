import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { waitBeforeRetry } from '@/lib/api/retry-delay';
import { useAuthStore } from '@/stores/auth';

import { clearCookies } from './helpers/fetch';
import { redirectMock, routerMock } from './helpers/router';

// `vi.mock` is hoisted above the imports, so the factory loads the helper lazily.
vi.mock('next/navigation', async () => {
  const router = await import('./helpers/router');
  const { useMemo, useSyncExternalStore } = await import('react');
  return {
    useRouter: () => router.routerMock,
    redirect: router.redirectMock,
    useSearchParams: () => {
      const search = useSyncExternalStore(
        router.subscribeToLocation,
        () => window.location.search,
        () => '',
      );
      return useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

// The one retry of a safe request pauses 5 s in production; tests do not wait for it.
vi.mock('@/lib/api/retry-delay', () => ({
  UNAVAILABLE_RETRY_DELAY_MS: 5_000,
  waitBeforeRetry: vi.fn(() => Promise.resolve()),
}));

// Vitest `globals` is off, so React Testing Library's automatic cleanup does not run.
afterEach(() => {
  cleanup();
  vi.mocked(waitBeforeRetry).mockClear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  routerMock.replace.mockReset();
  routerMock.push.mockReset();
  routerMock.refresh.mockReset();
  redirectMock.mockReset();
  clearCookies();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  if (typeof window !== 'undefined') window.history.replaceState(null, '', '/');
});

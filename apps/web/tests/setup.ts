import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth';

import { clearCookies } from './helpers/fetch';
import { redirectMock, routerMock } from './helpers/router';

// `vi.mock` is hoisted above the imports, so the factory loads the helper lazily.
vi.mock('next/navigation', async () => {
  const router = await import('./helpers/router');
  return { useRouter: () => router.routerMock, redirect: router.redirectMock };
});

// Vitest `globals` is off, so React Testing Library's automatic cleanup does not run.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  routerMock.replace.mockReset();
  routerMock.push.mockReset();
  routerMock.refresh.mockReset();
  redirectMock.mockReset();
  clearCookies();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});

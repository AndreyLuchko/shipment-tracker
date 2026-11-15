import { vi } from 'vitest';

/** What `useRouter()` of `next/navigation` returns in every test file. */
export const routerMock = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() };

/** What `redirect()` of `next/navigation` is in every test file. */
export const redirectMock = vi.fn();

import { vi } from 'vitest';

const listeners = new Set<() => void>();

/** For the `next/navigation` mock: re-render on every `navigate()`. */
export function subscribeToLocation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Moves jsdom's location the way the App Router would and re-renders every `useSearchParams()`. */
export function navigate(href: string): void {
  window.history.replaceState(null, '', href);
  listeners.forEach((listener) => listener());
}

/** What `useRouter()` of `next/navigation` returns in every test file. */
export const routerMock = { replace: vi.fn(navigate), push: vi.fn(navigate), refresh: vi.fn() };

/** What `redirect()` of `next/navigation` is in every test file. */
export const redirectMock = vi.fn();

import { act } from '@testing-library/react';
import { vi } from 'vitest';

/** Fakes only the timeouts, so promises and `fetch` mocks keep running. `afterEach` in setup.ts restores real timers. */
export function fakeTimeouts(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
}

/** "At +N ms": moves the fake clock forward and lets React and pending promises settle. */
export async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

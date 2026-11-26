import { describe, expect, it, vi } from 'vitest';

vi.unmock('@/lib/api/retry-delay');

describe('waitBeforeRetry', () => {
  it('resolves after UNAVAILABLE_RETRY_DELAY_MS', async () => {
    const { UNAVAILABLE_RETRY_DELAY_MS, waitBeforeRetry } =
      await vi.importActual<typeof import('@/lib/api/retry-delay')>('@/lib/api/retry-delay');
    vi.useFakeTimers();
    const settled = vi.fn();

    void waitBeforeRetry().then(settled);
    await vi.advanceTimersByTimeAsync(UNAVAILABLE_RETRY_DELAY_MS - 1);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(UNAVAILABLE_RETRY_DELAY_MS).toBe(5_000);
  });
});

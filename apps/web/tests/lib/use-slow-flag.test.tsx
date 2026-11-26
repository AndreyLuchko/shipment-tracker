import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SLOW_REQUEST_NOTICE_MS, useSlowFlag } from '@/lib/use-slow-flag';

import { advance, fakeTimeouts } from '../helpers/timers';

describe('useSlowFlag', () => {
  it('is false until active has lasted the delay, then true', async () => {
    fakeTimeouts();
    const { result } = renderHook(() => useSlowFlag(true));

    expect(SLOW_REQUEST_NOTICE_MS).toBe(3_000);
    expect(result.current).toBe(false);
    await advance(2_999);
    expect(result.current).toBe(false);
    await advance(1);
    expect(result.current).toBe(true);
  });

  it('is false at once when active turns false, and waits the full delay again', async () => {
    fakeTimeouts();
    const { result, rerender } = renderHook(({ active }) => useSlowFlag(active), { initialProps: { active: true } });
    await advance(3_000);
    expect(result.current).toBe(true);

    rerender({ active: false });
    expect(result.current).toBe(false);

    rerender({ active: true });
    expect(result.current).toBe(false);
    await advance(2_999);
    expect(result.current).toBe(false);
    await advance(1);
    expect(result.current).toBe(true);
  });

  it('never turns on when active is false', async () => {
    fakeTimeouts();
    const { result } = renderHook(() => useSlowFlag(false));

    await advance(10_000);
    expect(result.current).toBe(false);
  });
});

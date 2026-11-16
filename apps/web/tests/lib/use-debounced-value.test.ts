import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from '@/lib/use-debounced-value';

function setup() {
  return renderHook(({ value }) => useDebouncedValue(value, 300), { initialProps: { value: 'a' } });
}

describe('useDebouncedValue', () => {
  it('returns the first value at once', () => {
    vi.useFakeTimers();
    const { result } = setup();
    expect(result.current).toBe('a');
  });

  it('updates only after the value has stayed the same for the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = setup();

    rerender({ value: 'ab' });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe('a');

    rerender({ value: 'abc' });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('abc');
  });

  it('clears its timer on unmount', () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, 'error');
    const { rerender, unmount } = setup();

    rerender({ value: 'x' });
    unmount();
    expect(() => act(() => vi.advanceTimersByTime(300))).not.toThrow();
    expect(consoleError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    consoleError.mockRestore();
  });
});

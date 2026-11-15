import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/cn';

describe('cn', () => {
  it('joins class names with one space', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy entries', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('returns an empty string without arguments', () => {
    expect(cn()).toBe('');
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createQueryClient } from '@/lib/query-client';

describe('createQueryClient', () => {
  it('sets no retries and zero stale time for queries, no retries for mutations', () => {
    const options = createQueryClient().getDefaultOptions();

    expect(options.queries).toEqual({ retry: false, staleTime: 0 });
    expect(options.mutations).toEqual({ retry: false });
  });

  it('returns a new client on every call', () => {
    expect(createQueryClient()).not.toBe(createQueryClient());
  });
});

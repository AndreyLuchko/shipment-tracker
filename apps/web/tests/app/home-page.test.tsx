import { describe, expect, it } from 'vitest';

import HomePage from '@/app/page';

import { redirectMock } from '../helpers/router';

describe('HomePage', () => {
  it('redirects to /shipments', () => {
    HomePage();

    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith('/shipments');
  });
});

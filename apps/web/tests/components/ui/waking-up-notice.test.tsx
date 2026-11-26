import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WakingUpNotice } from '@/components/ui/waking-up-notice';

import { advance, fakeTimeouts } from '../../helpers/timers';

const NOTICE = 'Waking up the demo server. The first request after a quiet spell can take up to a minute.';

describe('WakingUpNotice', () => {
  it('shows the notice once active has lasted 3 s, and not earlier', async () => {
    fakeTimeouts();
    render(<WakingUpNotice active />);

    await advance(2_999);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await advance(1);
    expect(screen.getByRole('status')).toHaveTextContent(NOTICE);
  });

  it('shows nothing while inactive', async () => {
    fakeTimeouts();
    render(<WakingUpNotice active={false} />);

    await advance(10_000);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

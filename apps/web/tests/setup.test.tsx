import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { redirect, useRouter } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';

import { redirectMock, routerMock } from './helpers/router';

function Probe() {
  const router = useRouter();
  return <button onClick={() => router.replace('/somewhere')}>go</button>;
}

async function renderAndClick() {
  const user = userEvent.setup();
  render(<Probe />);
  await user.click(screen.getByRole('button', { name: 'go' }));
}

describe('test setup', () => {
  it('mocks useRouter() with routerMock', async () => {
    await renderAndClick();
    expect(routerMock.replace).toHaveBeenCalledWith('/somewhere');
  });

  it('cleans up the DOM and resets the router mock between tests', async () => {
    await renderAndClick();
    expect(routerMock.replace).toHaveBeenCalledTimes(1);
  });

  it('mocks redirect() with redirectMock', () => {
    expect(() => redirect('/x')).not.toThrow();
    expect(redirectMock).toHaveBeenCalledWith('/x');
  });

  it('lets a test stub a global', () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(vi.isMockFunction(fetch)).toBe(true);
  });

  it('does not leak a stubbed global into the next test', () => {
    expect(vi.isMockFunction(fetch)).toBe(false);
  });
});

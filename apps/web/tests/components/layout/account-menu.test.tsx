import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AccountMenu } from '@/components/layout/account-menu';
import { useAuthStore } from '@/stores/auth';

import { emptyResponse, mockFetch, setCookie, textResponse } from '../../helpers/fetch';
import { DISPATCHER } from '../../helpers/fixtures';

const signIn = () => useAuthStore.setState({ status: 'authenticated', user: DISPATCHER });
const trigger = () => screen.getByRole('button', { name: 'Account menu' });

async function openMenu() {
  const user = userEvent.setup();
  await user.click(trigger());
  return user;
}

describe('AccountMenu', () => {
  it('renders nothing without a user', () => {
    mockFetch();

    const { container } = render(<AccountMenu />);

    expect(container).toBeEmptyDOMElement();
  });

  it('opens with the name, the role, the theme switcher and Log out', async () => {
    signIn();
    mockFetch();
    render(<AccountMenu />);

    await openMenu();

    const dialog = await screen.findByRole('dialog', { name: 'Account' });
    expect(dialog).toHaveTextContent('Demo Dispatcher');
    expect(dialog).toHaveTextContent('Dispatcher');
    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    signIn();
    mockFetch();
    render(<AccountMenu />);
    const user = await openMenu();
    await screen.findByRole('dialog', { name: 'Account' });

    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Account' })).not.toBeInTheDocument());
    expect(trigger()).toHaveFocus();
  });

  it('opens from the keyboard with Enter and Space', async () => {
    signIn();
    mockFetch();
    render(<AccountMenu />);
    const user = userEvent.setup();

    await user.tab();
    expect(trigger()).toHaveFocus();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: 'Account' });
    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Account' })).not.toBeInTheDocument());

    await user.keyboard(' ');
    expect(await screen.findByRole('dialog', { name: 'Account' })).toBeInTheDocument();
  });

  it('turns the chevron when the menu opens', async () => {
    signIn();
    mockFetch();
    render(<AccountMenu />);

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveAttribute('data-state', 'closed');
    const chevron = trigger().querySelectorAll('svg')[1];
    expect(chevron).toHaveClass('transition-transform', 'group-data-[state=open]:rotate-180');
    expect(chevron).toHaveAttribute('aria-hidden', 'true');

    await openMenu();

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('data-state', 'open');
  });

  it('closes when the viewport grows to the sm breakpoint', async () => {
    signIn();
    mockFetch();
    let onChange: ((event: { matches: boolean }) => void) | undefined;
    const removeEventListener = vi.fn();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: (_type: string, listener: typeof onChange) => (onChange = listener),
        removeEventListener,
      })),
    );
    const { unmount } = render(<AccountMenu />);
    await openMenu();
    await screen.findByRole('dialog', { name: 'Account' });

    act(() => onChange?.({ matches: true }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Account' })).not.toBeInTheDocument());
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', onChange);
  });

  it('logs out through the API', async () => {
    signIn();
    setCookie('csrf_token', 'tok_-1');
    const { calls } = mockFetch(emptyResponse());
    render(<AccountMenu />);
    const user = await openMenu();

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('/api/v1/auth/logout');
    expect(calls[0]?.headers.get('x-csrf-token')).toBe('tok_-1');
    expect(calls[0]?.headers.get('content-type')).toBeNull();
  });

  it('shows the logout error inside the menu', async () => {
    signIn();
    mockFetch(textResponse(500, 'Internal Server Error'));
    render(<AccountMenu />);
    const user = await openMenu();

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Service is unavailable. Please try again.');
    expect(screen.getByRole('dialog', { name: 'Account' })).toContainElement(alert);
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'next-themes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeSwitcher } from '@/components/ui/theme-switcher';

function stubMatchMedia(prefersDark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: prefersDark && query === '(prefers-color-scheme: dark)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
}

const renderSwitcher = () =>
  render(
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      <ThemeSwitcher />
    </ThemeProvider>,
  );

const button = (name: string) => screen.getByRole('button', { name });
const theme = () => document.documentElement.getAttribute('data-theme');

describe('ThemeSwitcher', () => {
  beforeEach(() => stubMatchMedia(false));

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  it('is a group named Theme with System, Light and Dark buttons, System pressed', () => {
    renderSwitcher();

    const group = screen.getByRole('group', { name: 'Theme' });
    const buttons = screen.getAllByRole('button');
    expect(group).toContainElement(buttons[0] as HTMLElement);
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['System theme', 'Light theme', 'Dark theme']);
    expect(buttons.map((b) => b.getAttribute('title'))).toEqual(['System theme', 'Light theme', 'Dark theme']);
    expect(buttons.every((b) => b.getAttribute('type') === 'button')).toBe(true);
    expect(button('System theme')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Light theme')).toHaveAttribute('aria-pressed', 'false');
    expect(button('Dark theme')).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches to dark and stores the choice', async () => {
    renderSwitcher();

    await userEvent.setup().click(button('Dark theme'));

    expect(button('Dark theme')).toHaveAttribute('aria-pressed', 'true');
    expect(button('System theme')).toHaveAttribute('aria-pressed', 'false');
    expect(button('Light theme')).toHaveAttribute('aria-pressed', 'false');
    expect(theme()).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('switches to light and stores the choice', async () => {
    renderSwitcher();

    await userEvent.setup().click(button('Light theme'));

    expect(button('Light theme')).toHaveAttribute('aria-pressed', 'true');
    expect(theme()).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('follows the OS again on System', async () => {
    stubMatchMedia(true);
    renderSwitcher();
    const user = userEvent.setup();

    await user.click(button('Light theme'));
    expect(theme()).toBe('light');
    await user.click(button('System theme'));

    expect(theme()).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('system');
  });

  it('presses the stored choice after mount', () => {
    localStorage.setItem('theme', 'dark');

    renderSwitcher();

    expect(button('Dark theme')).toHaveAttribute('aria-pressed', 'true');
    expect(button('System theme')).toHaveAttribute('aria-pressed', 'false');
  });
});

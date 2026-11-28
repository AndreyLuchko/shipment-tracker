'use client';

import { DesktopIcon, MoonIcon, SunIcon } from '@radix-ui/react-icons';
import { useTheme } from 'next-themes';
import { type ReactNode, useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

type ThemeChoice = 'system' | 'light' | 'dark';

const ICON_CLASS = 'h-4 w-4';

const OPTIONS: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  { value: 'system', label: 'System theme', icon: <DesktopIcon aria-hidden className={ICON_CLASS} /> },
  { value: 'light', label: 'Light theme', icon: <SunIcon aria-hidden className={ICON_CLASS} /> },
  { value: 'dark', label: 'Dark theme', icon: <MoonIcon aria-hidden className={ICON_CLASS} /> },
];

/** System / Light / Dark. The choice lives in `next-themes`, which sets `data-theme` on <html>. */
export function ThemeSwitcher(): ReactNode {
  const { theme, setTheme } = useTheme();
  // The stored choice is unknown on the server, so nothing is pressed until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div role="group" aria-label="Theme" className="inline-flex rounded-md border border-line bg-surface p-0.5">
      {OPTIONS.map(({ value, label, icon }) => {
        const pressed = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={pressed}
            onClick={() => setTheme(value)}
            className={cn(
              'rounded p-1.5 hover:text-ink',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              pressed ? 'bg-surface-muted text-ink' : 'text-ink-muted',
            )}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}

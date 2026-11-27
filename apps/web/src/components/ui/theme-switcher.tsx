'use client';

import { useTheme } from 'next-themes';
import { type ReactNode, useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

type ThemeChoice = 'system' | 'light' | 'dark';

const ICON_PROPS = {
  'aria-hidden': true,
  className: 'h-4 w-4',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
} as const;

const OPTIONS: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  {
    value: 'system',
    label: 'System theme',
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
  {
    value: 'light',
    label: 'Light theme',
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Dark theme',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    ),
  },
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

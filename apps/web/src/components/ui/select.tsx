'use client';

import { CheckIcon, ChevronDownIcon } from '@radix-ui/react-icons';
import { Select as RadixSelect } from 'radix-ui';
import { type ReactNode, useId } from 'react';

import { cn } from '@/lib/cn';

type SelectProps = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  items: { value: string; label: string }[];
};

/** A visible label and a Radix select styled with the theme tokens: `SelectField` for custom, accessible popups. */
export function Select({ label, value, onValueChange, items }: SelectProps): ReactNode {
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-muted">
        {label}
      </label>
      <RadixSelect.Root value={value} onValueChange={onValueChange}>
        <RadixSelect.Trigger
          id={id}
          className={cn(
            'mt-1 flex w-full items-center justify-between gap-2 rounded-lg border border-line-strong bg-surface',
            'px-3 py-2 text-sm text-ink',
            'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
          )}
        >
          <RadixSelect.Value />
          <RadixSelect.Icon>
            <ChevronDownIcon aria-hidden className="h-4 w-4 text-ink-muted" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={8}
            className={cn(
              'z-50 min-w-[var(--radix-select-trigger-width)] rounded-xl border border-line bg-surface p-1',
              'text-ink shadow',
            )}
          >
            <RadixSelect.Viewport>
              {items.map((item) => (
                <RadixSelect.Item
                  key={item.value}
                  value={item.value}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm outline-none',
                    'data-[highlighted]:bg-surface-muted',
                  )}
                >
                  <RadixSelect.ItemText>{item.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator>
                    <CheckIcon aria-hidden className="h-4 w-4" />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
}

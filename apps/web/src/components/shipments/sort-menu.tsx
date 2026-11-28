'use client';

import { CaretSortIcon, CheckIcon } from '@radix-ui/react-icons';
import { type ListShipmentsQuery, SHIPMENT_SORTS, shipmentSortSchema } from '@shipment-tracker/shared';
import { DropdownMenu } from 'radix-ui';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { buildListHref, withListChange } from '@/lib/shipments/list-params';
import { SORT_LABELS } from '@/lib/shipments/sort';

export const SORT_ITEMS = SHIPMENT_SORTS.map((sort) => ({ value: sort, label: SORT_LABELS[sort] }));

/** A handler that writes the chosen sort to the URL, keeping the other filters and dropping the page. */
export function useSortChange(query: ListShipmentsQuery): (value: string) => void {
  const router = useRouter();
  return (value) => {
    const parsed = shipmentSortSchema.safeParse(value);
    if (!parsed.success) return;
    router.push(buildListHref(withListChange(query, { sort: parsed.data })));
  };
}

/** The sort as an icon button with a radio menu; writes the choice to the URL. */
export function SortMenu({ query }: { query: ListShipmentsQuery }): ReactNode {
  const onValueChange = useSortChange(query);
  const name = `Sort: ${SORT_LABELS[query.sort]}`;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={name}
        title={name}
        className={cn(
          'inline-flex items-center rounded-lg border border-line-strong bg-surface p-2.5',
          'text-ink-muted hover:text-ink',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        )}
      >
        <CaretSortIcon aria-hidden className="h-4 w-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-48 rounded-xl border border-line bg-surface p-1 text-ink shadow"
        >
          <DropdownMenu.RadioGroup value={query.sort} onValueChange={onValueChange}>
            {SORT_ITEMS.map(({ value, label }) => (
              <DropdownMenu.RadioItem
                key={value}
                value={value}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm outline-none',
                  'data-[highlighted]:bg-surface-muted',
                )}
              >
                {label}
                <DropdownMenu.ItemIndicator>
                  <CheckIcon aria-hidden className="h-4 w-4" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

'use client';

import { MixerHorizontalIcon } from '@radix-ui/react-icons';
import { DEFAULT_SHIPMENT_SORT, type ListShipmentsQuery } from '@shipment-tracker/shared';
import { Popover } from 'radix-ui';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { SORT_ITEMS, useSortChange } from '@/components/shipments/sort-menu';
import { StatusSelect } from '@/components/shipments/status-select';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { buildListHref, withListChange } from '@/lib/shipments/list-params';

/** How many of the status filter and a non-default sort are on. */
export function activeFilterCount(query: ListShipmentsQuery): number {
  return (query.status ? 1 : 0) + (query.sort !== DEFAULT_SHIPMENT_SORT ? 1 : 0);
}

/** On phones: one button that opens the status filter, the sort and "Clear filters". */
export function FiltersPopover({ query }: { query: ListShipmentsQuery }): ReactNode {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(query);

  const onSortChange = useSortChange(query);

  const clear = () => {
    router.push(buildListHref(withListChange(query, { status: undefined, sort: DEFAULT_SHIPMENT_SORT })));
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={count === 0 ? 'Filters and sort' : `Filters and sort, ${count} active`}
        className={cn(
          'relative inline-flex items-center rounded-lg border border-line-strong bg-surface p-2.5',
          'text-ink-muted hover:text-ink',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        )}
      >
        <MixerHorizontalIcon aria-hidden className="h-4 w-4" />
        {count > 0 && (
          <span
            data-testid="filters-badge"
            aria-hidden
            className={cn(
              'absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1',
              'text-[10px] font-semibold text-white',
            )}
          >
            {count}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label="Filters and sort"
          align="end"
          sideOffset={8}
          className="z-50 flex w-64 flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-ink shadow"
        >
          <StatusSelect query={query} />
          <Select label="Sort" value={query.sort} onValueChange={onSortChange} items={SORT_ITEMS} />
          <Button variant="secondary" onClick={clear}>
            Clear filters
          </Button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

'use client';

import { Cross2Icon, MagnifyingGlassIcon } from '@radix-ui/react-icons';
import type { ListShipmentsQuery } from '@shipment-tracker/shared';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { FiltersPopover } from '@/components/shipments/filters-popover';
import { SortMenu } from '@/components/shipments/sort-menu';
import { StatusSelect } from '@/components/shipments/status-select';
import { TextField } from '@/components/ui/text-field';
import { cn } from '@/lib/cn';
import { buildListHref, withListChange } from '@/lib/shipments/list-params';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useAuthStore } from '@/stores/auth';

export const SEARCH_DEBOUNCE_MS = 300;

/** The search box, the status filter and the sort. All write to the URL; `query` is the current view. */
export function ShipmentsToolbar({ query }: { query: ListShipmentsQuery }): ReactNode {
  const router = useRouter();
  const urlSearch = query.search ?? '';
  const [text, setText] = useState(urlSearch);
  const debounced = useDebouncedValue(text, SEARCH_DEBOUNCE_MS);
  /** The search value this box and the URL last agreed on. */
  const lastSynced = useRef(urlSearch);
  const input = useRef<HTMLInputElement>(null);

  // URL → box: only when something else changed the URL (Back, "Clear filters").
  useEffect(() => {
    if (urlSearch === lastSynced.current) return;
    lastSynced.current = urlSearch;
    setText(urlSearch);
  }, [urlSearch]);

  // Box → URL: once the text has settled.
  useEffect(() => {
    const next = debounced.trim();
    if (next === lastSynced.current) return;
    lastSynced.current = next;
    router.replace(buildListHref(withListChange(query, { search: next === '' ? undefined : next })));
    // `debounced` is the only dependency on purpose: re-running this effect when the URL changes would push
    // the previous text back.
  }, [debounced]);

  // Clear search: drop the search from the URL at once instead of waiting for the debounce.
  function clearSearch(): void {
    setText('');
    input.current?.focus();
    if (lastSynced.current === '') return;
    lastSynced.current = '';
    router.replace(buildListHref(withListChange(query, { search: undefined })));
  }

  const role = useAuthStore((state) => state.user?.role);
  const placeholder =
    role === 'DISPATCHER' ? 'Tracking number, client, city or description' : 'Tracking number, city or description';

  return (
    <div className="mt-6 flex items-end gap-3">
      <div className="min-w-0 flex-1">
        <TextField
          ref={input}
          label="Search"
          type="search"
          maxLength={100}
          placeholder={placeholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="[&::-webkit-search-cancel-button]:appearance-none"
          leading={<MagnifyingGlassIcon aria-hidden className="h-4 w-4" />}
          trailing={
            text === '' ? undefined : (
              <button
                type="button"
                aria-label="Clear search"
                title="Clear search"
                onClick={clearSearch}
                className={cn(
                  'rounded-md p-1.5 text-ink-muted hover:text-ink',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                )}
              >
                <Cross2Icon aria-hidden className="h-4 w-4" />
              </button>
            )
          }
        />
      </div>
      <div className="hidden items-end gap-3 sm:flex">
        <div className="w-48">
          <StatusSelect query={query} />
        </div>
        <SortMenu query={query} />
      </div>
      <div className="sm:hidden">
        <FiltersPopover query={query} />
      </div>
    </div>
  );
}

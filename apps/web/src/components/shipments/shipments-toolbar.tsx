'use client';

import {
  type ListShipmentsQuery,
  SHIPMENT_SORTS,
  SHIPMENT_STATUSES,
  shipmentSortSchema,
  shipmentStatusSchema,
} from '@shipment-tracker/shared';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from 'react';

import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { buildListHref, withListChange } from '@/lib/shipments/list-params';
import { SORT_LABELS } from '@/lib/shipments/sort';
import { STATUS_LABELS } from '@/lib/shipments/status';
import { useDebouncedValue } from '@/lib/use-debounced-value';

export const SEARCH_DEBOUNCE_MS = 300;

/** The search box, the status filter and the sort. All write to the URL; `query` is the current view. */
export function ShipmentsToolbar({ query }: { query: ListShipmentsQuery }): ReactNode {
  const router = useRouter();
  const urlSearch = query.search ?? '';
  const [text, setText] = useState(urlSearch);
  const debounced = useDebouncedValue(text, SEARCH_DEBOUNCE_MS);
  /** The search value this box and the URL last agreed on. */
  const lastSynced = useRef(urlSearch);

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

  const onStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const parsed = shipmentStatusSchema.safeParse(event.target.value);
    const status = parsed.success ? parsed.data : undefined;
    router.push(buildListHref(withListChange(query, { status })));
  };

  const onSortChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const parsed = shipmentSortSchema.safeParse(event.target.value);
    if (!parsed.success) return;
    router.push(buildListHref(withListChange(query, { sort: parsed.data })));
  };

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_12rem_12rem]">
      <TextField
        label="Search"
        type="search"
        maxLength={100}
        placeholder="Tracking number, origin, destination or description"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <SelectField label="Status" value={query.status ?? ''} onChange={onStatusChange}>
        <option value="">All statuses</option>
        {SHIPMENT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]}
          </option>
        ))}
      </SelectField>
      <SelectField label="Sort" value={query.sort} onChange={onSortChange}>
        {SHIPMENT_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {SORT_LABELS[sort]}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

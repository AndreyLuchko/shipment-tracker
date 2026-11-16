'use client';

import { type ListShipmentsQuery, listShipmentsQuerySchema } from '@shipment-tracker/shared';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

export const SHIPMENTS_PATH = '/shipments';

const { status: statusSchema, search: searchSchema, page: pageSchema } = listShipmentsQuerySchema.shape;

/** The list view a query string names. A missing or invalid value falls back: no filter, page 1. */
export function parseListParams(params: URLSearchParams): ListShipmentsQuery {
  const status = statusSchema.safeParse(params.get('status') ?? undefined);
  const search = searchSchema.safeParse(params.get('search') ?? undefined);
  const page = pageSchema.safeParse(params.get('page') ?? undefined);
  return {
    status: status.success ? status.data : undefined,
    search: search.success ? search.data : undefined,
    page: page.success ? page.data : 1,
  };
}

/** `/shipments` plus only the non-default values, in the order `status`, `search`, `page`. */
export function buildListHref(query: ListShipmentsQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.search) params.set('search', query.search);
  if (query.page !== 1) params.set('page', String(query.page));
  const search = params.toString();
  return search ? `${SHIPMENTS_PATH}?${search}` : SHIPMENTS_PATH;
}

/**
 * The view after a change. A key present in `change` replaces the current value (`undefined` clears a
 * filter). Unless `change` names a page, the result is page 1.
 */
export function withListChange(query: ListShipmentsQuery, change: Partial<ListShipmentsQuery>): ListShipmentsQuery {
  return { ...query, ...change, page: change.page ?? 1 };
}

/** The list view of the current URL; the same object for as long as the query string is the same. */
export function useListParams(): ListShipmentsQuery {
  const searchParams = useSearchParams();
  return useMemo(() => parseListParams(searchParams), [searchParams]);
}

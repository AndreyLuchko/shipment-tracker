import type { ListShipmentsQuery } from '@shipment-tracker/shared';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildListHref, parseListParams, useListParams, withListChange } from '@/lib/shipments/list-params';

import { navigate } from '../../helpers/router';

function parse(text: string): ListShipmentsQuery {
  return parseListParams(new URLSearchParams(text));
}

describe('parseListParams', () => {
  it('falls back to page 1 without a filter for an empty query string', () => {
    expect(parse('')).toEqual({ page: 1 });
  });

  it('reads status, search and page', () => {
    expect(parse('status=EXCEPTION&search=kyiv&page=2')).toEqual({ status: 'EXCEPTION', search: 'kyiv', page: 2 });
  });

  it.each(['status=LOST', 'status=exception', 'status='])('ignores an invalid status: %s', (text) => {
    expect(parse(text)).toEqual({ page: 1 });
  });

  it('cleans the search text', () => {
    expect(parse('search=++kyiv+hub++')).toEqual({ search: 'kyiv hub', page: 1 });
  });

  it.each(['search=', 'search=+++', `search=${'x'.repeat(101)}`])('ignores an invalid search: %s', (text) => {
    expect(parse(text)).toEqual({ page: 1 });
  });

  it.each(['page=abc', 'page=0', 'page=-1', 'page=1.5', 'page=100001', 'page='])(
    'ignores an invalid page: %s',
    (text) => {
      expect(parse(text)).toEqual({ page: 1 });
    },
  );

  it('keeps a good value when another one is bad', () => {
    expect(parse('status=LOST&search=kyiv&page=abc')).toEqual({ search: 'kyiv', page: 1 });
  });

  it('takes the first of repeated values', () => {
    expect(parse('page=3&page=7')).toEqual({ page: 3 });
  });

  it('ignores unknown keys', () => {
    expect(parse('foo=bar&status=DELIVERED')).toEqual({ status: 'DELIVERED', page: 1 });
  });
});

describe('buildListHref', () => {
  const cases: [ListShipmentsQuery, string][] = [
    [{ page: 1 }, '/shipments'],
    [{ page: 2 }, '/shipments?page=2'],
    [{ status: 'EXCEPTION', page: 1 }, '/shipments?status=EXCEPTION'],
    [{ search: 'kyiv hub', page: 1 }, '/shipments?search=kyiv+hub'],
    [{ status: 'IN_TRANSIT', search: 'a&b', page: 3 }, '/shipments?status=IN_TRANSIT&search=a%26b&page=3'],
  ];

  it.each(cases)('builds the href of %j', (query, href) => {
    expect(buildListHref(query)).toBe(href);
  });

  it.each(cases)('round-trips %j through the URL', (query) => {
    expect(parse(new URL(buildListHref(query), 'http://x').search)).toEqual(query);
  });
});

describe('withListChange', () => {
  const CURRENT: ListShipmentsQuery = { status: 'EXCEPTION', search: 'kyiv', page: 3 };

  it.each<[Partial<ListShipmentsQuery>, ListShipmentsQuery]>([
    [{ page: 4 }, { status: 'EXCEPTION', search: 'kyiv', page: 4 }],
    [{ status: 'DELIVERED' }, { status: 'DELIVERED', search: 'kyiv', page: 1 }],
    [{ status: undefined }, { search: 'kyiv', page: 1 }],
    [{ search: 'lviv' }, { status: 'EXCEPTION', search: 'lviv', page: 1 }],
    [{ search: undefined }, { status: 'EXCEPTION', page: 1 }],
    [{}, { status: 'EXCEPTION', search: 'kyiv', page: 1 }],
  ])('applies %j', (change, expected) => {
    expect(withListChange(CURRENT, change)).toEqual(expected);
  });
});

describe('useListParams', () => {
  it('follows the URL and keeps the same object while the query string is unchanged', () => {
    navigate('/shipments?status=EXCEPTION&page=2');
    const { result, rerender } = renderHook(() => useListParams());
    expect(result.current).toEqual({ status: 'EXCEPTION', page: 2 });

    act(() => navigate('/shipments'));
    expect(result.current).toEqual({ page: 1 });

    const before = result.current;
    rerender();
    expect(result.current).toBe(before);
  });
});

// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { config, proxy } from '@/proxy';

function request(url: string, cookie?: string): NextRequest {
  return new NextRequest(url, cookie === undefined ? undefined : { headers: { cookie } });
}

describe('proxy', () => {
  it('redirects a visitor without a session cookie to /login', () => {
    const response = proxy(request('http://localhost:3000/shipments'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/login');
  });

  it('carries the path and query of a nested page over to /login as ?next=', () => {
    const response = proxy(request('http://localhost:3000/shipments/abc?tab=events'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/login?next=%2Fshipments%2Fabc%3Ftab%3Devents');
  });

  it('carries the list filters over to /login', () => {
    const response = proxy(request('http://localhost:3000/shipments?status=EXCEPTION&search=kyiv%20hub&page=2'));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.searchParams.get('next')).toBe('/shipments?status=EXCEPTION&search=kyiv%20hub&page=2');
  });

  it('carries /shipments/new over to /login', () => {
    const response = proxy(request('http://localhost:3000/shipments/new'));

    expect(response.headers.get('location')).toMatch(/\/login\?next=%2Fshipments%2Fnew$/);
  });

  it('keeps the origin of the request', () => {
    const response = proxy(request('https://demo.example.com/shipments'));

    expect(response.headers.get('location')).toBe('https://demo.example.com/login');
  });

  it('keeps the origin of the request when carrying ?next=', () => {
    const response = proxy(request('https://demo.example.com/shipments/abc'));

    expect(response.headers.get('location')).toBe('https://demo.example.com/login?next=%2Fshipments%2Fabc');
  });

  it('lets a visitor with a session cookie through on a nested page', () => {
    const response = proxy(request('http://localhost:3000/shipments/abc', 'access_token=anything'));

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('lets a visitor with a session cookie through', () => {
    const response = proxy(request('http://localhost:3000/shipments', 'access_token=anything'));

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('finds the session cookie among other cookies', () => {
    const response = proxy(request('http://localhost:3000/shipments', 'a=1; access_token=anything; b=2'));

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it.each(['csrf_token=x', 'xaccess_token=abc', 'access_token='])('redirects with the cookie header %j', (cookie) => {
    const response = proxy(request('http://localhost:3000/shipments', cookie));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/login');
  });
});

describe('config', () => {
  it('matches /shipments and everything under it, nothing else', () => {
    expect(config).toEqual({ matcher: ['/shipments/:path*'] });
  });
});

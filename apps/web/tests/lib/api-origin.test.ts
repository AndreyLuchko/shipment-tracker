// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { DEFAULT_API_ORIGIN, resolveApiOrigin } from '@/lib/api-origin';

type Env = Record<string, string | undefined>;

describe('resolveApiOrigin', () => {
  it.each<Env>([{}, { API_ORIGIN: '' }])('falls back to the default origin for %j', (env) => {
    expect(resolveApiOrigin(env)).toBe('http://localhost:3001');
    expect(resolveApiOrigin(env)).toBe(DEFAULT_API_ORIGIN);
  });

  it('returns a configured https origin', () => {
    expect(resolveApiOrigin({ API_ORIGIN: 'https://api.example.com' })).toBe('https://api.example.com');
  });

  it('drops one trailing slash', () => {
    expect(resolveApiOrigin({ API_ORIGIN: 'https://api.example.com/' })).toBe('https://api.example.com');
  });

  it('keeps an explicit port', () => {
    expect(resolveApiOrigin({ API_ORIGIN: 'http://localhost:4000' })).toBe('http://localhost:4000');
  });

  it.each<Env>([{ VERCEL: '1' }, { VERCEL: '1', API_ORIGIN: '' }])('requires API_ORIGIN on Vercel for %j', (env) => {
    expect(() => resolveApiOrigin(env)).toThrow(/API_ORIGIN is required/);
  });

  it('accepts a configured origin on Vercel', () => {
    expect(resolveApiOrigin({ VERCEL: '1', API_ORIGIN: 'https://api.example.com' })).toBe('https://api.example.com');
  });

  it.each<Env>([{ VERCEL: '0' }, { VERCEL: 'true' }])('treats only the literal "1" as Vercel: %j', (env) => {
    expect(resolveApiOrigin(env)).toBe('http://localhost:3001');
  });

  it.each(['api.example.com', 'nope', 'ftp://api.example.com'])('rejects %s as not an http(s) origin', (value) => {
    expect(() => resolveApiOrigin({ API_ORIGIN: value })).toThrow(/API_ORIGIN must be an http\(s\) origin/);
  });

  it.each(['https://api.example.com/api/v1', 'https://api.example.com/?x=1', 'https://api.example.com/#x'])(
    'rejects %s because it carries more than an origin',
    (value) => {
      expect(() => resolveApiOrigin({ API_ORIGIN: value })).toThrow(/API_ORIGIN must be an http\(s\) origin/);
    },
  );
});

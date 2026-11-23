// apps/api/tests/prisma/demo-reset-args.test.ts
import { describe, expect, it } from 'vitest';
import { parseResetArgs } from '../../prisma/demo-reset-args.js';
import { describeTarget } from '../../prisma/seed-demo.js';

const LOCAL_URL = 'postgresql://u:p@localhost:5432/shipment_tracker';

describe('parseResetArgs', () => {
  it('refuses without --confirm and shows the command to run', () => {
    expect(parseResetArgs([], LOCAL_URL)).toEqual({
      kind: 'error',
      message:
        'Refusing to reset localhost/shipment_tracker without confirmation. This deletes every user, shipment and event there. Run: npm run db:demo-reset -w apps/api -- --confirm localhost',
    });
  });

  it('runs when --confirm names the database host', () => {
    expect(parseResetArgs(['--confirm', 'localhost'], LOCAL_URL)).toEqual({
      kind: 'run',
      target: 'localhost/shipment_tracker',
    });
  });

  it('refuses when --confirm names another host', () => {
    expect(parseResetArgs(['--confirm', 'ep-x.eu-central-1.aws.neon.tech'], LOCAL_URL)).toEqual({
      kind: 'error',
      message:
        'Refusing to reset: --confirm "ep-x.eu-central-1.aws.neon.tech" does not match the database host "localhost"',
    });
  });

  it('accepts the --confirm=<host> spelling', () => {
    expect(parseResetArgs(['--confirm=localhost'], LOCAL_URL)).toEqual({
      kind: 'run',
      target: 'localhost/shipment_tracker',
    });
  });

  it('rejects an extra positional argument', () => {
    const result = parseResetArgs(['--confirm', 'localhost', 'extra'], LOCAL_URL);
    expect(result.kind).toBe('error');
    expect(result.kind === 'error' && result.message).toMatch(/^Unexpected argument/);
  });

  it('errors when DATABASE_URL is not set', () => {
    expect(parseResetArgs(['--confirm', 'localhost'], undefined)).toEqual({
      kind: 'error',
      message: 'DATABASE_URL is not set',
    });
  });

  it('errors when DATABASE_URL is not a connection string', () => {
    expect(parseResetArgs(['--confirm', 'localhost'], 'not a url')).toEqual({
      kind: 'error',
      message: 'DATABASE_URL is not a valid connection string',
    });
  });
});

describe('describeTarget', () => {
  it('returns host/database without the user or password', () => {
    expect(describeTarget('postgresql://neon_user:s3cret@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require')).toBe(
      'ep-x.eu-central-1.aws.neon.tech/neondb',
    );
  });
});

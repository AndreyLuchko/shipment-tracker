// apps/api/tests/helpers/test-database.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { assertTestDatabaseName, resetDb } from './db.js';
import { toTestDatabaseUrl } from './test-database-url.js';

describe('toTestDatabaseUrl', () => {
  it('appends _test to the database name', () => {
    expect(toTestDatabaseUrl('postgresql://u:p@localhost:5432/shipment_tracker')).toBe(
      'postgresql://u:p@localhost:5432/shipment_tracker_test',
    );
  });

  it('keeps the query string', () => {
    expect(toTestDatabaseUrl('postgresql://u:p@localhost:5432/shipment_tracker?schema=public')).toBe(
      'postgresql://u:p@localhost:5432/shipment_tracker_test?schema=public',
    );
  });

  it('is idempotent', () => {
    const once = toTestDatabaseUrl('postgresql://u:p@localhost:5432/shipment_tracker');
    expect(toTestDatabaseUrl(once)).toBe(once);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => toTestDatabaseUrl(undefined)).toThrow(/DATABASE_URL/);
  });
});

describe('assertTestDatabaseName', () => {
  it('accepts a name ending in _test', () => {
    expect(() => assertTestDatabaseName('shipment_tracker_test')).not.toThrow();
  });

  it('refuses the development database', () => {
    expect(() => assertTestDatabaseName('shipment_tracker')).toThrow(/shipment_tracker/);
  });
});

describe('test database', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('is the database the app connects to under Vitest', async () => {
    const rows = await app.prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
    expect(rows).toEqual([{ name: 'shipment_tracker_test' }]);
  });

  it('is emptied by resetDb', async () => {
    await app.prisma.user.create({
      data: { email: 'reset@example.com', passwordHash: 'x', name: 'Reset' },
    });

    await resetDb(app.prisma);

    expect(await app.prisma.user.count()).toBe(0);
  });
});

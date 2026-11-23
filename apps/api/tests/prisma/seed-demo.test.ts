// apps/api/tests/prisma/seed-demo.test.ts
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildDemoShipments } from '../../prisma/demo-data.js';
import { resetDemoData, seedDemoData } from '../../prisma/seed-demo.js';
import { buildTestApp } from '../helpers/app.js';
import { registerTestUser, sessionRequest, type TestSession } from '../helpers/auth.js';
import { resetDb } from '../helpers/db.js';

const SEED_NOW = new Date('2026-11-22T12:00:00.000Z');
const DEMO = buildDemoShipments(SEED_NOW);
const DEMO_EVENT_COUNT = DEMO.reduce((sum, shipment) => sum + shipment.events.length, 0);
const SEEDED_NUMBERS = new Set(DEMO.map((shipment) => shipment.trackingNumber));

describe('seed-demo', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(app.prisma);
  });

  async function loginAs(email: string, password: string): Promise<TestSession> {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
    expect(response.statusCode).toBe(200);
    const byName = new Map(response.cookies.map((cookie) => [cookie.name, cookie.value]));
    const csrfToken = byName.get('csrf_token')!;
    return {
      user: response.json().user,
      cookies: { access_token: byName.get('access_token')!, csrf_token: csrfToken },
      csrfToken,
    };
  }

  const FRESH = { users: 5, shipments: 30, events: DEMO_EVENT_COUNT, created: 30 };

  it('seeds an empty database', async () => {
    expect(await seedDemoData(app.prisma, SEED_NOW)).toEqual(FRESH);
  });

  it('is a no-op the second time', async () => {
    await seedDemoData(app.prisma, SEED_NOW);
    const before = await app.prisma.shipment.findUniqueOrThrow({ where: { trackingNumber: 'ST-2026-000001' } });

    expect(await seedDemoData(app.prisma, SEED_NOW)).toEqual({ ...FRESH, created: 0 });

    const after = await app.prisma.shipment.findUniqueOrThrow({ where: { trackingNumber: 'ST-2026-000001' } });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it('dates each shipment from its first and last event', async () => {
    await seedDemoData(app.prisma, SEED_NOW);
    for (const demo of DEMO) {
      const shipment = await app.prisma.shipment.findUniqueOrThrow({ where: { trackingNumber: demo.trackingNumber } });
      expect(shipment.createdAt).toEqual(demo.events[0]!.occurredAt);
      expect(shipment.updatedAt).toEqual(demo.events[demo.events.length - 1]!.occurredAt);
      expect(shipment.status).toBe(demo.events[demo.events.length - 1]!.status);
    }
  });

  it('lets the demo accounts log in', async () => {
    await seedDemoData(app.prisma, SEED_NOW);
    await loginAs('dispatcher@demo.dev', 'dispatcher123');
    await loginAs('client@demo.dev', 'client123');
  });

  it('shows the data through the API', async () => {
    await seedDemoData(app.prisma, SEED_NOW);
    const dispatcher = await loginAs('dispatcher@demo.dev', 'dispatcher123');
    const client = await loginAs('client@demo.dev', 'client123');

    const all = await app.inject({ method: 'GET', url: '/api/v1/shipments?page=1', ...sessionRequest(dispatcher) });
    expect(all.json()).toMatchObject({ total: 30, totalPages: 2 });

    const own = await app.inject({ method: 'GET', url: '/api/v1/shipments?page=1', ...sessionRequest(client) });
    expect(own.json()).toMatchObject({ total: 10 });

    const exceptions = await app.inject({
      method: 'GET',
      url: '/api/v1/shipments?status=EXCEPTION',
      ...sessionRequest(dispatcher),
    });
    expect(exceptions.json()).toMatchObject({ total: 3 });
  });

  it('accepts a new event on a seeded shipment', async () => {
    await seedDemoData(app.prisma, SEED_NOW);
    const dispatcher = await loginAs('dispatcher@demo.dev', 'dispatcher123');
    const shipment = await app.prisma.shipment.findUniqueOrThrow({ where: { trackingNumber: 'ST-2026-000030' } });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/shipments/${shipment.id}/events`,
      payload: { status: 'PICKED_UP' },
      ...sessionRequest(dispatcher),
    });

    expect(response.statusCode).toBe(201);
  });

  it('keeps shipments created by visitors', async () => {
    await seedDemoData(app.prisma, SEED_NOW);
    const dispatcher = await loginAs('dispatcher@demo.dev', 'dispatcher123');
    const client = await app.prisma.user.findUniqueOrThrow({ where: { email: 'client@demo.dev' } });
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/shipments',
      payload: { clientId: client.id, origin: 'Kyiv, UA', destination: 'Lviv, UA', description: 'Visitor parcel' },
      ...sessionRequest(dispatcher),
    });
    expect(created.statusCode).toBe(201);
    const { trackingNumber } = created.json().shipment as { trackingNumber: string };
    expect(trackingNumber).toMatch(/^ST-\d{4}-\d{6}$/);
    expect(SEEDED_NUMBERS.has(trackingNumber)).toBe(false);

    await seedDemoData(app.prisma, SEED_NOW);

    expect(await app.prisma.shipment.findUnique({ where: { trackingNumber } })).not.toBeNull();
  });

  it('resets to the fresh state', async () => {
    await seedDemoData(app.prisma, SEED_NOW);
    const dispatcher = await loginAs('dispatcher@demo.dev', 'dispatcher123');
    const visitor = await registerTestUser(app, { email: 'visitor@example.com' });
    const client = await app.prisma.user.findUniqueOrThrow({ where: { email: 'client@demo.dev' } });
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/shipments',
      payload: { clientId: client.id, origin: 'Kyiv, UA', destination: 'Lviv, UA', description: 'Visitor parcel' },
      ...sessionRequest(dispatcher),
    });
    const { id: createdId } = created.json().shipment as { id: string };
    const newest = await app.prisma.shipment.findUniqueOrThrow({ where: { trackingNumber: 'ST-2026-000030' } });
    await app.inject({
      method: 'POST',
      url: `/api/v1/shipments/${newest.id}/events`,
      payload: { status: 'PICKED_UP' },
      ...sessionRequest(dispatcher),
    });

    expect(await resetDemoData(app.prisma, SEED_NOW)).toEqual(FRESH);

    expect(await app.prisma.user.findUnique({ where: { id: visitor.user.id } })).toBeNull();
    expect(await app.prisma.shipment.findUnique({ where: { id: createdId } })).toBeNull();
    expect(await app.prisma.movementEvent.count({ where: { shipment: { trackingNumber: 'ST-2026-000030' } } })).toBe(1);
  });
});

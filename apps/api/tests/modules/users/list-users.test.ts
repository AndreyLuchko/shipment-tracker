import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { shipmentResponseSchema, userListResponseSchema } from '@shipment-tracker/shared';
import { buildTestApp } from '../../helpers/app.js';
import { registerTestUser, sessionRequest, type TestSession } from '../../helpers/auth.js';
import { resetDb } from '../../helpers/db.js';

const UNAUTH = { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } };

interface ErrorBody {
  error: { code: string; message: string; details?: Array<{ path: string; message: string }> };
}

/** Asserts `VALIDATION_ERROR` with a `details` entry on each of `paths`. */
function expectValidationError(response: { statusCode: number; json: () => unknown }, ...paths: string[]) {
  expect(response.statusCode).toBe(400);
  const body = response.json() as ErrorBody;
  expect(body.error.code).toBe('VALIDATION_ERROR');
  expect(body.error.message).toBe('Request validation failed');
  const reported = (body.error.details ?? []).map((detail) => detail.path);
  for (const path of paths) {
    expect(reported).toContain(path);
  }
}

describe('GET /api/v1/users', () => {
  let app: FastifyInstance;
  let dispatcher: TestSession;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  beforeEach(async () => {
    await resetDb(app.prisma);
    dispatcher = await registerTestUser(app, { role: 'DISPATCHER', name: 'Dana Dispatcher' });
  });

  afterAll(async () => {
    await app.close();
  });

  /** Registers the three clients, deliberately out of alphabetical order. */
  async function registerClients(): Promise<TestSession[]> {
    const clients: TestSession[] = [];
    for (const name of ['Zoya', 'Andrii', 'Mykola']) {
      clients.push(await registerTestUser(app, { name }));
    }
    return clients;
  }

  function list(session: TestSession | undefined, query: Record<string, string>) {
    return app.inject({
      method: 'GET',
      url: '/api/v1/users',
      query,
      ...(session === undefined ? {} : { cookies: session.cookies }),
    });
  }

  it('rejects a request without a session', async () => {
    const response = await list(undefined, { role: 'CLIENT' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(UNAUTH);
  });

  it('rejects a client session', async () => {
    const [client] = await registerClients();
    const response = await list(client, { role: 'CLIENT' });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(FORBIDDEN);
  });

  it('lists clients ordered by name', async () => {
    await registerClients();
    const response = await list(dispatcher, { role: 'CLIENT' });
    expect(response.statusCode).toBe(200);
    const body = userListResponseSchema.parse(response.json());
    expect(body.items.map((user) => user.name)).toEqual(['Andrii', 'Mykola', 'Zoya']);
  });

  it('exposes only id, name and email', async () => {
    await registerClients();
    const response = await list(dispatcher, { role: 'CLIENT' });
    const items = (response.json() as { items: Array<Record<string, unknown>> }).items;
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(['email', 'id', 'name']);
    }
    expect(response.body).not.toContain('passwordHash');
    expect(response.body).not.toContain('createdAt');
    expect(response.body).not.toContain('"role"');
  });

  it('lists dispatchers for role=DISPATCHER', async () => {
    await registerClients();
    const response = await list(dispatcher, { role: 'DISPATCHER' });
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toEqual([
      { id: dispatcher.user.id, name: 'Dana Dispatcher', email: dispatcher.user.email },
    ]);
  });

  it('requires the role query parameter', async () => {
    expectValidationError(await list(dispatcher, {}), 'role');
  });

  it.each(['ADMIN', 'client'])('rejects role=%s', async (role) => {
    expectValidationError(await list(dispatcher, { role }), 'role');
  });

  it('returns an empty list when no client exists', async () => {
    const response = await list(dispatcher, { role: 'CLIENT' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [] });
  });

  it('returns ids that POST /shipments accepts as clientId', async () => {
    await registerClients();
    const listed = userListResponseSchema.parse((await list(dispatcher, { role: 'CLIENT' })).json());
    const firstClient = listed.items[0];
    expect(firstClient).toBeDefined();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/shipments',
      ...sessionRequest(dispatcher),
      payload: { clientId: firstClient?.id, origin: 'Kyiv, UA', destination: 'Lviv, UA', description: 'Books' },
    });
    expect(response.statusCode).toBe(201);
    expect(shipmentResponseSchema.parse(response.json()).shipment.client.name).toBe('Andrii');
  });
});

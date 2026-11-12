import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { shipmentListResponseSchema, type ShipmentStatus } from '@shipment-tracker/shared';
import { buildTestApp } from '../../helpers/app.js';
import { registerTestUser, sessionRequest, type TestSession } from '../../helpers/auth.js';
import { resetDb } from '../../helpers/db.js';
import { createTestShipment } from '../../helpers/shipments.js';

const UNAUTH = { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };

interface Fixture {
  client: 'A' | 'B';
  trackingNumber: string;
  origin: string;
  destination: string;
  description: string;
  status: ShipmentStatus;
}

/** Oldest first; `createdAt` one minute apart in this order. */
const FIXTURES: Fixture[] = [
  {
    client: 'A',
    trackingNumber: 'ST-TEST-A1',
    origin: 'Kyiv, UA',
    destination: 'Lviv, UA',
    description: 'Books for the library',
    status: 'CREATED',
  },
  {
    client: 'A',
    trackingNumber: 'ST-TEST-A2',
    origin: 'Odesa, UA',
    destination: 'Kharkiv, UA',
    description: '100% cotton shirts',
    status: 'IN_TRANSIT',
  },
  {
    client: 'A',
    trackingNumber: 'ST-TEST-A3',
    origin: 'Dnipro, UA',
    destination: 'Kyiv, UA',
    description: 'Spare parts box_1',
    status: 'DELIVERED',
  },
  {
    client: 'B',
    trackingNumber: 'ST-TEST-B1',
    origin: 'Kyiv, UA',
    destination: 'Poltava, UA',
    description: '100 percent wool',
    status: 'IN_TRANSIT',
  },
  {
    client: 'B',
    trackingNumber: 'ST-TEST-B2',
    origin: 'Lutsk, UA',
    destination: 'Sumy, UA',
    description: 'Path C:\\temp files',
    status: 'EXCEPTION',
  },
];

const MINUTE_MS = 60 * 1000;
const SECOND_MS = 1000;

function ids(response: LightMyRequestResponse): string[] {
  return shipmentListResponseSchema.parse(response.json()).items.map((item) => item.trackingNumber);
}

function expectValidationError(response: LightMyRequestResponse, path: string): void {
  expect(response.statusCode).toBe(400);
  const body = response.json();
  expect(body.error.code).toBe('VALIDATION_ERROR');
  expect(body.error.message).toBe('Request validation failed');
  expect(body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path })]));
}

describe('GET /api/v1/shipments', () => {
  let app: FastifyInstance;
  let dispatcher: TestSession;
  let clientA: TestSession;
  let clientB: TestSession;
  let clientC: TestSession;

  /** `query` is the raw query string (without `?`), sent as-is so encodings like `%25` reach the server intact. */
  function list(session?: TestSession, query?: string) {
    return app.inject({
      method: 'GET',
      url: query === undefined ? '/api/v1/shipments' : `/api/v1/shipments?${query}`,
      ...(session !== undefined ? sessionRequest(session) : {}),
    });
  }

  beforeAll(async () => {
    app = await buildTestApp();
  });

  beforeEach(async () => {
    await resetDb(app.prisma);
    dispatcher = await registerTestUser(app, { role: 'DISPATCHER' });
    clientA = await registerTestUser(app, { name: 'Client A' });
    clientB = await registerTestUser(app, { name: 'Client B' });
    clientC = await registerTestUser(app, { name: 'Client C' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('scoping and filters', () => {
    beforeEach(async () => {
      const base = Date.now() - FIXTURES.length * MINUTE_MS;
      for (const [index, fixture] of FIXTURES.entries()) {
        const owner = fixture.client === 'A' ? clientA : clientB;
        await createTestShipment(app.prisma, owner.user.id, {
          trackingNumber: fixture.trackingNumber,
          origin: fixture.origin,
          destination: fixture.destination,
          description: fixture.description,
          status: fixture.status,
          createdAt: new Date(base + index * MINUTE_MS),
        });
      }
    });

    describe('access and shape', () => {
      it('rejects a request without cookies', async () => {
        const response = await list();
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual(UNAUTH);
      });

      it('shows a dispatcher every shipment, newest first', async () => {
        const response = await list(dispatcher);
        expect(response.statusCode).toBe(200);
        const body = shipmentListResponseSchema.parse(response.json());
        expect(body.total).toBe(5);
        expect(body.page).toBe(1);
        expect(body.pageSize).toBe(20);
        expect(body.totalPages).toBe(1);
        expect(ids(response)).toEqual(['ST-TEST-B2', 'ST-TEST-B1', 'ST-TEST-A3', 'ST-TEST-A2', 'ST-TEST-A1']);
      });

      it('returns summaries without events or clientId, with the client embedded', async () => {
        const response = await list(dispatcher);
        const raw = response.json() as { items: Record<string, unknown>[] };
        for (const item of raw.items) {
          expect(item).not.toHaveProperty('events');
          expect(item).not.toHaveProperty('clientId');
        }
        expect(raw.items[0]?.client).toEqual({ id: clientB.user.id, name: 'Client B', email: clientB.user.email });
      });

      it('shows client A only its own shipments', async () => {
        const response = await list(clientA);
        const body = shipmentListResponseSchema.parse(response.json());
        expect(body.total).toBe(3);
        for (const item of body.items) {
          expect(item.client.id).toBe(clientA.user.id);
        }
        expect(ids(response)).toEqual(['ST-TEST-A3', 'ST-TEST-A2', 'ST-TEST-A1']);
      });

      it('shows client B only its own shipments', async () => {
        const response = await list(clientB);
        expect(shipmentListResponseSchema.parse(response.json()).total).toBe(2);
        expect(ids(response)).toEqual(['ST-TEST-B2', 'ST-TEST-B1']);
      });

      it('returns an empty page to a client without shipments', async () => {
        const response = await list(clientC);
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
      });
    });

    describe('filters', () => {
      it('filters a dispatcher by status', async () => {
        const response = await list(dispatcher, 'status=IN_TRANSIT');
        expect(ids(response)).toEqual(['ST-TEST-B1', 'ST-TEST-A2']);
        expect(response.json().total).toBe(2);
      });

      it("does not count another client's shipment in a client's status filter", async () => {
        const response = await list(clientA, 'status=IN_TRANSIT');
        expect(ids(response)).toEqual(['ST-TEST-A2']);
        expect(response.json().total).toBe(1);
      });

      it('returns nothing for a status the client has no shipment in', async () => {
        const response = await list(clientA, 'status=EXCEPTION');
        expect(response.json().items).toEqual([]);
        expect(response.json().total).toBe(0);
      });

      it.each(['status=delivered', 'status=', 'status=IN_TRANSIT&status=DELIVERED'])(
        'rejects the status query %s',
        async (query) => {
          expectValidationError(await list(dispatcher, query), 'status');
        },
      );

      it.each(['TEST-A2', 'odesa', 'KHARKIV', 'cotton'])('finds A2 by search=%s', async (search) => {
        expect(ids(await list(dispatcher, `search=${search}`))).toEqual(['ST-TEST-A2']);
      });

      it('searches origin and destination case-insensitively', async () => {
        expect(ids(await list(dispatcher, 'search=kyiv'))).toEqual(['ST-TEST-B1', 'ST-TEST-A3', 'ST-TEST-A1']);
      });

      it("never matches another client's shipment through search", async () => {
        const response = await list(clientA, 'search=wool');
        expect(response.json().items).toEqual([]);
        expect(response.json().total).toBe(0);
      });

      it('scopes a client search to its own shipments', async () => {
        expect(ids(await list(clientA, 'search=kyiv'))).toEqual(['ST-TEST-A3', 'ST-TEST-A1']);
      });

      it('treats a whitespace-only search as no filter', async () => {
        expect((await list(dispatcher, 'search=%20%20')).json().total).toBe(5);
      });

      it('matches % literally in "100%"', async () => {
        expect(ids(await list(dispatcher, 'search=100%25'))).toEqual(['ST-TEST-A2']);
      });

      it('matches a lone % literally', async () => {
        expect(ids(await list(dispatcher, 'search=%25'))).toEqual(['ST-TEST-A2']);
      });

      it('matches _ literally in "box_1"', async () => {
        expect(ids(await list(dispatcher, 'search=box_1'))).toEqual(['ST-TEST-A3']);
      });

      it('matches a lone _ literally', async () => {
        expect(ids(await list(dispatcher, 'search=_'))).toEqual(['ST-TEST-A3']);
      });

      it('matches a backslash literally', async () => {
        expect(ids(await list(dispatcher, 'search=C%3A%5Ctemp'))).toEqual(['ST-TEST-B2']);
      });

      it('combines search and status', async () => {
        expect(ids(await list(dispatcher, 'search=kyiv&status=IN_TRANSIT'))).toEqual(['ST-TEST-B1']);
      });

      it('rejects a search longer than 100 characters', async () => {
        expectValidationError(await list(dispatcher, `search=${'x'.repeat(101)}`), 'search');
      });

      it('rejects a NUL character in search', async () => {
        expectValidationError(await list(dispatcher, 'search=%00'), 'search');
      });

      it('ignores unknown query keys', async () => {
        const response = await list(dispatcher, 'foo=bar');
        expect(response.statusCode).toBe(200);
        expect(response.json().total).toBe(5);
      });
    });
  });

  describe('pagination', () => {
    beforeEach(async () => {
      const base = Date.now() - 45 * SECOND_MS;
      for (let index = 1; index <= 45; index += 1) {
        await createTestShipment(app.prisma, clientA.user.id, {
          trackingNumber: `ST-TEST-${String(index).padStart(3, '0')}`,
          createdAt: new Date(base + index * SECOND_MS),
        });
      }
    });

    it('returns the first 20, newest first, by default', async () => {
      const response = await list(dispatcher);
      const body = shipmentListResponseSchema.parse(response.json());
      expect(body.items.length).toBe(20);
      expect(body.total).toBe(45);
      expect(body.totalPages).toBe(3);
      expect(body.page).toBe(1);
      expect(body.items[0]?.trackingNumber).toBe('ST-TEST-045');
      expect(body.items.at(-1)?.trackingNumber).toBe('ST-TEST-026');
    });

    it('returns the second page', async () => {
      const body = shipmentListResponseSchema.parse((await list(dispatcher, 'page=2')).json());
      expect(body.items.length).toBe(20);
      expect(body.items[0]?.trackingNumber).toBe('ST-TEST-025');
      expect(body.page).toBe(2);
    });

    it('returns the last, partial page', async () => {
      const body = shipmentListResponseSchema.parse((await list(dispatcher, 'page=3')).json());
      expect(body.items.length).toBe(5);
      expect(body.items.at(-1)?.trackingNumber).toBe('ST-TEST-001');
    });

    it('covers all 45 shipments across pages 1-3 without overlap', async () => {
      const all: string[] = [];
      for (const page of [1, 2, 3]) {
        all.push(...ids(await list(dispatcher, `page=${page}`)));
      }
      expect(new Set(all).size).toBe(45);
    });

    it('returns an empty page past the end', async () => {
      const response = await list(dispatcher, 'page=4');
      expect(response.statusCode).toBe(200);
      const body = shipmentListResponseSchema.parse(response.json());
      expect(body.items).toEqual([]);
      expect(body.total).toBe(45);
      expect(body.totalPages).toBe(3);
      expect(body.page).toBe(4);
    });

    it.each(['page=0', 'page=-1', 'page=abc', 'page=1.5', 'page=100001', 'page=1&page=2'])(
      'rejects %s',
      async (query) => {
        expectValidationError(await list(dispatcher, query), 'page');
      },
    );

    it("does not count client A's shipments for client B", async () => {
      const response = await list(clientB, 'page=1');
      expect(response.json().items).toEqual([]);
      expect(response.json().total).toBe(0);
    });
  });
});

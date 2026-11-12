import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import {
  createShipmentSchema,
  listShipmentsQuerySchema,
  type ShipmentListResponse,
  type ShipmentResponse,
} from '@shipment-tracker/shared';
import { createShipment, getShipment, listShipments, shipmentNotFound, type Actor } from './shipments.service.js';

/** Prisma cuids are lowercase alphanumerics; anything else cannot name a shipment (C15). */
const SHIPMENT_ID_PATTERN = /^[a-z0-9]{1,64}$/;

function actorFrom(request: FastifyRequest): Actor {
  return { id: request.user.sub, role: request.user.role };
}

/** The `:id` path parameter, or the standard `404` without a query — a decoded `%00` would make Postgres fail. */
function shipmentIdFrom(request: FastifyRequest<{ Params: { id: string } }>): string {
  const { id } = request.params;
  if (!SHIPMENT_ID_PATTERN.test(id)) {
    throw shipmentNotFound();
  }
  return id;
}

/** Shipment endpoints, registered under `/api/v1/shipments`. */
export const shipmentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.authenticate] }, async (request) => {
    const query = listShipmentsQuerySchema.parse(request.query);
    const body: ShipmentListResponse = await listShipments(app.prisma, actorFrom(request), query);
    return body;
  });

  app.post('/', { onRequest: [app.authenticate, app.requireRole('DISPATCHER')] }, async (request, reply) => {
    const input = createShipmentSchema.parse(request.body);
    const body: ShipmentResponse = { shipment: await createShipment(app.prisma, input) };
    return reply.code(201).send(body);
  });

  app.get<{ Params: { id: string } }>('/:id', { onRequest: [app.authenticate] }, async (request) => {
    const shipment = await getShipment(app.prisma, actorFrom(request), shipmentIdFrom(request));
    const body: ShipmentResponse = { shipment };
    return body;
  });
};

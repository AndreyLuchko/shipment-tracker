import type { Prisma, PrismaClient } from '@prisma/client';
import {
  SHIPMENTS_PAGE_SIZE,
  type CreateShipmentInput,
  type ListShipmentsQuery,
  type Role,
  type ShipmentDetail,
  type ShipmentListResponse,
} from '@shipment-tracker/shared';
import { AppError, validationError } from '../../lib/errors.js';
import { shipmentDetailInclude, shipmentSummaryInclude, toShipmentDetail, toShipmentSummary } from './shipment.dto.js';
import { nextTrackingNumber } from './tracking-number.js';

/** Who is asking. Every read takes one and scopes its query with `shipmentScope` (C1). */
export interface Actor {
  id: string;
  role: Role;
}

/** A dispatcher sees every shipment; any other role — including one added later — only its own (default deny). */
export function shipmentScope(actor: Actor): Prisma.ShipmentWhereInput {
  return actor.role === 'DISPATCHER' ? {} : { clientId: actor.id };
}

/** The one `404` for an unknown id and for someone else's shipment (D4) — the two must be indistinguishable. */
export function shipmentNotFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Shipment not found');
}

/** One scoped query: a foreign shipment is never fetched, so it cannot leak through a later comparison. */
export async function getShipment(prisma: PrismaClient, actor: Actor, id: string): Promise<ShipmentDetail> {
  const row = await prisma.shipment.findFirst({
    where: { AND: [{ id }, shipmentScope(actor)] },
    include: shipmentDetailInclude,
  });
  if (row === null) {
    throw shipmentNotFound();
  }
  return toShipmentDetail(row);
}

/** Escapes LIKE wildcards so `search` matches literally — Prisma's `contains` passes `%`, `_` and `\` through (C5). */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Case-insensitive substring match over the four searchable fields (spec §7). */
function searchFilter(search: string | undefined): Prisma.ShipmentWhereInput {
  if (search === undefined) {
    return {};
  }
  const contains = { contains: escapeLike(search), mode: 'insensitive' as const };
  return {
    OR: [{ trackingNumber: contains }, { origin: contains }, { destination: contains }, { description: contains }],
  };
}

/**
 * One page of the caller's shipments, newest first (C3). Page and count share one `where`, so `total` never
 * counts a shipment the caller cannot see.
 */
export async function listShipments(
  prisma: PrismaClient,
  actor: Actor,
  query: ListShipmentsQuery,
): Promise<ShipmentListResponse> {
  const where: Prisma.ShipmentWhereInput = {
    AND: [shipmentScope(actor), query.status === undefined ? {} : { status: query.status }, searchFilter(query.search)],
  };
  const [rows, total] = await prisma.$transaction([
    prisma.shipment.findMany({
      where,
      include: shipmentSummaryInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * SHIPMENTS_PAGE_SIZE,
      take: SHIPMENTS_PAGE_SIZE,
    }),
    prisma.shipment.count({ where }),
  ]);
  return {
    items: rows.map(toShipmentSummary),
    page: query.page,
    pageSize: SHIPMENTS_PAGE_SIZE,
    total,
    totalPages: Math.ceil(total / SHIPMENTS_PAGE_SIZE),
  };
}

/**
 * Creates a shipment for an existing `CLIENT` with its initial `CREATED` event (C8). The tracking number is
 * allocated and the row inserted in one transaction, so the advisory lock covers both (D14). `status` and
 * `carrier` come from the schema defaults, never from the request.
 */
export async function createShipment(prisma: PrismaClient, input: CreateShipmentInput): Promise<ShipmentDetail> {
  const client = await prisma.user.findUnique({ where: { id: input.clientId }, select: { role: true } });
  if (client === null || client.role !== 'CLIENT') {
    // One message for "missing" and "not a client" (D6).
    throw validationError('clientId', 'Client not found');
  }

  const row = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const trackingNumber = await nextTrackingNumber(tx, now);
    return tx.shipment.create({
      data: {
        trackingNumber,
        clientId: input.clientId,
        origin: input.origin,
        destination: input.destination,
        description: input.description,
        weightKg: input.weightKg ?? null,
        events: { create: { status: 'CREATED', source: 'SYSTEM', occurredAt: now } },
      },
      include: shipmentDetailInclude,
    });
  });
  return toShipmentDetail(row);
}

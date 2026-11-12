import type { Prisma, PrismaClient } from '@prisma/client';
import type { Role, ShipmentDetail } from '@shipment-tracker/shared';
import { AppError } from '../../lib/errors.js';
import { shipmentDetailInclude, toShipmentDetail } from './shipment.dto.js';

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

// apps/api/tests/modules/shipments/status-contract.test.ts
import { ShipmentStatus } from '@prisma/client';
import { shipmentStatusSchema } from '@shipment-tracker/shared';
import { expect, it } from 'vitest';

it('shared shipmentStatusSchema and the Prisma ShipmentStatus enum list the same statuses in the same order', () => {
  expect([...shipmentStatusSchema.options]).toEqual(Object.values(ShipmentStatus));
});

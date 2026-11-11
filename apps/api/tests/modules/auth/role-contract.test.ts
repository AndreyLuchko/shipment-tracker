import { Role } from '@prisma/client';
import { roleSchema } from '@shipment-tracker/shared';
import { expect, it } from 'vitest';

it('shared roleSchema and the Prisma Role enum list the same roles', () => {
  expect([...roleSchema.options].sort()).toEqual(Object.values(Role).sort());
});

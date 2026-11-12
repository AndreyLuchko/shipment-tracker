import type { PrismaClient } from '@prisma/client';
import type { Role, UserSummary } from '@shipment-tracker/shared';

/**
 * Every user with `role`, ordered by name — the M6 client picker (C13). Only `id`, `name` and `email` are
 * selected, so `passwordHash`, `role` and `createdAt` cannot leak. No pagination: one dropdown at demo scale.
 */
export async function listUsersByRole(prisma: PrismaClient, role: Role): Promise<UserSummary[]> {
  return prisma.user.findMany({
    where: { role },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}

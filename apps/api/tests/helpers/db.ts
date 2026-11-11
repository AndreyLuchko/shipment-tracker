import type { PrismaClient } from '@prisma/client';

/** Refuses to continue unless `name` is a test database — the guard that protects the developer's data. */
export function assertTestDatabaseName(name: string): void {
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to reset database "${name}": its name does not end with "_test"`);
  }
}

/** Empties every table. Call in `beforeEach` of each integration test. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  const name = rows[0]?.name;
  if (name === undefined) {
    throw new Error('Could not determine the current database');
  }
  assertTestDatabaseName(name);

  await prisma.$executeRawUnsafe('TRUNCATE TABLE "MovementEvent", "Shipment", "User" CASCADE');
}

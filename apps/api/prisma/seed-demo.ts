// apps/api/prisma/seed-demo.ts
// Writes the demo data set (demo-data.ts) into the database. Shared by the seed and the demo-reset CLIs.
import { randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';
import { DEMO_EXTRA_CLIENTS, buildDemoShipments } from './demo-data.js';

export interface SeedSummary {
  users: number;
  shipments: number;
  events: number;
  /** Shipments inserted by this run. */
  created: number;
}

const RESET_TIMEOUT_MS = 60_000;

/** Upserts the demo users and shipments; never updates or deletes a row. `created` = shipments inserted now. */
export async function seedDemoData(db: Prisma.TransactionClient, now: Date = new Date()): Promise<SeedSummary> {
  const accounts = [
    {
      email: 'dispatcher@demo.dev',
      name: 'Demo Dispatcher',
      role: 'DISPATCHER' as const,
      passwordHash: await hashPassword('dispatcher123'),
    },
    {
      email: 'client@demo.dev',
      name: 'Demo Client',
      role: 'CLIENT' as const,
      passwordHash: await hashPassword('client123'),
    },
  ];
  for (const client of DEMO_EXTRA_CLIENTS) {
    // Nobody logs in as these clients: the password is random and never stored or printed.
    accounts.push({
      email: client.email,
      name: client.name,
      role: 'CLIENT',
      passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
    });
  }

  const userIdByEmail = new Map<string, string>();
  for (const account of accounts) {
    const user = await db.user.upsert({ where: { email: account.email }, update: {}, create: account });
    userIdByEmail.set(user.email, user.id);
  }

  const before = await db.shipment.count();
  for (const shipment of buildDemoShipments(now)) {
    const clientId = userIdByEmail.get(shipment.clientEmail);
    if (clientId === undefined) {
      throw new Error(`Demo shipment ${shipment.trackingNumber} has an unknown client ${shipment.clientEmail}`);
    }
    const first = shipment.events[0]!;
    const last = shipment.events[shipment.events.length - 1]!;
    await db.shipment.upsert({
      where: { trackingNumber: shipment.trackingNumber },
      update: {},
      create: {
        trackingNumber: shipment.trackingNumber,
        clientId,
        origin: shipment.origin,
        destination: shipment.destination,
        description: shipment.description,
        weightKg: shipment.weightKg,
        status: last.status,
        createdAt: first.occurredAt,
        updatedAt: last.occurredAt,
        events: {
          create: shipment.events.map((event) => ({
            status: event.status,
            source: event.source,
            occurredAt: event.occurredAt,
            createdAt: event.occurredAt,
            ...(event.location !== undefined && { location: event.location }),
            ...(event.note !== undefined && { note: event.note }),
          })),
        },
      },
    });
  }

  const [users, shipments, events] = await Promise.all([
    db.user.count(),
    db.shipment.count(),
    db.movementEvent.count(),
  ]);
  return { users, shipments, events, created: shipments - before };
}

/** Deletes every event, shipment and user, then seeds — one transaction (timeout 60 s). */
export function resetDemoData(prisma: PrismaClient, now: Date = new Date()): Promise<SeedSummary> {
  return prisma.$transaction(
    async (tx) => {
      await tx.movementEvent.deleteMany();
      await tx.shipment.deleteMany();
      await tx.user.deleteMany();
      return seedDemoData(tx, now);
    },
    { timeout: RESET_TIMEOUT_MS },
  );
}

/** `host/database` of a connection string, for the CLIs' first line. Never the credentials. */
export function describeTarget(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.hostname}${url.pathname}`;
}

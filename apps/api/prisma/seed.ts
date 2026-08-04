import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role, ShipmentStatus } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
const prisma = new PrismaClient({ adapter });

async function main() {
  const dispatcherPasswordHash = await hashPassword('dispatcher123');
  const clientPasswordHash = await hashPassword('client123');

  const dispatcher = await prisma.user.upsert({
    where: { email: 'dispatcher@demo.dev' },
    update: {},
    create: {
      email: 'dispatcher@demo.dev',
      passwordHash: dispatcherPasswordHash,
      name: 'Demo Dispatcher',
      role: Role.DISPATCHER,
    },
  });

  const client = await prisma.user.upsert({
    where: { email: 'client@demo.dev' },
    update: {},
    create: {
      email: 'client@demo.dev',
      passwordHash: clientPasswordHash,
      name: 'Demo Client',
      role: Role.CLIENT,
    },
  });

  const deliveredShipment = await prisma.shipment.upsert({
    where: { trackingNumber: 'ST-2026-000001' },
    update: {},
    create: {
      trackingNumber: 'ST-2026-000001',
      clientId: client.id,
      origin: 'Kyiv, UA',
      destination: 'Lviv, UA',
      description: 'Pallet of packaged electronics',
      weightKg: 120.5,
      status: ShipmentStatus.DELIVERED,
      events: {
        create: [
          { status: ShipmentStatus.CREATED, source: 'SYSTEM', occurredAt: new Date('2026-07-01T08:00:00Z') },
          {
            status: ShipmentStatus.PICKED_UP,
            location: 'Kyiv depot',
            source: 'WEBHOOK',
            occurredAt: new Date('2026-07-01T12:00:00Z'),
          },
          {
            status: ShipmentStatus.IN_TRANSIT,
            location: 'Kyiv sorting hub',
            source: 'WEBHOOK',
            occurredAt: new Date('2026-07-02T09:00:00Z'),
          },
          {
            status: ShipmentStatus.OUT_FOR_DELIVERY,
            location: 'Lviv depot',
            source: 'WEBHOOK',
            occurredAt: new Date('2026-07-03T07:30:00Z'),
          },
          {
            status: ShipmentStatus.DELIVERED,
            location: 'Lviv, UA',
            source: 'WEBHOOK',
            occurredAt: new Date('2026-07-03T14:15:00Z'),
          },
        ],
      },
    },
  });

  const inTransitShipment = await prisma.shipment.upsert({
    where: { trackingNumber: 'ST-2026-000002' },
    update: {},
    create: {
      trackingNumber: 'ST-2026-000002',
      clientId: client.id,
      origin: 'Odesa, UA',
      destination: 'Kharkiv, UA',
      description: 'Box of spare machine parts',
      weightKg: 8.2,
      status: ShipmentStatus.IN_TRANSIT,
      events: {
        create: [
          { status: ShipmentStatus.CREATED, source: 'SYSTEM', occurredAt: new Date('2026-08-01T08:00:00Z') },
          {
            status: ShipmentStatus.PICKED_UP,
            location: 'Odesa depot',
            source: 'WEBHOOK',
            occurredAt: new Date('2026-08-01T11:00:00Z'),
          },
          {
            status: ShipmentStatus.IN_TRANSIT,
            location: 'Dnipro sorting hub',
            source: 'WEBHOOK',
            occurredAt: new Date('2026-08-02T10:00:00Z'),
          },
        ],
      },
    },
  });

  console.log(
    `Seeded users: ${dispatcher.email}, ${client.email}. Seeded shipments: ${deliveredShipment.trackingNumber}, ${inTransitShipment.trackingNumber}.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

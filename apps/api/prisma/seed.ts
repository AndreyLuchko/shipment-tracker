// apps/api/prisma/seed.ts
// `prisma db seed`: idempotent — inserts what is missing, never touches an existing row.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { describeTarget, seedDemoData } from './seed-demo.js';

async function main(): Promise<number> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl === '') {
    console.error('DATABASE_URL is not set');
    return 2;
  }

  console.log(`Seeding demo data into ${describeTarget(databaseUrl)}`);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const { users, shipments, events, created } = await seedDemoData(prisma);
    console.log(`Seeded ${users} users, ${shipments} shipments (${created} new), ${events} events.`);
    return 0;
  } catch (error) {
    console.error(error);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

process.exitCode = await main();

// apps/api/prisma/demo-reset.ts
// `npm run db:demo-reset -w apps/api -- --confirm <host>`: wipes every user, shipment and event, then re-seeds.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { parseResetArgs } from './demo-reset-args.js';
import { resetDemoData } from './seed-demo.js';

async function main(): Promise<number> {
  const databaseUrl = process.env['DATABASE_URL'];
  const args = parseResetArgs(process.argv.slice(2), databaseUrl);
  if (args.kind === 'error') {
    console.error(args.message);
    return 2;
  }

  console.log(`Resetting demo data on ${args.target}`);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const { users, shipments, events } = await resetDemoData(prisma);
    console.log(`Reset demo data on ${args.target}: ${users} users, ${shipments} shipments, ${events} events.`);
    return 0;
  } catch (error) {
    console.error(error);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

process.exitCode = await main();

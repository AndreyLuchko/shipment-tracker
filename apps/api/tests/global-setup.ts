import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { toTestDatabaseUrl } from './helpers/test-database-url.js';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Creates the test database if missing and applies all migrations to it, once per Vitest run. */
export default async function setup(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  const testUrl = toTestDatabaseUrl(databaseUrl);
  const testName = new URL(testUrl).pathname.slice(1);

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [testName]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${testName.replaceAll('"', '""')}"`);
    }
  } finally {
    await client.end();
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });
}

// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loginSchema } from '@shipment-tracker/shared';
import { describe, expect, it } from 'vitest';

import { DEMO_ACCOUNTS } from '@/lib/demo-accounts';

const SEED = readFileSync(fileURLToPath(new URL('../../../api/prisma/seed-demo.ts', import.meta.url)), 'utf8');

describe('DEMO_ACCOUNTS', () => {
  it('lists the seeded dispatcher and client, in that order', () => {
    expect(DEMO_ACCOUNTS).toEqual([
      { label: 'Demo dispatcher', email: 'dispatcher@demo.dev', password: 'dispatcher123' },
      { label: 'Demo client', email: 'client@demo.dev', password: 'client123' },
    ]);
  });

  it.each(DEMO_ACCOUNTS)('$label passes the login schema', ({ email, password }) => {
    expect(loginSchema.safeParse({ email, password }).success).toBe(true);
  });

  it.each(DEMO_ACCOUNTS)('$label is still created by the seed with this password', ({ email, password }) => {
    expect(SEED).toContain(`email: '${email}'`);
    expect(SEED).toContain(`hashPassword('${password}')`);
  });
});

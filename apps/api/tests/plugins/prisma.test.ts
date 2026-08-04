import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('prisma plugin', () => {
  it('decorates the app with a connected Prisma client', async () => {
    const app = buildApp();
    await app.ready();

    const result = await app.prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 as result`;
    expect(result).toEqual([{ result: 1 }]);

    await app.close();
  });
});

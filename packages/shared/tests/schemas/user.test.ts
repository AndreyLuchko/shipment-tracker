import { describe, expect, it } from 'vitest';
import { userListResponseSchema, userSummarySchema } from '../../src/index.js';

const validUser = { id: 'u1', name: 'Olena', email: 'olena@example.com' };

describe('userSummarySchema', () => {
  it('accepts a valid user summary', () => {
    expect(userSummarySchema.safeParse(validUser).success).toBe(true);
  });

  it('strips passwordHash, role and createdAt', () => {
    const result = userSummarySchema.safeParse({
      ...validUser,
      passwordHash: 'x',
      role: 'CLIENT',
      createdAt: '2026-11-12T08:00:00.000Z',
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(validUser);
  });

  it('rejects a missing email', () => {
    const result = userSummarySchema.safeParse({ id: 'u1', name: 'Olena' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(['email']);
  });
});

describe('userListResponseSchema', () => {
  it('accepts an empty list', () => {
    expect(userListResponseSchema.safeParse({ items: [] }).success).toBe(true);
  });

  it('rejects a body without items', () => {
    const result = userListResponseSchema.safeParse({ users: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(['items']);
  });
});

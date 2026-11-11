import { describe, expect, it } from 'vitest';
import { loginSchema, publicUserSchema, registerSchema, roleSchema } from '../../src/index.js';

const validRegister = { email: '  Client@Demo.DEV ', password: 'password1', name: ' Olena ' };
const validPublicUser = {
  id: 'u1',
  email: 'a@b.co',
  name: 'A',
  role: 'CLIENT',
  createdAt: '2026-11-11T10:00:00.000Z',
};

describe('registerSchema', () => {
  it('normalizes email and name, keeps password, defaults role to CLIENT', () => {
    const result = registerSchema.safeParse(validRegister);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ email: 'client@demo.dev', password: 'password1', name: 'Olena', role: 'CLIENT' });
  });

  it('accepts role DISPATCHER', () => {
    const result = registerSchema.safeParse({ ...validRegister, role: 'DISPATCHER' });
    expect(result.success).toBe(true);
    expect(result.data?.role).toBe('DISPATCHER');
  });

  it('rejects an unknown role', () => {
    const result = registerSchema.safeParse({ ...validRegister, role: 'ADMIN' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join('.') === 'role')).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = registerSchema.safeParse({ ...validRegister, email: 'not-an-email' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['email']);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({ ...validRegister, password: '1234567' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['password']);
  });

  it('rejects a password longer than 128 characters', () => {
    const result = registerSchema.safeParse({ ...validRegister, password: 'x'.repeat(129) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['password']);
  });

  it('does not trim the password', () => {
    const result = registerSchema.safeParse({ ...validRegister, password: '  spaced pw  ' });
    expect(result.success).toBe(true);
    expect(result.data?.password).toBe('  spaced pw  ');
  });

  it('rejects a whitespace-only name', () => {
    const result = registerSchema.safeParse({ ...validRegister, name: '   ' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['name']);
  });

  it('rejects a name longer than 100 characters', () => {
    const result = registerSchema.safeParse({ ...validRegister, name: 'x'.repeat(101) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['name']);
  });

  it('strips unknown keys', () => {
    const result = registerSchema.safeParse({ ...validRegister, passwordHash: 'x', id: 'forced' });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('passwordHash');
    expect(result.data).not.toHaveProperty('id');
  });
});

describe('loginSchema', () => {
  it('normalizes the email', () => {
    const result = loginSchema.safeParse({ email: ' Client@Demo.dev', password: 'x' });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('client@demo.dev');
  });

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({ email: 'client@demo.dev', password: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['password']);
  });

  it('rejects a missing email', () => {
    const result = loginSchema.safeParse({ password: 'x' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['email']);
  });
});

describe('publicUserSchema', () => {
  it('accepts a valid public user', () => {
    expect(publicUserSchema.safeParse(validPublicUser).success).toBe(true);
  });

  it('rejects a non-ISO createdAt', () => {
    const result = publicUserSchema.safeParse({ ...validPublicUser, createdAt: 'yesterday' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['createdAt']);
  });

  it('strips passwordHash', () => {
    const result = publicUserSchema.safeParse({ ...validPublicUser, passwordHash: 'x' });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('passwordHash');
  });
});

describe('roleSchema', () => {
  it('lists DISPATCHER and CLIENT', () => {
    expect(roleSchema.options).toEqual(['DISPATCHER', 'CLIENT']);
  });
});

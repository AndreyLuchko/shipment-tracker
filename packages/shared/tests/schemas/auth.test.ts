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

describe('validation messages', () => {
  const validLogin = { email: 'client@demo.dev', password: 'x' };

  function messagesAt(
    result: { error?: { issues: { path: PropertyKey[]; message: string }[] } },
    field: string,
  ): string[] {
    return result.error?.issues.filter((issue) => issue.path.join('.') === field).map((issue) => issue.message) ?? [];
  }

  describe('registerSchema', () => {
    it('explains an invalid email', () => {
      const result = registerSchema.safeParse({ ...validRegister, email: 'not-an-email' });
      expect(messagesAt(result, 'email')).toEqual(['Enter a valid email address']);
    });

    it.each(['', '   '])('explains an empty email %j', (email) => {
      const result = registerSchema.safeParse({ ...validRegister, email });
      expect(messagesAt(result, 'email')).toEqual(['Enter a valid email address']);
    });

    it('explains an email longer than 254 characters', () => {
      const result = registerSchema.safeParse({ ...validRegister, email: 'a'.repeat(250) + '@b.co' });
      expect(messagesAt(result, 'email')).toEqual(['Email must be at most 254 characters']);
    });

    it.each(['1234567', ''])('explains a password shorter than 8 characters %j', (password) => {
      const result = registerSchema.safeParse({ ...validRegister, password });
      expect(messagesAt(result, 'password')).toEqual(['Password must be at least 8 characters']);
    });

    it('explains a password longer than 128 characters', () => {
      const result = registerSchema.safeParse({ ...validRegister, password: 'x'.repeat(129) });
      expect(messagesAt(result, 'password')).toEqual(['Password must be at most 128 characters']);
    });

    it.each(['   ', ''])('explains an empty name %j', (name) => {
      const result = registerSchema.safeParse({ ...validRegister, name });
      expect(messagesAt(result, 'name')).toEqual(['Enter your name']);
    });

    it('explains a name longer than 100 characters', () => {
      const result = registerSchema.safeParse({ ...validRegister, name: 'x'.repeat(101) });
      expect(messagesAt(result, 'name')).toEqual(['Name must be at most 100 characters']);
    });

    it('gives one message per field when every field is empty', () => {
      const result = registerSchema.safeParse({ email: '', password: '', name: '' });
      expect(messagesAt(result, 'email')).toEqual(['Enter a valid email address']);
      expect(messagesAt(result, 'password')).toEqual(['Password must be at least 8 characters']);
      expect(messagesAt(result, 'name')).toEqual(['Enter your name']);
    });

    it('still accepts and normalizes a valid input', () => {
      const result = registerSchema.safeParse(validRegister);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ email: 'client@demo.dev', password: 'password1', name: 'Olena', role: 'CLIENT' });
    });
  });

  describe('loginSchema', () => {
    it('explains an invalid email', () => {
      const result = loginSchema.safeParse({ ...validLogin, email: 'nope' });
      expect(messagesAt(result, 'email')).toEqual(['Enter a valid email address']);
    });

    it('explains an empty password', () => {
      const result = loginSchema.safeParse({ ...validLogin, password: '' });
      expect(messagesAt(result, 'password')).toEqual(['Enter your password']);
    });

    it('explains a password longer than 128 characters', () => {
      const result = loginSchema.safeParse({ ...validLogin, password: 'x'.repeat(129) });
      expect(messagesAt(result, 'password')).toEqual(['Password must be at most 128 characters']);
    });
  });
});

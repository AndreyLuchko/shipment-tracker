import { Prisma, type PrismaClient, type User } from '@prisma/client';
import type { PublicUser, RegisterInput } from '@shipment-tracker/shared';
import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';

/** The only shape of a user that leaves this module: never carries `passwordHash`. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Creates a user. The unique index on `email` is the only duplicate check — a `findUnique` pre-check would
 * race with a concurrent registration of the same address.
 */
export async function registerUser(prisma: PrismaClient, input: RegisterInput): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({
      data: { email: input.email, passwordHash, name: input.name, role: input.role },
    });
    return toPublicUser(user);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'EMAIL_TAKEN', 'Email is already registered');
    }
    throw error;
  }
}

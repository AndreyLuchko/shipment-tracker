import { z } from 'zod';

// Internal to `packages/shared`: imported by the schema modules, not re-exported from `index.ts`.

/** Trimmed text of `min`–`max` characters without NUL (Postgres cannot store `\u0000` in `text`). */
export function cleanText(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !value.includes('\u0000'), { message: 'Must not contain NUL characters' });
}

/** Optional trimmed text of at most `max` characters; empty after trimming parses to `undefined`. */
export function optionalCleanText(max: number) {
  return cleanText(0, max)
    .transform((value) => (value === '' ? undefined : value))
    .optional();
}

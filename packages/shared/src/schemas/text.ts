import { z } from 'zod';

// Internal to `packages/shared`: imported by the schema modules, not re-exported from `index.ts`.

/** Texts for the two length checks; a check without one keeps Zod's default wording. */
export interface TextMessages {
  min?: string;
  max?: string;
}

/** Trimmed text of `min`–`max` characters without NUL (Postgres cannot store `\u0000` in `text`). */
export function cleanText(min: number, max: number, messages: TextMessages = {}) {
  return z
    .string()
    .trim()
    .min(min, messages.min)
    .max(max, messages.max)
    .refine((value) => !value.includes('\u0000'), { message: 'Must not contain NUL characters' });
}

/** Optional trimmed text of at most `max` characters; empty after trimming parses to `undefined`. */
export function optionalCleanText(max: number, maxMessage?: string) {
  return cleanText(0, max, { max: maxMessage })
    .transform((value) => (value === '' ? undefined : value))
    .optional();
}

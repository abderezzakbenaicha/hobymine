import { z } from 'zod';
import { ApiError } from './http.js';

export function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(
      400,
      result.error.issues[0]?.message ?? 'Invalid request',
      'validation_error',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export const interestsSchema = z
  .array(z.string().trim().min(1).max(32))
  .max(12, 'Pick up to 12 interests')
  .transform((items) => [...new Set(items)]);

/** A short, deduplicated tag list used by lifestyle and language fields. */
export const tagListSchema = (limit: number, label: string) =>
  z
    .array(z.string().trim().min(1).max(32))
    .max(limit, `Pick up to ${limit} ${label}`)
    .transform((items) => [...new Set(items)]);

/** Hard cap for the recorded self-introduction, enforced on both ends. */
export const MAX_VOICE_INTRO_SECONDS = 20;

export const RELATIONSHIP_GOALS = [
  'Long-term relationship',
  'Short-term, open to long',
  'Something casual',
  'Friends first',
  'Still figuring it out',
] as const;

export const publicUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) =>
      value.startsWith('/uploads/') ||
      value.startsWith('/seed/') ||
      value.startsWith('/sounds/') ||
      /^https?:\/\//.test(value),
    'Invalid media URL',
  );

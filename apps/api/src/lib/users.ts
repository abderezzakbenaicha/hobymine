import { sql } from '../db/index.js';
import type { PreferenceRow, UserRow } from '../types.js';
import { toMeUser } from './serialize.js';

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizeUser(row: UserRow): UserRow {
  return {
    ...row,
    interests: parseJsonArray(row.interests),
    lifestyle: parseJsonArray(row.lifestyle),
    languages: parseJsonArray(row.languages),
    height_cm:
      row.height_cm === null || row.height_cm === undefined
        ? null
        : Number(row.height_cm),
    relationship_goal: row.relationship_goal ?? '',
    voice_intro_url: row.voice_intro_url ?? null,
    voice_intro_duration:
      row.voice_intro_duration === null || row.voice_intro_duration === undefined
        ? null
        : Number(row.voice_intro_duration),
    voice_intro_updated_at: row.voice_intro_updated_at ?? null,
    photos: parseJsonArray(row.photos),
  };
}

export async function findUser(userId: string): Promise<UserRow | null> {
  const result = await sql<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
  const row = result.rows[0];
  return row ? normalizeUser(row) : null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const result = await sql<UserRow>('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  const row = result.rows[0];
  return row ? normalizeUser(row) : null;
}

export async function getPreferences(userId: string): Promise<PreferenceRow> {
  const result = await sql<PreferenceRow>(
    'SELECT * FROM preferences WHERE user_id = $1',
    [userId],
  );
  const existing = result.rows[0];
  if (existing) return existing;

  await sql(
    `INSERT INTO preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  const created = await sql<PreferenceRow>(
    'SELECT * FROM preferences WHERE user_id = $1',
    [userId],
  );
  return (
    created.rows[0] ?? {
      user_id: userId,
      interested_in: 'everyone',
      age_min: 21,
      age_max: 45,
      max_distance: 50,
      country_code: null,
      location_mode: 'global',
    }
  );
}

export async function getMe(userId: string) {
  const user = await findUser(userId);
  if (!user) return null;
  const preferences = await getPreferences(userId);
  return toMeUser(user, preferences);
}

export async function touchUser(userId: string): Promise<void> {
  await sql('UPDATE users SET last_active_at = NOW() WHERE id = $1', [userId]);
}

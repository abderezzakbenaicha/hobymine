import { sql } from '../db/index.js';
import type { UserRow } from '../types.js';
import { isPlus } from './serialize.js';

/**
 * Daily like budget for free members.
 *
 * Free members can send 15 likes (and Super Likes) per UTC day. HobyMine Plus
 * members are not limited. The counter lives on the server, so clearing the
 * app or changing device cannot reset it.
 */
export const FREE_DAILY_LIKE_LIMIT = 15;

export interface LikeAllowance {
  limit: number;
  used: number;
  remaining: number;
  /** UTC midnight when the free daily budget resets. */
  resetsAt: string;
  unlimited: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextResetAt(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  ).toISOString();
}

/** The member's current daily like budget. */
export async function getLikeAllowance(user: UserRow): Promise<LikeAllowance> {
  const result = await sql<{ likes: number }>(
    `SELECT likes FROM like_usage
     WHERE user_id = $1 AND day = $2`,
    [user.id, today()],
  );
  const used = Number(result.rows[0]?.likes ?? 0);
  const unlimited = isPlus(user);

  return {
    limit: FREE_DAILY_LIKE_LIMIT,
    used,
    remaining: unlimited
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, FREE_DAILY_LIKE_LIMIT - used),
    resetsAt: nextResetAt(),
    unlimited,
  };
}

/**
 * Atomically spends one like from today's budget. The conditional upsert means
 * two simultaneous likes can never both take the last slot.
 */
export async function consumeDailyLike(
  user: UserRow,
): Promise<{ allowed: boolean; allowance: LikeAllowance }> {
  if (isPlus(user)) {
    return { allowed: true, allowance: await getLikeAllowance(user) };
  }

  const updated = await sql<{ likes: number }>(
    `INSERT INTO like_usage (user_id, day, likes)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, day)
     DO UPDATE SET likes = like_usage.likes + 1
     WHERE like_usage.likes < $3
     RETURNING likes`,
    [user.id, today(), FREE_DAILY_LIKE_LIMIT],
  );

  return {
    allowed: updated.rows.length > 0,
    allowance: await getLikeAllowance(user),
  };
}

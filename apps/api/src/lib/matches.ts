import { sql } from '../db/index.js';
import type { MatchRow, UserRow } from '../types.js';
import { findUser } from './users.js';

export function otherUserId(match: MatchRow, userId: string): string {
  return match.user_a === userId ? match.user_b : match.user_a;
}

export async function getMatchForUser(
  matchId: string,
  userId: string,
): Promise<{ match: MatchRow; other: UserRow } | null> {
  const result = await sql<MatchRow>('SELECT * FROM matches WHERE id = $1', [matchId]);
  const match = result.rows[0];
  if (!match) return null;
  if (match.user_a !== userId && match.user_b !== userId) return null;
  const other = await findUser(otherUserId(match, userId));
  if (!other) return null;
  return { match, other };
}

export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const result = await sql<{ blocked: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)
     ) AS blocked`,
    [a, b],
  );
  return Boolean(result.rows[0]?.blocked);
}

export async function areMatched(userA: string, userB: string): Promise<boolean> {
  const result = await sql<{ matched: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM matches
       WHERE (user_a = $1 AND user_b = $2) OR (user_a = $2 AND user_b = $1)
     ) AS matched`,
    [userA, userB],
  );
  return Boolean(result.rows[0]?.matched);
}

export async function countLikesYou(userId: string): Promise<number> {
  const result = await sql<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM swipes s
     JOIN users u ON u.id = s.swiper_id
     WHERE s.target_id = $1
       AND s.action IN ('like', 'superlike')
       AND u.paused_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM matches m
         WHERE (m.user_a = $1 AND m.user_b = s.swiper_id)
            OR (m.user_b = $1 AND m.user_a = s.swiper_id)
       )
       AND NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_id = $1 AND b.blocked_id = s.swiper_id)
            OR (b.blocker_id = s.swiper_id AND b.blocked_id = $1)
       )`,
    [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function getBlockedIds(userId: string): Promise<Set<string>> {
  const result = await sql<{ blocker_id: string; blocked_id: string }>(
    `SELECT blocker_id, blocked_id FROM blocks
     WHERE blocker_id = $1 OR blocked_id = $1`,
    [userId],
  );
  const ids = new Set<string>();
  for (const row of result.rows) {
    ids.add(row.blocker_id === userId ? row.blocked_id : row.blocker_id);
  }
  return ids;
}

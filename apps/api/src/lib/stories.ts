import { sql } from '../db/index.js';
import type { StoryRow } from '../types.js';

/** Stories live for exactly 24 hours. */
export const STORY_TTL_MS = 24 * 60 * 60 * 1000;

/** Longest caption a story may carry. */
export const STORY_CAPTION_MAX = 140;

export function expiresAt(from = new Date()): string {
  return new Date(from.getTime() + STORY_TTL_MS).toISOString();
}

/**
 * Removes expired stories. Cheap enough to run on every read, and it keeps the
 * table (and its cascaded likes/views) from growing without bound.
 */
export async function pruneExpiredStories(): Promise<void> {
  await sql('DELETE FROM stories WHERE expires_at <= NOW()').catch(() => undefined);
}

/** Ids of everyone this member has matched with. */
export async function matchedUserIds(userId: string): Promise<string[]> {
  const result = await sql<{ other: string }>(
    `SELECT CASE WHEN user_a = $1 THEN user_b ELSE user_a END AS other
     FROM matches
     WHERE user_a = $1 OR user_b = $1`,
    [userId],
  );
  return result.rows.map((row) => row.other);
}

/**
 * The privacy gate for single-story reads. A story is reachable only by its
 * author and by members who matched with the author; everything else is "not
 * found" rather than "forbidden", so the existence of a story never leaks.
 */
export async function getStoryForViewer(
  storyId: string,
  viewerId: string,
): Promise<{ story: StoryRow; isOwner: boolean } | null> {
  const result = await sql<StoryRow>(
    `SELECT s.* FROM stories s
     WHERE s.id = $1
       AND s.expires_at > NOW()
       AND (
         s.user_id = $2
         OR EXISTS (
           SELECT 1 FROM matches m
           WHERE (m.user_a = s.user_id AND m.user_b = $2)
              OR (m.user_b = s.user_id AND m.user_a = $2)
         )
       )`,
    [storyId, viewerId],
  );
  const story = result.rows[0];
  if (!story) return null;
  return { story, isOwner: story.user_id === viewerId };
}

/**
 * True when the two members share a match and neither has blocked the other.
 * Used before a story reply is allowed to open a conversation.
 */
export async function canMessageStoryAuthor(
  viewerId: string,
  authorId: string,
): Promise<boolean> {
  if (viewerId === authorId) return false;
  const result = await sql<{ ok: boolean }>(
    `SELECT (
       EXISTS (
         SELECT 1 FROM matches m
         WHERE (m.user_a = $1 AND m.user_b = $2) OR (m.user_a = $2 AND m.user_b = $1)
       )
       AND NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_id = $1 AND b.blocked_id = $2)
            OR (b.blocker_id = $2 AND b.blocked_id = $1)
       )
     ) AS ok`,
    [viewerId, authorId],
  );
  return Boolean(result.rows[0]?.ok);
}

/** Total likes on a story. The only counter the author is ever shown. */
export async function storyLikeCount(storyId: string): Promise<number> {
  const result = await sql<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM story_likes WHERE story_id = $1',
    [storyId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
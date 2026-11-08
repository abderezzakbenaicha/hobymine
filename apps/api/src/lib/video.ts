import { sql } from '../db/index.js';
import { isPlus } from './serialize.js';
import type { UserRow } from '../types.js';

/**
 * Video calling on HobyMine.
 *
 * Every free account gets exactly one minute of video calling to try the
 * feature. Once that minute is spent, video calling asks the member to upgrade
 * to HobyMine Plus. Plus members have no video limit at all. The counter is
 * lifetime (not daily), because the trial is a one-time introduction.
 */
export const FREE_VIDEO_TRIAL_SECONDS = 60;

export interface VideoAllowance {
  plan: 'free' | 'plus';
  /** Seconds already spent, lifetime. */
  secondsUsed: number;
  /** The free trial length. */
  secondsLimit: number;
  remainingSeconds: number;
  canVideo: boolean;
}

export async function getVideoAllowance(user: UserRow): Promise<VideoAllowance> {
  const plus = isPlus(user);
  const result = await sql<{ seconds_used: number }>(
    'SELECT seconds_used FROM video_usage WHERE user_id = $1',
    [user.id],
  );
  const secondsUsed = Math.max(0, Number(result.rows[0]?.seconds_used ?? 0));

  if (plus) {
    return {
      plan: 'plus',
      secondsUsed,
      secondsLimit: Number.MAX_SAFE_INTEGER,
      remainingSeconds: Number.MAX_SAFE_INTEGER,
      canVideo: true,
    };
  }

  const remainingSeconds = Math.max(0, FREE_VIDEO_TRIAL_SECONDS - secondsUsed);
  return {
    plan: 'free',
    secondsUsed,
    secondsLimit: FREE_VIDEO_TRIAL_SECONDS,
    remainingSeconds,
    canVideo: remainingSeconds > 0,
  };
}

/** Adds watched video seconds to a member's lifetime trial counter. */
export async function recordVideoSeconds(userId: string, seconds: number): Promise<void> {
  const value = Math.max(0, Math.min(60 * 60, Math.round(seconds)));
  if (value === 0) return;
  await sql(
    `INSERT INTO video_usage (user_id, seconds_used, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET seconds_used = video_usage.seconds_used + $2, updated_at = NOW()`,
    [userId, value],
  );
}

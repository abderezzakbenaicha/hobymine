import { sql } from '../db/index.js';
import { isPlus } from './serialize.js';
import type { UserRow } from '../types.js';

/**
 * Fair usage for 1-on-1 calls.
 *
 * Free members can call and — importantly — always *receive* calls. They are
 * limited by a daily budget of calls and talk time. HobyMine Plus members are
 * not limited at all.
 */
export const FREE_CALLS_PER_DAY = 3;
export const FREE_CALL_SECONDS_PER_DAY = 10 * 60;

export interface CallAllowance {
  plan: 'free' | 'plus';
  callsUsed: number;
  callsLimit: number;
  secondsUsed: number;
  secondsLimit: number;
  remainingCalls: number;
  remainingSeconds: number;
  canCall: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getCallAllowance(user: UserRow): Promise<CallAllowance> {
  const plus = isPlus(user);
  const result = await sql<{ calls: number; seconds: number }>(
    `SELECT calls, seconds FROM call_usage
     WHERE user_id = $1 AND day = $2`,
    [user.id, today()],
  );
  const row = result.rows[0];
  const callsUsed = Number(row?.calls ?? 0);
  const secondsUsed = Number(row?.seconds ?? 0);
  const callsLimit = plus ? FREE_CALLS_PER_DAY : FREE_CALLS_PER_DAY;
  const secondsLimit = plus ? FREE_CALL_SECONDS_PER_DAY : FREE_CALL_SECONDS_PER_DAY;

  if (plus) {
    return {
      plan: 'plus',
      callsUsed,
      callsLimit,
      secondsUsed,
      secondsLimit,
      remainingCalls: Number.MAX_SAFE_INTEGER,
      remainingSeconds: Number.MAX_SAFE_INTEGER,
      canCall: true,
    };
  }

  const remainingCalls = Math.max(0, callsLimit - callsUsed);
  const remainingSeconds = Math.max(0, secondsLimit - secondsUsed);
  return {
    plan: 'free',
    callsUsed,
    callsLimit,
    secondsUsed,
    secondsLimit,
    remainingCalls,
    remainingSeconds,
    canCall: remainingCalls > 0 && remainingSeconds > 0,
  };
}

/** Counts a call that was answered. */
export async function recordCallStarted(userId: string): Promise<void> {
  await sql(
    `INSERT INTO call_usage (user_id, day, calls, seconds)
     VALUES ($1, $2, 1, 0)
     ON CONFLICT (user_id, day) DO UPDATE SET calls = call_usage.calls + 1`,
    [userId, today()],
  );
}

/** Adds the talk time of a finished call. */
export async function recordCallSeconds(userId: string, seconds: number): Promise<void> {
  const value = Math.max(0, Math.min(60 * 60 * 3, Math.round(seconds)));
  if (value === 0) return;
  await sql(
    `INSERT INTO call_usage (user_id, day, calls, seconds)
     VALUES ($1, $2, 0, $3)
     ON CONFLICT (user_id, day) DO UPDATE SET seconds = call_usage.seconds + $3`,
    [userId, today(), value],
  );
}

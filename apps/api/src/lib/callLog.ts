import { sql } from '../db/index.js';
import { emitToMatch } from './realtime.js';
import { toChatMessage } from './serialize.js';
import type { MessageRow } from '../types.js';

interface CallLogInput {
  matchId: string;
  /** Person who started the call; the card is aligned to their side. */
  callerId: string;
  /** Client-generated id that makes retries and double hangups idempotent. */
  callId: string;
  /**
   * Seconds the call was connected, or null when it was never answered
   * (ringing, declined, cancelled). A null duration is what the client renders
   * as "No answer".
   */
  seconds: number | null;
  type?: 'voice' | 'video';
}

/**
 * Turns a finished call into a regular chat message with kind = 'call'.
 *
 * Keeping call history in the messages table means it is ordered with the rest
 * of the conversation, paginates with it and shows up in the chat list without
 * a second timeline to merge. WhatsApp-style cards are rendered on the client
 * from the sender, duration and created_at fields.
 *
 * Missed calls are stored too, with duration = NULL, so a call that rang out or
 * was declined still leaves the "No answer" card on both people's screens.
 * The first insert for a call wins, so a late signal from the other participant
 * can never overwrite a connected call with a missed one.
 */
export async function recordCallLog(input: CallLogInput): Promise<void> {
  const duration =
    input.seconds === null
      ? null
      : Math.max(0, Math.min(24 * 60 * 60, Math.round(input.seconds)));

  const result = await sql<MessageRow>(
    `INSERT INTO messages (id, match_id, sender_id, kind, body, duration, created_at)
     VALUES ($1, $2, $3, 'call', $4, $5, NOW())
     ON CONFLICT (id) DO NOTHING
     RETURNING *`,
    [`calllog_${input.callId}`, input.matchId, input.callerId, input.type ?? 'voice', duration],
  );

  const row = result.rows[0];
  if (row) emitToMatch(input.matchId, 'message:new', toChatMessage(row));
}

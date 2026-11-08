import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from '../db/index.js';
import { authRequired, type AuthRequest } from '../lib/auth.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import {
  countLikesYou,
  getBlockedIds,
  getMatchForUser,
  isBlockedBetween,
} from '../lib/matches.js';
import { emitMessageToMatch, emitToMatch, emitToUser } from '../lib/realtime.js';
import { toChatMessage, toPublicUser } from '../lib/serialize.js';
import { findUser, touchUser } from '../lib/users.js';
import { parseBody, publicUrlSchema } from '../lib/validation.js';
import type {
  ChatMessage,
  MatchRow,
  MatchSummary,
  MessageRow,
  ReactionSummary,
  UserRow,
} from '../types.js';

export const matchesRouter = Router();

matchesRouter.use(authRequired);

function parseArray(value: unknown): string[] {
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

function normalizeUserRow(row: UserRow): UserRow {
  return { ...row, interests: parseArray(row.interests), photos: parseArray(row.photos) };
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function buildSummaries(userId: string, matchRows: MatchRow[]): Promise<MatchSummary[]> {
  if (matchRows.length === 0) return [];
  const me = await findUser(userId);
  if (!me) return [];

  const blocked = await getBlockedIds(userId);
  const otherIds = matchRows
    .map((match) => (match.user_a === userId ? match.user_b : match.user_a))
    .filter((id) => !blocked.has(id));
  if (otherIds.length === 0) return [];

  const usersResult = await sql<UserRow>(
    'SELECT * FROM users WHERE id = ANY($1::text[])',
    [otherIds],
  );
  const users = new Map(
    usersResult.rows.map((row) => {
      const normalized = normalizeUserRow(row);
      return [normalized.id, normalized] as const;
    }),
  );

  const matchIds = matchRows
    .filter((match) => users.has(match.user_a === userId ? match.user_b : match.user_a))
    .map((match) => match.id);

  if (matchIds.length === 0) return [];

  const lastResult = await sql<MessageRow>(
    `SELECT DISTINCT ON (match_id) *
     FROM messages
     WHERE match_id = ANY($1::text[])
     ORDER BY match_id, created_at DESC`,
    [matchIds],
  );
  const lastByMatch = new Map(lastResult.rows.map((row) => [row.match_id, toChatMessage(row)]));

  const countsResult = await sql<{ match_id: string; count: number }>(
    `SELECT match_id, COUNT(*)::int AS count
     FROM messages
     WHERE match_id = ANY($1::text[]) AND sender_id <> $2 AND read_at IS NULL
     GROUP BY match_id`,
    [matchIds, userId],
  );
  const countByMatch = new Map(countsResult.rows.map((row) => [row.match_id, Number(row.count)]));

  const viewer = { lat: me.lat, lng: me.lng, interests: me.interests };
  const summaries: MatchSummary[] = [];

  for (const match of matchRows) {
    const otherId = match.user_a === userId ? match.user_b : match.user_a;
    const other = users.get(otherId);
    if (!other || blocked.has(otherId)) continue;
    const lastMessage = lastByMatch.get(match.id) ?? null;
    summaries.push({
      id: match.id,
      matchedAt: toIso(match.created_at),
      user: toPublicUser(other, viewer),
      lastMessage,
      unreadCount: countByMatch.get(match.id) ?? 0,
      isNew: !lastMessage,
    });
  }

  summaries.sort((a, b) => {
    const aTime = new Date(a.lastMessage?.createdAt ?? a.matchedAt).getTime();
    const bTime = new Date(b.lastMessage?.createdAt ?? b.matchedAt).getTime();
    return bTime - aTime;
  });

  return summaries;
}

matchesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const result = await sql<MatchRow>(
      'SELECT * FROM matches WHERE user_a = $1 OR user_b = $1 ORDER BY created_at DESC',
      [userId],
    );
    const matches = await buildSummaries(userId, result.rows);
    res.json({ matches, likesYouCount: await countLikesYou(userId) });
  }),
);

matchesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const matchId = req.params.id ?? '';
    const membership = await getMatchForUser(matchId, userId);
    if (!membership) throw new ApiError(404, 'Match not found', 'not_found');
    if (await isBlockedBetween(userId, membership.other.id)) {
      throw new ApiError(404, 'Match not found', 'not_found');
    }
    const summary = (await buildSummaries(userId, [membership.match]))[0];
    if (!summary) throw new ApiError(404, 'Match not found', 'not_found');
    res.json({ match: summary });
  }),
);

matchesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const matchId = req.params.id ?? '';
    const membership = await getMatchForUser(matchId, userId);
    if (!membership) throw new ApiError(404, 'Match not found', 'not_found');

    await sql('DELETE FROM matches WHERE id = $1', [matchId]);
    emitToUser(membership.other.id, 'match:removed', { matchId });
    emitToUser(userId, 'match:removed', { matchId });
    res.json({ ok: true });
  }),
);

const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🔥'] as const;

const reactionSchema = z.object({
  emoji: z.enum(REACTION_EMOJIS),
});

/** Short label of the message a reaction landed on, for the owner's alert. */
function reactionPreview(message: { kind: string; body: string }): string {
  const body = message.body.trim();
  if (body) return body.length > 80 ? `${body.slice(0, 77)}…` : body;
  if (message.kind === 'image') return 'a photo';
  if (message.kind === 'voice') return 'a voice message';
  if (message.kind === 'file') return 'a file';
  return 'your message';
}

/** Aggregated reactions for a set of messages. */
async function reactionsFor(
  messageIds: string[],
  userId: string,
): Promise<Map<string, ReactionSummary[]>> {
  const map = new Map<string, ReactionSummary[]>();
  if (messageIds.length === 0) return map;

  const result = await sql<{ message_id: string; emoji: string; count: number; mine: boolean }>(
    `SELECT r.message_id, r.emoji, COUNT(*)::int AS count,
            BOOL_OR(r.user_id = $2) AS mine
     FROM message_reactions r
     WHERE r.message_id = ANY($1::text[])
     GROUP BY r.message_id, r.emoji
     ORDER BY r.message_id, COUNT(*) DESC`,
    [messageIds, userId],
  );

  for (const row of result.rows) {
    const list = map.get(row.message_id) ?? [];
    list.push({ emoji: row.emoji, count: Number(row.count), mine: Boolean(row.mine) });
    map.set(row.message_id, list);
  }
  return map;
}

matchesRouter.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const matchId = req.params.id ?? '';
    const membership = await getMatchForUser(matchId, userId);
    if (!membership) throw new ApiError(404, 'Match not found', 'not_found');
    if (await isBlockedBetween(userId, membership.other.id)) {
      throw new ApiError(403, 'This conversation is unavailable', 'blocked');
    }

    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.limit ?? '60'), 10) || 60),
    );
    const beforeRaw = typeof req.query.before === 'string' ? req.query.before : null;
    const before = beforeRaw ? new Date(beforeRaw) : null;
    if (before && Number.isNaN(before.getTime())) {
      throw new ApiError(400, 'Invalid pagination cursor', 'invalid_cursor');
    }

    const result = await sql<MessageRow>(
      `SELECT * FROM messages
       WHERE match_id = $1
         AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
       ORDER BY created_at DESC
       LIMIT $3`,
      [matchId, before ? before.toISOString() : null, limit + 1],
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit).reverse();
    const reactions = await reactionsFor(
      rows.map((row) => row.id),
      userId,
    );
    res.json({
      messages: rows.map((row) => toChatMessage(row, reactions.get(row.id) ?? [])),
      hasMore,
    });
  }),
);

matchesRouter.post(
  '/:id/messages/:messageId/reactions',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const matchId = req.params.id ?? '';
    const messageId = req.params.messageId ?? '';
    const input = parseBody(reactionSchema, req.body);
    const membership = await getMatchForUser(matchId, userId);
    if (!membership) throw new ApiError(404, 'Match not found', 'not_found');

    const message = await sql<{ id: string; sender_id: string; kind: string; body: string }>(
      'SELECT id, sender_id, kind, body FROM messages WHERE id = $1 AND match_id = $2',
      [messageId, matchId],
    );
    if (!message.rows[0]) throw new ApiError(404, 'Message not found', 'not_found');
    const reactedMessage = message.rows[0];

    await sql(
      `INSERT INTO message_reactions (id, message_id, user_id, emoji)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (message_id, user_id)
       DO UPDATE SET emoji = EXCLUDED.emoji, created_at = NOW()`,
      [randomUUID(), messageId, userId, input.emoji],
    );

    const reactions = await reactionsFor([messageId], userId);
    const summary = reactions.get(messageId) ?? [];
    emitToMatch(matchId, 'message:reaction', {
      matchId,
      messageId,
      userId,
      reactions: summary,
    });

    // The owner of the message gets a dedicated real-time alert, even when the
    // reaction summary event only updates the bubbles. Reacting to your own
    // message never alerts.
    if (reactedMessage.sender_id !== userId) {
      const reactor = await sql<{ name: string }>('SELECT name FROM users WHERE id = $1', [
        userId,
      ]);
      emitToUser(reactedMessage.sender_id, 'message:reaction:received', {
        matchId,
        messageId,
        emoji: input.emoji,
        fromUserId: userId,
        fromName: reactor.rows[0]?.name ?? 'Someone',
        preview: reactionPreview(reactedMessage),
      });
    }

    res.json({ reactions: summary });
  }),
);

matchesRouter.delete(
  '/:id/messages/:messageId/reactions',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const matchId = req.params.id ?? '';
    const messageId = req.params.messageId ?? '';
    const membership = await getMatchForUser(matchId, userId);
    if (!membership) throw new ApiError(404, 'Match not found', 'not_found');

    await sql('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2', [
      messageId,
      userId,
    ]);

    const reactions = await reactionsFor([messageId], userId);
    const summary = reactions.get(messageId) ?? [];
    emitToMatch(matchId, 'message:reaction', {
      matchId,
      messageId,
      userId,
      reactions: summary,
    });
    res.json({ reactions: summary });
  }),
);

const messageSchema = z
  .object({
    kind: z.enum(['text', 'image', 'voice', 'file']).default('text'),
    body: z.string().trim().max(2000).default(''),
    mediaUrl: publicUrlSchema.optional(),
    fileName: z.string().trim().max(180).optional(),
    fileSize: z.coerce.number().int().min(0).max(25 * 1024 * 1024).optional(),
    duration: z.coerce.number().int().min(0).max(600).optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === 'text' && value.body.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: 'Write a message first',
      });
    }
    if (
      (value.kind === 'image' || value.kind === 'voice' || value.kind === 'file') &&
      !value.mediaUrl
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mediaUrl'],
        message: 'Media URL is required',
      });
    }
  });

matchesRouter.post(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const matchId = req.params.id ?? '';
    const input = parseBody(messageSchema, req.body);
    const membership = await getMatchForUser(matchId, userId);
    if (!membership) throw new ApiError(404, 'Match not found', 'not_found');
    if (await isBlockedBetween(userId, membership.other.id)) {
      throw new ApiError(403, 'This conversation is unavailable', 'blocked');
    }
    if (membership.other.is_bot) {
      throw new ApiError(403, 'Automated accounts cannot be chatted with.', 'bot_profile');
    }

    // Messages are not throttled on any plan. Kept as a membership guard so a
    // deleted account can never post through a still-valid session.
    const sender = await findUser(userId);
    if (!sender) throw new ApiError(404, 'Profile not found', 'not_found');

    // Trust gate: only verified profiles can message other members. The client
    // shows a verification screen, but the API is the source of truth so the
    // rule cannot be bypassed with a direct request.
    if (!sender.verified) {
      throw new ApiError(
        403,
        'Verify your profile before sending messages.',
        'verification_required',
        { feature: 'messaging' },
      );
    }

    const id = randomUUID();
    const createdAt = new Date();
    const row: MessageRow = {
      id,
      match_id: matchId,
      sender_id: userId,
      kind: input.kind ?? 'text',
      body: input.body ?? '',
      media_url: input.mediaUrl ?? null,
      file_name: input.kind === 'file' ? (input.fileName ?? 'Attachment') : null,
      file_size: input.kind === 'file' ? (input.fileSize ?? null) : null,
      duration: input.duration ?? null,
      read_at: null,
      created_at: createdAt.toISOString(),
    };

    await sql(
      `INSERT INTO messages
        (id, match_id, sender_id, kind, body, media_url, file_name, file_size, duration, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        row.id,
        row.match_id,
        row.sender_id,
        row.kind,
        row.body,
        row.media_url,
        row.file_name,
        row.file_size,
        row.duration,
        row.created_at,
      ],
    );
    await touchUser(userId);

    const message = toChatMessage(row);
    // The recipient also needs the sender's name for the in-app alert, since a
    // conversation that has not been opened yet has no local name to fall back on.
    emitMessageToMatch(matchId, membership.other.id, {
      ...message,
      senderName: sender.name,
    });

    // `cooldownUntil` stays in the payload as null for older installed clients
    // that still read the field. There is no message cooldown any more.
    res.status(201).json({ message, cooldownUntil: null });
  }),
);

matchesRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const matchId = req.params.id ?? '';
    const membership = await getMatchForUser(matchId, userId);
    if (!membership) throw new ApiError(404, 'Match not found', 'not_found');

    const readAt = new Date().toISOString();
    const updated = await sql<{ id: string }>(
      `UPDATE messages SET read_at = $1
       WHERE match_id = $2 AND sender_id <> $3 AND read_at IS NULL
       RETURNING id`,
      [readAt, matchId, userId],
    );

    if (updated.rows.length > 0) {
      emitToMatch(matchId, 'message:read', {
        matchId,
        readerId: userId,
        readAt,
      });
    }

    res.json({ readAt, count: updated.rows.length });
  }),
);

export type MessagesResponse = {
  messages: ChatMessage[];
  hasMore: boolean;
};

export type { MatchSummary };

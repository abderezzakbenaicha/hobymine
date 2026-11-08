import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from '../db/index.js';
import { authRequired, type AuthRequest } from '../lib/auth.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { emitMessageToMatch, emitToUser } from '../lib/realtime.js';
import { toChatMessage, toPublicUser } from '../lib/serialize.js';
import {
  canMessageStoryAuthor,
  expiresAt,
  getStoryForViewer,
  matchedUserIds,
  pruneExpiredStories,
  STORY_CAPTION_MAX,
  storyLikeCount,
} from '../lib/stories.js';
import { getMatchForUser } from '../lib/matches.js';
import { findUser, touchUser } from '../lib/users.js';
import { parseBody, publicUrlSchema } from '../lib/validation.js';
import type { ChatMessage, MessageRow, StoryRow } from '../types.js';

export const storiesRouter = Router();

storiesRouter.use(authRequired);

const createSchema = z.object({
  mediaUrl: publicUrlSchema,
  caption: z.string().trim().max(STORY_CAPTION_MAX).default(''),
});

const replySchema = z.object({
  body: z.string().trim().min(1, 'Write something first').max(500, 'Keep it under 500 characters'),
});

/**
 * The stories rail: the member's own active story first, then one group per
 * match who has posted in the last 24 hours.
 *
 * Privacy is enforced in SQL — the only authors that can appear are the viewer
 * and people the viewer has matched with.
 */
storiesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    await pruneExpiredStories();

    const rows = await sql<StoryRow & { likes: number; liked: boolean; seen: boolean }>(
      `SELECT s.*,
              (SELECT COUNT(*)::int FROM story_likes l WHERE l.story_id = s.id) AS likes,
              EXISTS (
                SELECT 1 FROM story_likes l WHERE l.story_id = s.id AND l.user_id = $1
              ) AS liked,
              EXISTS (
                SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.user_id = $1
              ) AS seen
       FROM stories s
       WHERE s.expires_at > NOW()
         AND (
           s.user_id = $1
           OR EXISTS (
             SELECT 1 FROM matches m
             WHERE (m.user_a = s.user_id AND m.user_b = $1)
                OR (m.user_b = s.user_id AND m.user_a = $1)
           )
         )
       ORDER BY s.created_at DESC`,
      [userId],
    );

    const authors = new Map<string, StoryGroup>();
    for (const row of rows.rows) {
      const mine = row.user_id === userId;
      let group = authors.get(row.user_id);
      if (!group) {
        const author = await findUser(row.user_id);
        if (!author || author.paused_at) continue;
        group = {
          user: toPublicUser(author),
          mine,
          storyCount: 0,
          updatedAt: new Date(row.created_at).toISOString(),
          seen: true,
          stories: [],
        };
        authors.set(row.user_id, group);
      }
      group.stories.push(
        toStoryItem(row, userId, Number(row.likes ?? 0), Boolean(row.liked), Boolean(row.seen)),
      );
      group.storyCount += 1;
      if (!row.seen) group.seen = false;
    }

    const groups = [...authors.values()].map((group) => ({
      ...group,
      // Oldest first inside a group, so a viewer walks the story forwards.
      stories: [...group.stories].reverse(),
    }));
    // The member's own story sits first, then unseen groups, then the rest.
    groups.sort((a, b) => {
      if (a.mine !== b.mine) return a.mine ? -1 : 1;
      if (a.seen !== b.seen) return a.seen ? 1 : -1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

    res.json({ stories: groups });
  }),
);

/** Post a story. Only matched members will ever see it. */
storiesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const input = parseBody(createSchema, req.body);
    const caption = input.caption ?? '';
    const author = await findUser(userId);
    if (!author) throw new ApiError(404, 'Profile not found', 'not_found');
    if (!author.verified) {
      throw new ApiError(403, 'Verify your profile to post a story.', 'verification_required', {
        feature: 'stories',
      });
    }

    const id = randomUUID();
    const expires = expiresAt();
    await sql(
      `INSERT INTO stories (id, user_id, media_url, caption, created_at, expires_at)
       VALUES ($1,$2,$3,$4,NOW(),$5)`,
      [id, userId, input.mediaUrl, caption, expires],
    );
    await touchUser(userId);

    const story: StoryItem = {
      id,
      mediaUrl: input.mediaUrl,
      caption,
      createdAt: new Date().toISOString(),
      expiresAt: expires,
      mine: true,
      likes: 0,
      liked: false,
      seen: true,
    };

    // Tell each match about the new story so their rail updates instantly.
    for (const matchUserId of await matchedUserIds(userId)) {
      emitToUser(matchUserId, 'story:new', {
        userId,
        story,
        author: toPublicUser(author),
      });
    }

    res.status(201).json({ story });
  }),
);

export interface StoryItem {
  id: string;
  mediaUrl: string;
  caption: string;
  createdAt: string;
  expiresAt: string;
  mine: boolean;
  /** Total likes on this story. View counts are never exposed. */
  likes: number;
  /** True when the signed in member liked this story. */
  liked: boolean;
  /** True when the signed in member already watched it. */
  seen: boolean;
}

interface StoryGroup {
  user: ReturnType<typeof toPublicUser>;
  mine: boolean;
  storyCount: number;
  /** When the newest story in the group was posted. */
  updatedAt: string;
  /** True when the member has watched every story in the group. */
  seen: boolean;
  stories: StoryItem[];
}

function toStoryItem(
  row: StoryRow,
  viewerId: string,
  likes: number,
  likedByMe: boolean,
  seenByMe: boolean,
): StoryItem {
  return {
    id: row.id,
    mediaUrl: row.media_url,
    caption: row.caption,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    mine: row.user_id === viewerId,
    likes,
    liked: likedByMe,
    seen: seenByMe,
  };
}

/** Mark a story as watched by the viewer. Never reported to the author. */
storiesRouter.post(
  '/:id/view',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const access = await getStoryForViewer(String(req.params.id ?? ''), userId);
    if (!access) throw new ApiError(404, 'Story not found', 'not_found');
    if (!access.isOwner) {
      await sql(
        `INSERT INTO story_views (story_id, user_id) VALUES ($1,$2)
         ON CONFLICT (story_id, user_id) DO NOTHING`,
        [access.story.id, userId],
      );
    }
    res.json({ ok: true });
  }),
);

/** The conversation id shared by two members, or null when they are not matched. */
async function findMatchBetween(a: string, b: string): Promise<string | null> {
  const [userA, userB] = [a, b].sort() as [string, string];
  const result = await sql<{ id: string }>(
    'SELECT id FROM matches WHERE user_a = $1 AND user_b = $2',
    [userA, userB],
  );
  const matchId = result.rows[0]?.id;
  if (!matchId) return null;
  return (await getMatchForUser(matchId, a)) ? matchId : null;
}

/**
 * Delivers a story reply or like as a normal chat message and pushes it to both
 * sides. The message carries a snapshot of the story so the recipient sees a
 * thumbnail above the text and knows exactly which story it refers to — that
 * snapshot is copied onto the row, so it survives the story's 24-hour expiry.
 */
async function deliverStoryMessage(input: {
  matchId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  body: string;
  story: StoryRow;
  event: 'reply' | 'like';
}): Promise<ChatMessage> {
  const row: MessageRow = {
    id: randomUUID(),
    match_id: input.matchId,
    sender_id: input.senderId,
    kind: 'text',
    body: input.body,
    media_url: null,
    file_name: null,
    file_size: null,
    duration: null,
    read_at: null,
    created_at: new Date().toISOString(),
    story_id: input.story.id,
    story_media_url: input.story.media_url,
    story_caption: input.story.caption,
    story_event: input.event,
  };

  await sql(
    `INSERT INTO messages
      (id, match_id, sender_id, kind, body, media_url, file_name, file_size, duration,
       created_at, story_id, story_media_url, story_caption, story_event)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
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
      row.story_id,
      row.story_media_url,
      row.story_caption,
      row.story_event,
    ],
  );
  await touchUser(input.senderId);

  const message = toChatMessage(row);
  // Include the sender's name so the recipient's alert is readable even before
  // the conversation list has loaded on their device.
  emitMessageToMatch(input.matchId, input.recipientId, {
    ...message,
    senderName: input.senderName,
  });
  return message;
}

/** Toggle a like. Returns the story's total, which is all the author sees. */
storiesRouter.post(
  '/:id/like',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const access = await getStoryForViewer(String(req.params.id ?? ''), userId);
    if (!access) throw new ApiError(404, 'Story not found', 'not_found');

    const existing = await sql('SELECT 1 FROM story_likes WHERE story_id = $1 AND user_id = $2', [
      access.story.id,
      userId,
    ]);
    const liked = existing.rows.length === 0;

    if (liked) {
      await sql(
        `INSERT INTO story_likes (story_id, user_id) VALUES ($1,$2)
         ON CONFLICT (story_id, user_id) DO NOTHING`,
        [access.story.id, userId],
      );
    } else {
      await sql('DELETE FROM story_likes WHERE story_id = $1 AND user_id = $2', [
        access.story.id,
        userId,
      ]);
    }

    const likes = await storyLikeCount(access.story.id);
    // The author only ever learns the tally, never who watched.
    if (!access.isOwner) {
      emitToUser(access.story.user_id, 'story:activity', {
        storyId: access.story.id,
        likes,
      });

      // A new like also lands in the conversation as a message with the story
      // preview, plus a dedicated event so the owner's device can alert them
      // with the thumbnail. Re-liking does not repeat it.
      if (liked) {
        const liker = await findUser(userId);
        const matchId = await findMatchBetween(userId, access.story.user_id);
        if (liker && matchId) {
          const already = await sql(
            `SELECT 1 FROM messages
             WHERE story_id = $1 AND sender_id = $2 AND story_event = 'like'`,
            [access.story.id, userId],
          );
          if (already.rows.length === 0) {
            const message = await deliverStoryMessage({
              matchId,
              senderId: userId,
              senderName: liker.name,
              recipientId: access.story.user_id,
              body: `${liker.name.split(' ')[0]} liked your story`,
              story: access.story,
              event: 'like',
            });
            emitToUser(access.story.user_id, 'story:like', {
              storyId: access.story.id,
              matchId,
              fromUserId: userId,
              fromName: liker.name,
              body: message.body,
              story: message.story,
            });
          }
        }
      }
    }
    res.json({ liked, likes });
  }),
);

/**
 * Reply to a story. The comment is delivered as a normal direct message into
 * the conversation, so the two of them can carry on chatting in the inbox.
 */
storiesRouter.post(
  '/:id/reply',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const input = parseBody(replySchema, req.body);
    const access = await getStoryForViewer(String(req.params.id ?? ''), userId);
    if (!access) throw new ApiError(404, 'Story not found', 'not_found');
    if (access.isOwner) {
      throw new ApiError(400, 'You cannot reply to your own story', 'own_story_reply');
    }
    if (!(await canMessageStoryAuthor(userId, access.story.user_id))) {
      throw new ApiError(403, 'This conversation is unavailable', 'blocked');
    }

    const viewer = await findUser(userId);
    if (!viewer) throw new ApiError(404, 'Profile not found', 'not_found');
    if (!viewer.verified) {
      throw new ApiError(403, 'Verify your profile before replying.', 'verification_required', {
        feature: 'messaging',
      });
    }

    // Find the conversation both members share.
    const authorId = access.story.user_id;
    const matchId = await findMatchBetween(userId, authorId);
    if (!matchId) throw new ApiError(404, 'Match not found', 'not_found');

    const message = await deliverStoryMessage({
      matchId,
      senderId: userId,
      senderName: viewer.name,
      recipientId: authorId,
      body: input.body,
      story: access.story,
      event: 'reply',
    });

    // Push an instant alert to the author, mirroring the like notification. The
    // payload carries the comment text and a story snapshot so their device can
    // show a preview even when the story later expires.
    emitToUser(authorId, 'story:comment', {
      storyId: access.story.id,
      matchId,
      fromUserId: userId,
      fromName: viewer.name,
      body: message.body,
      story: message.story,
    });

    res.status(201).json({ message, matchId });
  }),
);

/** Remove one of your own stories. */
storiesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const result = await sql<{ id: string }>(
      'DELETE FROM stories WHERE id = $1 AND user_id = $2 RETURNING id',
      [String(req.params.id ?? ''), userId],
    );
    if (result.rows.length === 0) throw new ApiError(404, 'Story not found', 'not_found');
    res.json({ ok: true });
  }),
);
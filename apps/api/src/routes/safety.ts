import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from '../db/index.js';
import { authRequired, type AuthRequest } from '../lib/auth.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { getBlockedIds } from '../lib/matches.js';
import { emitToUser } from '../lib/realtime.js';
import { toPublicUser } from '../lib/serialize.js';
import { findUser } from '../lib/users.js';
import { parseBody } from '../lib/validation.js';
import type { UserRow } from '../types.js';

export const safetyRouter = Router();

safetyRouter.use(authRequired);

const reasons = [
  'Inappropriate messages',
  'Fake profile',
  'Harassment',
  'Underage',
  'Spam or scam',
  'Other',
] as const;

const reportSchema = z.object({
  targetId: z.string().trim().min(1).max(64),
  reason: z.enum(reasons),
  details: z.string().trim().max(1000).default(''),
  block: z.boolean().default(false),
});

safetyRouter.post(
  '/reports',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const input = parseBody(reportSchema, req.body);
    if (input.targetId === userId) {
      throw new ApiError(400, 'You cannot report yourself', 'invalid_target');
    }
    const target = await findUser(input.targetId);
    if (!target) throw new ApiError(404, 'Profile not found', 'not_found');

    await sql(
      `INSERT INTO reports (id, reporter_id, target_id, reason, details)
       VALUES ($1,$2,$3,$4,$5)`,
      [randomUUID(), userId, input.targetId, input.reason, input.details],
    );

    if (input.block) {
      await sql(
        `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [userId, input.targetId],
      );
    }

    res.status(201).json({
      ok: true,
      message: 'Thanks — our safety team will review this report.',
      blocked: input.block,
    });
  }),
);

safetyRouter.get(
  '/blocks',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');
    const ids = [...(await getBlockedIds(userId))];
    if (ids.length === 0) {
      res.json({ blocked: [] });
      return;
    }
    const result = await sql<UserRow>('SELECT * FROM users WHERE id = ANY($1::text[])', [ids]);
    res.json({
      blocked: result.rows.map((row) =>
        toPublicUser(
          {
            ...row,
            interests: Array.isArray(row.interests) ? row.interests : [],
            photos: Array.isArray(row.photos) ? row.photos : [],
          },
          { lat: me.lat, lng: me.lng, interests: me.interests },
        ),
      ),
    });
  }),
);

safetyRouter.post(
  '/blocks/:targetId',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const targetId = req.params.targetId ?? '';
    if (targetId === userId) throw new ApiError(400, 'You cannot block yourself', 'invalid_target');
    const target = await findUser(targetId);
    if (!target) throw new ApiError(404, 'Profile not found', 'not_found');
    await sql(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [userId, targetId],
    );
    // Blocking ends the conversation for both people.
    const match = await sql<{ id: string }>(
      `SELECT id FROM matches
       WHERE (user_a = $1 AND user_b = $2) OR (user_b = $1 AND user_a = $2)`,
      [userId, targetId],
    );
    if (match.rows[0]) {
      await sql('DELETE FROM matches WHERE id = $1', [match.rows[0].id]);
      emitToUser(targetId, 'match:removed', { matchId: match.rows[0].id });
    }
    res.json({ ok: true });
  }),
);

safetyRouter.delete(
  '/blocks/:targetId',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const targetId = req.params.targetId ?? '';
    await sql('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [
      userId,
      targetId,
    ]);
    res.json({ ok: true });
  }),
);

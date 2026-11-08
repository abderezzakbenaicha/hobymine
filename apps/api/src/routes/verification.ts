import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from '../db/index.js';
import { authRequired, type AuthRequest } from '../lib/auth.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { mimeKind, upload } from '../lib/uploads.js';
import { getMe } from '../lib/users.js';
import { parseBody } from '../lib/validation.js';

export const verificationRouter = Router();

verificationRouter.use(authRequired);

const fallbackSchema = z.object({
  selfieUrl: z.string().trim().max(500).optional(),
});

verificationRouter.post(
  '/selfie',
  upload.single('selfie'),
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    let selfieUrl: string | null = null;

    if (req.file) {
      if (mimeKind(req.file.mimetype) !== 'image') {
        throw new ApiError(415, 'Selfie must be an image', 'unsupported_file_type');
      }
      selfieUrl = `/uploads/${req.file.filename}`;
    } else {
      const input = parseBody(fallbackSchema, req.body ?? {});
      selfieUrl = input.selfieUrl ?? '/seed/alex-1.svg';
    }

    // Demo review: auto-approved. Replace with a moderation queue in production.
    await sql(
      `INSERT INTO verifications (id, user_id, status, selfie_url)
       VALUES ($1,$2,'approved',$3)`,
      [randomUUID(), userId, selfieUrl],
    );
    await sql('UPDATE users SET verified = TRUE WHERE id = $1', [userId]);

    res.status(201).json({
      status: 'approved',
      reviewedAt: new Date().toISOString(),
      user: await getMe(userId),
      message: 'You’re verified. The green badge is now on your profile.',
    });
  }),
);

verificationRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const result = await sql<{
      status: string;
      selfie_url: string | null;
      created_at: string | Date;
    }>(
      `SELECT status, selfie_url, created_at
       FROM verifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    const row = result.rows[0];
    res.json({
      verified: Boolean(row?.status === 'approved'),
      status: row?.status ?? 'unverified',
      selfieUrl: row?.selfie_url ?? null,
      submittedAt: row?.created_at ? new Date(row.created_at).toISOString() : null,
    });
  }),
);

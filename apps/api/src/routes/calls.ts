import { Router } from 'express';
import { authRequired, type AuthRequest } from '../lib/auth.js';
import { getCallAllowance } from '../lib/calls.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { findUser } from '../lib/users.js';
import { getVideoAllowance } from '../lib/video.js';

export const callsRouter = Router();

callsRouter.use(authRequired);

callsRouter.get(
  '/allowance',
  asyncHandler(async (req, res) => {
    const user = await findUser((req as AuthRequest).userId);
    if (!user) throw new ApiError(404, 'Profile not found', 'not_found');
    res.json({
      allowance: await getCallAllowance(user),
      videoAllowance: await getVideoAllowance(user),
    });
  }),
);

/** The one-time free video minute (unlimited for HobyMine Plus). */
callsRouter.get(
  '/video-allowance',
  asyncHandler(async (req, res) => {
    const user = await findUser((req as AuthRequest).userId);
    if (!user) throw new ApiError(404, 'Profile not found', 'not_found');
    res.json({ videoAllowance: await getVideoAllowance(user) });
  }),
);

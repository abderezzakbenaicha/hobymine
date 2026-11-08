import { Router } from 'express';
import { z } from 'zod';
import { sql } from '../db/index.js';
import { authRequired, type AuthRequest } from '../lib/auth.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { isPlus } from '../lib/serialize.js';
import { findUser, getMe } from '../lib/users.js';
import { parseBody } from '../lib/validation.js';

export const plusRouter = Router();

plusRouter.use(authRequired);

export interface PlusPlan {
  id: 'weekly' | 'monthly' | 'yearly';
  label: string;
  /** Price in USD cents so the client never has to parse currency strings. */
  amount: number;
  currency: 'USD';
  cadence: 'per week' | 'per month' | 'per year';
  note: string;
  savingPercent: number;
}

export const PLUS_PLANS: Record<'weekly' | 'monthly' | 'yearly', PlusPlan> = {
  weekly: {
    id: 'weekly',
    label: 'Weekly',
    amount: 199,
    currency: 'USD',
    cadence: 'per week',
    note: 'Billed weekly · Cancel anytime',
    savingPercent: 0,
  },
  monthly: {
    id: 'monthly',
    label: 'Monthly',
    amount: 699,
    currency: 'USD',
    cadence: 'per month',
    note: 'Cancel anytime',
    savingPercent: 0,
  },
  yearly: {
    id: 'yearly',
    label: 'Yearly',
    amount: 3999,
    currency: 'USD',
    cadence: 'per year',
    note: 'Save 52% · $3.33/mo',
    savingPercent: 52,
  },
};

const subscribeSchema = z.object({
  plan: z.enum(['weekly', 'monthly', 'yearly']),
});

plusRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    res.json({ plans: Object.values(PLUS_PLANS) });
  }),
);

plusRouter.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const { plan } = parseBody(subscribeSchema, req.body);
    const user = await findUser(userId);
    if (!user) throw new ApiError(404, 'Profile not found', 'not_found');

    const base =
      user.plus_until && new Date(user.plus_until).getTime() > Date.now()
        ? new Date(user.plus_until).getTime()
        : Date.now();
    const duration = plan === 'yearly' ? 365 : plan === 'monthly' ? 30 : 7;
    const plusUntil = new Date(base + duration * 86_400_000);

    // Demo billing: no card is charged. Swap this handler for Stripe/RevenueCat
    // when wiring real payments.
    await sql(
      `UPDATE users
       SET plus = TRUE, plus_until = $1, read_receipts = TRUE
       WHERE id = $2`,
      [plusUntil.toISOString(), userId],
    );

    res.json({
      user: await getMe(userId),
      plan,
      amount: PLUS_PLANS[plan].amount,
      currency: PLUS_PLANS[plan].currency,
      plusUntil: plusUntil.toISOString(),
      receipt: {
        id: `demo_${Date.now()}`,
        status: 'paid',
        provider: 'demo',
      },
    });
  }),
);

plusRouter.post(
  '/cancel',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    await sql(
      `UPDATE users SET plus = FALSE, plus_until = NULL, boost_until = NULL
       WHERE id = $1`,
      [userId],
    );
    res.json({ user: await getMe(userId) });
  }),
);

const boostSchema = z.object({ enabled: z.boolean() });

plusRouter.post(
  '/boost',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const input = parseBody(boostSchema, req.body);
    const user = await findUser(userId);
    if (!user) throw new ApiError(404, 'Profile not found', 'not_found');
    if (!isPlus(user)) {
      throw new ApiError(402, 'Boost is a HobyMine Plus feature.', 'plus_required');
    }

    const boostUntil = input.enabled
      ? new Date(Date.now() + 30 * 60_000).toISOString()
      : null;
    await sql('UPDATE users SET boost_until = $1 WHERE id = $2', [boostUntil, userId]);
    res.json({ user: await getMe(userId), boostUntil });
  }),
);

const readReceiptsSchema = z.object({ enabled: z.boolean() });

plusRouter.patch(
  '/read-receipts',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const input = parseBody(readReceiptsSchema, req.body);
    const user = await findUser(userId);
    if (!user) throw new ApiError(404, 'Profile not found', 'not_found');
    if (!isPlus(user)) {
      throw new ApiError(402, 'Read receipts are a HobyMine Plus feature.', 'plus_required');
    }
    await sql('UPDATE users SET read_receipts = $1 WHERE id = $2', [
      input.enabled,
      userId,
    ]);
    res.json({ user: await getMe(userId) });
  }),
);

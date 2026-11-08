import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from '../db/index.js';
import { authRequired, type AuthRequest } from '../lib/auth.js';
import { countryByCode } from '../lib/countries.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import {
  areMatched,
  countLikesYou,
  getBlockedIds,
  isBlockedBetween,
} from '../lib/matches.js';
import {
  consumeDailyLike,
  FREE_DAILY_LIKE_LIMIT,
  getLikeAllowance,
} from '../lib/likeLimits.js';
import { emitToUser, joinUsersToMatch } from '../lib/realtime.js';
import { isPlus, toPublicUser } from '../lib/serialize.js';
import { findUser, getPreferences, normalizeUser, touchUser } from '../lib/users.js';
import { parseBody } from '../lib/validation.js';
import type { MatchSummary, PublicUser, UserRow } from '../types.js';

export const discoveryRouter = Router();

discoveryRouter.use(authRequired);

const genderForPreference: Record<string, string | null> = {
  women: 'woman',
  men: 'man',
  everyone: null,
};

discoveryRouter.get(
  '/discovery',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');
    // Discovery is a verified-only surface. The client renders a verification
    // gate, and this check keeps the deck inaccessible from a direct request.
    if (!me.verified) {
      throw new ApiError(
        403,
        'Verify your profile to unlock Discovery.',
        'verification_required',
        { feature: 'discovery' },
      );
    }
    const preferences = await getPreferences(userId);

    const wantedGender = genderForPreference[preferences.interested_in] ?? null;
    // An explicit country filter narrows the deck to that country. Without one
    // the viewer keeps seeing their own country no matter the distance slider.
    const filterCountry = preferences.country_code
      ? countryByCode(preferences.country_code)
      : null;
    const countryFilter = filterCountry?.code ?? null;
    const locationMode = preferences.location_mode;

    // "Nearby" measures distances from the shared GPS position, "global"
    // removes the distance bound entirely.
    const gps =
      me.latitude !== null && me.longitude !== null
        ? { lat: me.latitude, lng: me.longitude }
        : null;
    const countryAnchor = me.country_code ? countryByCode(me.country_code) : null;
    const anchor =
      filterCountry ??
      gps ??
      (countryAnchor ? { lat: countryAnchor.lat, lng: countryAnchor.lng } : null) ??
      { lat: me.lat, lng: me.lng };

    const result = await sql<UserRow>(
      `SELECT u.*
       FROM users u
       WHERE u.id <> $1
         AND u.is_bot = FALSE
         AND u.paused_at IS NULL
         AND ($2::text IS NULL OR u.gender = $2)
         AND u.age BETWEEN $3 AND $4
         AND ($5::text IS NULL OR u.country_code = $5)
         AND jsonb_array_length(u.photos) > 0
         AND NOT EXISTS (
           SELECT 1 FROM swipes s
           WHERE s.swiper_id = $1 AND s.target_id = u.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM matches m
           WHERE (m.user_a = $1 AND m.user_b = u.id)
              OR (m.user_b = $1 AND m.user_a = u.id)
         )
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
              OR (b.blocker_id = u.id AND b.blocked_id = $1)
         )
       ORDER BY
         EXISTS (
           SELECT 1 FROM swipes s2
           WHERE s2.swiper_id = u.id
             AND s2.target_id = $1
             AND s2.action IN ('like', 'superlike')
         ) DESC,
         ($5::text IS NOT NULL AND u.country_code = $5) DESC,
         ($6::text IS NOT NULL AND u.country_code = $6) DESC,
         (u.boost_until IS NOT NULL AND u.boost_until > NOW()) DESC,
         u.last_active_at DESC
       LIMIT 80`,
      [
        userId,
        wantedGender,
        preferences.age_min,
        preferences.age_max,
        countryFilter,
        me.country_code,
      ],
    );

    // Distances are measured from the filtered country, the shared GPS
    // position or the viewer's country anchor — whichever applies.
    const viewer = { lat: anchor.lat, lng: anchor.lng, interests: me.interests };
    const candidates = [];
    // "Nearby" is limited to the radius. "Worldwide" removes the bound
    // completely, unless a specific country was picked.
    const distanceLimited = locationMode === 'nearby' || Boolean(countryFilter);
    for (const row of result.rows) {
      const candidate = toPublicUser(normalizeUser(row), viewer);
      if (
        distanceLimited &&
        preferences.max_distance < 20_000 &&
        candidate.distanceKm !== null &&
        candidate.distanceKm > preferences.max_distance
      ) {
        continue;
      }
      candidates.push(candidate);
      if (candidates.length >= 30) break;
    }

    res.json({
      candidates,
      likesYouCount: await countLikesYou(userId),
      likeAllowance: await getLikeAllowance(me),
      filters: {
        interestedIn: preferences.interested_in,
        ageMin: preferences.age_min,
        ageMax: preferences.age_max,
        maxDistance: preferences.max_distance,
        countryCode: preferences.country_code,
        locationMode: preferences.location_mode,
      },
    });
  }),
);

function toLikeTeaser(user: PublicUser, index: number): PublicUser {
  return {
    id: `hidden-like-${index}`,
    name: 'Hidden admirer',
    age: user.age,
    gender: user.gender,
    bio: '',
    job: '',
    city: '',
    countryCode: '',
    countryName: '',
    countryFlag: '',
    interests: [],
    lifestyle: [],
    languages: [],
    heightCm: null,
    relationshipGoal: '',
    hasKids: null,
    wantsKids: null,
    kidsCount: null,
    hasPets: null,
    petTypes: [],
    petsCount: null,
    voiceIntro: null,
    photos: user.photos,
    verified: false,
    plus: false,
    online: false,
    lastActiveAt: user.lastActiveAt,
    distanceKm: null,
    sharedInterests: user.sharedInterests,
    isBot: false,
    memberSince: null,
  };
}

discoveryRouter.get(
  '/likes',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');
    const member = isPlus(me);

    const blocked = await getBlockedIds(userId);
    const result = await sql<UserRow>(
      `SELECT u.*
       FROM swipes s
       JOIN users u ON u.id = s.swiper_id
       WHERE s.target_id = $1
         AND s.action IN ('like', 'superlike')
         AND u.is_bot = FALSE
         AND u.paused_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM matches m
           WHERE (m.user_a = $1 AND m.user_b = u.id)
              OR (m.user_b = $1 AND m.user_a = u.id)
         )
       ORDER BY s.created_at DESC`,
      [userId],
    );

    const users = result.rows
      .filter((row) => !blocked.has(row.id))
      .map((row) =>
        toPublicUser(normalizeUser(row), {
          lat: me.lat,
          lng: me.lng,
          interests: me.interests,
        }),
      );

    // Free members get a blurred teaser grid instead of a bare paywall. The
    // photos are still returned so the client can render the blur, but names
    // and identifying profile details stay private until they upgrade.
    const visible = member
      ? users
      : users.map((user, index) => toLikeTeaser(user, index));

    res.json({ users: visible, count: users.length, limited: !member });
  }),
);

/** The profiles the member liked (their outgoing likes). */
discoveryRouter.get(
  '/likes/sent',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');

    const result = await sql<UserRow>(
      `SELECT u.* FROM swipes s
       JOIN users u ON u.id = s.target_id
       WHERE s.swiper_id = $1
         AND s.action IN ('like', 'superlike')
         AND u.is_bot = FALSE
         AND u.paused_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM matches m
           WHERE (m.user_a = $1 AND m.user_b = u.id)
              OR (m.user_b = $1 AND m.user_a = u.id)
         )
       ORDER BY s.created_at DESC
       LIMIT 60`,
      [userId],
    );

    const blocked = await getBlockedIds(userId);
    res.json({
      users: result.rows
        .filter((row) => !blocked.has(row.id))
        .map((row) =>
          toPublicUser(normalizeUser(row), {
            lat: me.lat,
            lng: me.lng,
            interests: me.interests,
          }),
        ),
    });
  }),
);

discoveryRouter.delete(
  '/swipes/:targetId',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');
    if (!isPlus(me)) {
      throw new ApiError(
        402,
        'Rewind is a HobyMine Plus feature. Upgrade to undo your last swipe.',
        'plus_required',
        { feature: 'rewind' },
      );
    }

    const targetId = req.params.targetId ?? '';
    if (await areMatched(userId, targetId)) {
      throw new ApiError(409, 'You already matched — rewind is no longer possible.', 'already_matched');
    }
    await sql('DELETE FROM swipes WHERE swiper_id = $1 AND target_id = $2', [
      userId,
      targetId,
    ]);
    res.json({ ok: true });
  }),
);

const swipeSchema = z.object({
  targetId: z.string().trim().min(1).max(64),
  action: z.enum(['like', 'pass', 'superlike']),
});

function matchSummary(matchRow: {
  id: string;
  created_at: string | Date;
}, user: ReturnType<typeof toPublicUser>): MatchSummary {
  return {
    id: matchRow.id,
    matchedAt:
      matchRow.created_at instanceof Date
        ? matchRow.created_at.toISOString()
        : new Date(matchRow.created_at).toISOString(),
    user,
    lastMessage: null,
    unreadCount: 0,
    isNew: true,
  };
}

discoveryRouter.post(
  '/swipes',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const input = parseBody(swipeSchema, req.body);
    if (input.targetId === userId) {
      throw new ApiError(400, 'You cannot swipe on yourself', 'invalid_target');
    }

    const me = await findUser(userId);
    const target = await findUser(input.targetId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');
    if (!target) throw new ApiError(404, 'That profile no longer exists', 'not_found');
    if (!me.verified) {
      throw new ApiError(
        403,
        'Verify your profile to start matching.',
        'verification_required',
        { feature: 'discovery' },
      );
    }
    if (await isBlockedBetween(userId, target.id)) {
      throw new ApiError(403, 'You cannot interact with this profile', 'blocked');
    }
    if (target.is_bot) {
      throw new ApiError(403, 'Automated accounts cannot be matched or chatted with.', 'bot_profile');
    }
    if (target.paused_at) {
      throw new ApiError(404, 'That profile no longer exists', 'not_found');
    }

    // Only a brand-new like or Super Like spends the free daily budget. Passing,
    // changing a pass into a like and liking the same person again are treated
    // as expected: the first counts, the rest are idempotent.
    const existing = await sql<{ action: string }>(
      'SELECT action FROM swipes WHERE swiper_id = $1 AND target_id = $2',
      [userId, target.id],
    );
    const alreadyLiked = Boolean(
      existing.rows[0] && existing.rows[0].action !== 'pass',
    );
    if (input.action !== 'pass' && !alreadyLiked && !isPlus(me)) {
      const spent = await consumeDailyLike(me);
      if (!spent.allowed) {
        throw new ApiError(
          402,
          `You have used all ${FREE_DAILY_LIKE_LIMIT} free likes for today. HobyMine Plus gives you unlimited likes.`,
          'like_limit',
          spent.allowance,
        );
      }
    }

    await sql(
      `INSERT INTO swipes (id, swiper_id, target_id, action, created_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (swiper_id, target_id)
       DO UPDATE SET action = EXCLUDED.action, created_at = NOW()`,
      [randomUUID(), userId, target.id, input.action],
    );
    await touchUser(userId);

    let match: MatchSummary | null = null;

    if (input.action !== 'pass') {
      const reciprocal = await sql<{ action: string }>(
        `SELECT action FROM swipes
         WHERE swiper_id = $1 AND target_id = $2 AND action IN ('like', 'superlike')
         LIMIT 1`,
        [target.id, userId],
      );

      if (reciprocal.rows.length > 0) {
        const [userA, userB] = [userId, target.id].sort() as [string, string];
        const inserted = await sql<{ id: string; created_at: string | Date }>(
          `INSERT INTO matches (id, user_a, user_b, created_at)
           VALUES ($1,$2,$3,NOW())
           ON CONFLICT (user_a, user_b) DO NOTHING
           RETURNING id, created_at`,
          [randomUUID(), userA, userB],
        );
        let matchRow = inserted.rows[0];
        if (!matchRow) {
          const existing = await sql<{ id: string; created_at: string | Date }>(
            'SELECT id, created_at FROM matches WHERE user_a = $1 AND user_b = $2',
            [userA, userB],
          );
          matchRow = existing.rows[0];
        }

        if (matchRow) {
          const forMe = toPublicUser(target, {
            lat: me.lat,
            lng: me.lng,
            interests: me.interests,
          });
          const forTarget = toPublicUser(me, {
            lat: target.lat,
            lng: target.lng,
            interests: target.interests,
          });
          match = matchSummary(matchRow, forMe);

          joinUsersToMatch([userId, target.id], matchRow.id);
          emitToUser(target.id, 'match:new', matchSummary(matchRow, forTarget));
          emitToUser(userId, 'match:new', match);
        }
      } else {
        // A one-way like: nothing else tells the recipient, so push it over the
        // socket. Without this the like only appeared after a manual refresh.
        const liker = toPublicUser(me, {
          lat: target.lat,
          lng: target.lng,
          interests: target.interests,
        });
        const createdAt = new Date().toISOString();
        emitToUser(
          target.id,
          input.action === 'superlike' ? 'superlike:received' : 'like:received',
          { user: liker, createdAt },
        );
      }
    }

    res.status(201).json({
      matched: Boolean(match),
      match,
      likesYouCount: await countLikesYou(userId),
      likeAllowance: await getLikeAllowance(me),
    });
  }),
);

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { z } from 'zod';
import { sql } from '../db/index.js';
import { authRequired, type AuthRequest } from '../lib/auth.js';
import { hashPassword, verifyPassword } from '../lib/auth.js';
import { countryByCode, isCountryCode } from '../lib/countries.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { isBlockedBetween, areMatched } from '../lib/matches.js';
import { emitToUser } from '../lib/realtime.js';
import { isPlus, toIso, toPublicUser } from '../lib/serialize.js';
import { upload, uploadsDir, mimeKind } from '../lib/uploads.js';
import { findUser, getMe, getPreferences } from '../lib/users.js';
import {
  interestsSchema,
  MAX_VOICE_INTRO_SECONDS,
  parseBody,
  publicUrlSchema,
  RELATIONSHIP_GOALS,
  tagListSchema,
} from '../lib/validation.js';
import type { PreferenceRow, PublicUser, UserRow } from '../types.js';
import path from 'node:path';

export const usersRouter = Router();

usersRouter.use(authRequired);

usersRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const me = await getMe((req as AuthRequest).userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');
    res.json({ user: me });
  }),
);

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(40).optional(),
    age: z.coerce.number().int().min(18).max(99).optional(),
    gender: z.enum(['woman', 'man', 'nonbinary']).optional(),
    bio: z.string().trim().max(500).optional(),
    job: z.string().trim().max(80).optional(),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .refine(isCountryCode, 'Choose a valid country')
      .optional(),
    interests: interestsSchema.optional(),
    lifestyle: tagListSchema(8, 'lifestyle tags').optional(),
    languages: tagListSchema(6, 'languages').optional(),
    heightCm: z.coerce.number().int().min(120).max(230).nullable().optional(),
    relationshipGoal: z
      .string()
      .trim()
      .max(40)
      .refine(
        (value) => value === '' || (RELATIONSHIP_GOALS as readonly string[]).includes(value),
        'Choose one of the listed relationship goals',
      )
      .optional(),
    hasKids: z.enum(['yes', 'no']).nullable().optional(),
    wantsKids: z.enum(['yes', 'no', 'maybe']).nullable().optional(),
    kidsCount: z.coerce.number().int().min(0).max(20).nullable().optional(),
    hasPets: z.enum(['yes', 'no']).nullable().optional(),
    petTypes: tagListSchema(6, 'pet types').optional(),
    petsCount: z.coerce.number().int().min(0).max(30).nullable().optional(),
    incognito: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

usersRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const input = parseBody(updateProfileSchema, req.body);

    const columns: string[] = [];
    const values: unknown[] = [];
    const columnPositions = new Map<string, number>();

    // A column can be set by more than one branch (for example `kids_count` is
    // cleared when kids are removed and also sent by the client). Keep one
    // assignment per column so Postgres never sees a duplicate target; the last
    // call wins.
    const push = (column: string, value: unknown, cast = ''): void => {
      const existing = columnPositions.get(column);
      if (existing !== undefined) {
        columns[existing] = `${column} = $${existing + 1}${cast}`;
        values[existing] = value;
        return;
      }
      const position = columns.length;
      columnPositions.set(column, position);
      columns.push(`${column} = $${position + 1}${cast}`);
      values.push(value);
    };

    if (input.name !== undefined) push('name', input.name);
    if (input.age !== undefined) push('age', input.age);
    if (input.gender !== undefined) push('gender', input.gender);
    if (input.bio !== undefined) push('bio', input.bio);
    if (input.job !== undefined) push('job', input.job);
    if (input.countryCode !== undefined) {
      const country = countryByCode(input.countryCode);
      if (!country) throw new ApiError(400, 'Choose a valid country', 'invalid_country');
      // Country is the only editable location field. Keep legacy city data out
      // of the profile so the two values cannot disagree.
      push('country_code', country.code);
      push('city', '');
      push('lat', country.lat);
      push('lng', country.lng);
    }
    if (input.interests !== undefined) {
      push('interests', JSON.stringify(input.interests), '::jsonb');
    }
    if (input.lifestyle !== undefined) {
      push('lifestyle', JSON.stringify(input.lifestyle), '::jsonb');
    }
    if (input.languages !== undefined) {
      push('languages', JSON.stringify(input.languages), '::jsonb');
    }
    if (input.heightCm !== undefined) {
      push('height_cm', input.heightCm);
    }
    if (input.relationshipGoal !== undefined) {
      push('relationship_goal', input.relationshipGoal);
    }
    if (input.hasKids !== undefined) {
      push('has_kids', input.hasKids ?? '');
      // "No kids" and "not answered" cannot keep a stale count.
      if (input.hasKids !== 'yes') push('kids_count', null);
    }
    if (input.kidsCount !== undefined && (input.hasKids === undefined || input.hasKids === 'yes')) {
      push('kids_count', input.kidsCount);
    }
    if (input.wantsKids !== undefined) {
      push('wants_kids', input.wantsKids ?? '');
    }
    if (input.hasPets !== undefined) {
      push('has_pets', input.hasPets ?? '');
      if (input.hasPets !== 'yes') {
        push('pet_types', '[]', '::jsonb');
        push('pets_count', null);
      }
    }
    if (input.petTypes !== undefined && (input.hasPets === undefined || input.hasPets === 'yes')) {
      push('pet_types', JSON.stringify(input.petTypes), '::jsonb');
    }
    if (input.petsCount !== undefined && (input.hasPets === undefined || input.hasPets === 'yes')) {
      push('pets_count', input.petsCount);
    }
    if (input.incognito !== undefined) {
      const me = await findUser(userId);
      if (!me) throw new ApiError(404, 'Profile not found', 'not_found');
      if (!isPlus(me)) {
        throw new ApiError(
          402,
          'Incognito mode is a HobyMine Plus feature.',
          'plus_required',
        );
      }
      push('incognito', input.incognito);
    }

    push('last_active_at', new Date());
    values.push(userId);
    await sql(
      `UPDATE users SET ${columns.join(', ')} WHERE id = $${columns.length + 1}`,
      values,
    );

    const me = await getMe(userId);
    res.json({ user: me });
  }),
);

usersRouter.post(
  '/me/password',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const input = parseBody(
      z.object({
        currentPassword: z
          .string({ required_error: 'Enter your current password' })
          .min(1, 'Enter your current password')
          .max(72),
        newPassword: z
          .string({ required_error: 'Enter a new password' })
          .min(8, 'Your new password must be at least 8 characters')
          .max(72),
      }),
      req.body,
    );

    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');

    const valid = await verifyPassword(input.currentPassword, me.password_hash);
    if (!valid) {
      throw new ApiError(403, 'Your current password is not correct.', 'invalid_password');
    }
    if (input.currentPassword === input.newPassword) {
      throw new ApiError(
        400,
        'Choose a new password that is different from your current one.',
        'same_password',
      );
    }

    await sql('UPDATE users SET password_hash = $1 WHERE id = $2', [
      await hashPassword(input.newPassword),
      userId,
    ]);
    // Any pending reset code was issued for the old password.
    await sql('DELETE FROM password_resets WHERE user_id = $1', [userId]);

    res.json({ ok: true });
  }),
);

/**
 * Pausing hides the profile from discovery and from every list while keeping
 * the account, its matches and its photos. Signing in again resumes it.
 */
usersRouter.post(
  '/me/pause',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');

    await sql('UPDATE users SET paused_at = NOW() WHERE id = $1', [userId]);
    res.json({ paused: true });
  }),
);

/**
 * Permanently deletes the account. The password is required so a borrowed
 * phone cannot erase somebody's profile, and the delete cascades through
 * swipes, matches, messages, blocks, reports and views.
 */
usersRouter.delete(
  '/me',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const input = parseBody(
      z.object({
        password: z
          .string({ required_error: 'Enter your password to delete the account' })
          .min(1, 'Enter your password to delete the account')
          .max(72),
      }),
      req.body,
    );

    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');
    const valid = await verifyPassword(input.password, me.password_hash);
    if (!valid) {
      throw new ApiError(403, 'That password is not correct.', 'invalid_password');
    }

    // Uploaded files are not covered by the database cascade.
    const verification = await sql<{ selfie_url: string | null }>(
      'SELECT selfie_url FROM verifications WHERE user_id = $1',
      [userId],
    );
    const files = [
      ...me.photos,
      ...verification.rows.map((row) => row.selfie_url ?? ''),
    ].filter((url) => url.startsWith('/uploads/'));

    await sql('DELETE FROM users WHERE id = $1', [userId]);

    await Promise.all(
      files.map((url) =>
        unlink(path.join(uploadsDir, url.slice('/uploads/'.length))).catch(() => undefined),
      ),
    );

    res.json({ deleted: true });
  }),
);

usersRouter.post(
  '/me/photos',
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const file = req.file;
    if (!file) throw new ApiError(400, 'Choose a photo to upload', 'no_file');
    if (mimeKind(file.mimetype) !== 'image') {
      await unlink(file.path).catch(() => undefined);
      throw new ApiError(415, 'Profile photos must be images', 'unsupported_file_type');
    }

    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');
    if (me.photos.length >= 6) {
      await unlink(file.path).catch(() => undefined);
      throw new ApiError(400, 'You can upload up to 6 photos', 'photo_limit');
    }

    const url = `/uploads/${path.basename(file.path)}`;
    const photos = [...me.photos, url];
    await sql('UPDATE users SET photos = $1::jsonb WHERE id = $2', [
      JSON.stringify(photos),
      userId,
    ]);

    const updated = await getMe(userId);
    res.status(201).json({ user: updated, url });
  }),
);

usersRouter.patch(
  '/me/photos',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const { photos } = parseBody(
      z.object({
        photos: z.array(z.string().trim().min(1)).min(1).max(6),
      }),
      req.body,
    );
    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');

    const current = [...me.photos].sort();
    const next = [...photos].sort();
    if (
      current.length !== next.length ||
      current.some((url, index) => url !== next[index])
    ) {
      throw new ApiError(
        400,
        'Photo list must match the photos already on your profile',
        'invalid_photos',
      );
    }

    await sql('UPDATE users SET photos = $1::jsonb WHERE id = $2', [
      JSON.stringify(photos),
      userId,
    ]);

    const updated = await getMe(userId);
    res.json({ user: updated });
  }),
);

usersRouter.delete(
  '/me/photos',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const { url } = parseBody(z.object({ url: z.string().trim().min(1) }), req.body);
    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');
    if (!me.photos.includes(url)) {
      throw new ApiError(404, 'That photo is not on your profile', 'not_found');
    }

    const photos = me.photos.filter((photo) => photo !== url);
    await sql('UPDATE users SET photos = $1::jsonb WHERE id = $2', [
      JSON.stringify(photos),
      userId,
    ]);

    if (url.startsWith('/uploads/')) {
      const filename = url.slice('/uploads/'.length);
      await unlink(path.join(uploadsDir, filename)).catch(() => undefined);
    }

    const updated = await getMe(userId);
    res.json({ user: updated });
  }),
);

/**
 * The 20-second voice introduction shown at the top of the full profile. The
 * clip is uploaded through /api/uploads first, then linked here so a failed
 * link never leaves a half-written profile.
 */
usersRouter.put(
  '/me/voice-intro',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const input = parseBody(
      z.object({
        url: publicUrlSchema.refine(
          (value) => value.startsWith('/uploads/'),
          'Upload the recording before saving it',
        ),
        duration: z.coerce
          .number()
          .int()
          .min(1, 'The recording is too short')
          .max(MAX_VOICE_INTRO_SECONDS, `Keep the introduction under ${MAX_VOICE_INTRO_SECONDS} seconds`),
      }),
      req.body,
    );

    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');

    await sql(
      `UPDATE users
       SET voice_intro_url = $1,
           voice_intro_duration = $2,
           voice_intro_updated_at = NOW(),
           last_active_at = NOW()
       WHERE id = $3`,
      [input.url, input.duration, userId],
    );

    // Replacing the clip should not leave the previous file on disk.
    const previous = me.voice_intro_url;
    if (previous && previous !== input.url && previous.startsWith('/uploads/')) {
      await unlink(path.join(uploadsDir, previous.slice('/uploads/'.length))).catch(
        () => undefined,
      );
    }

    const updated = await getMe(userId);
    res.json({ user: updated });
  }),
);

usersRouter.delete(
  '/me/voice-intro',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');

    await sql(
      `UPDATE users
       SET voice_intro_url = NULL,
           voice_intro_duration = NULL,
           voice_intro_updated_at = NULL
       WHERE id = $1`,
      [userId],
    );

    if (me.voice_intro_url && me.voice_intro_url.startsWith('/uploads/')) {
      await unlink(
        path.join(uploadsDir, me.voice_intro_url.slice('/uploads/'.length)),
      ).catch(() => undefined);
    }

    const updated = await getMe(userId);
    res.json({ user: updated });
  }),
);

const preferencesSchema = z
  .object({
    interestedIn: z.enum(['women', 'men', 'everyone']).optional(),
    ageMin: z.coerce.number().int().min(18).max(99).optional(),
    ageMax: z.coerce.number().int().min(18).max(99).optional(),
    maxDistance: z.coerce.number().int().min(1).max(20_000).optional(),
    locationMode: z.enum(['nearby', 'global']).optional(),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .refine(isCountryCode, 'Choose a valid country')
      .optional()
      .nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

usersRouter.patch(
  '/me/preferences',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const input = parseBody(preferencesSchema, req.body);
    const current = await getPreferences(userId);

    const next: PreferenceRow = {
      ...current,
      interested_in: input.interestedIn ?? current.interested_in,
      age_min: input.ageMin ?? current.age_min,
      age_max: input.ageMax ?? current.age_max,
      max_distance: input.maxDistance ?? current.max_distance,
      location_mode: input.locationMode ?? current.location_mode,
      country_code:
        input.countryCode === undefined ? current.country_code : input.countryCode,
    };

    if (next.age_min > next.age_max) {
      throw new ApiError(400, 'Minimum age cannot be higher than maximum age', 'invalid_range');
    }

    await sql(
      `UPDATE preferences
       SET interested_in = $1, age_min = $2, age_max = $3, max_distance = $4,
           country_code = $5, location_mode = $6
       WHERE user_id = $7`,
      [
        next.interested_in,
        next.age_min,
        next.age_max,
        next.max_distance,
        next.country_code,
        next.location_mode,
        userId,
      ],
    );

    const me = await getMe(userId);
    res.json({ user: me });
  }),
);

const locationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  city: z.string().trim().max(80).optional(),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isCountryCode, 'Choose a valid country')
    .optional(),
});

usersRouter.put(
  '/me/location',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const input = parseBody(locationSchema, req.body);

    const columns = ['latitude = $1', 'longitude = $2', 'location_city = $3'];
    const values: unknown[] = [input.latitude, input.longitude, input.city ?? null];
    let index = 4;

    if (input.countryCode) {
      const country = countryByCode(input.countryCode);
      if (!country) throw new ApiError(400, 'Choose a valid country', 'invalid_country');
      columns.push(`country_code = $${index++}`);
      values.push(country.code);
      // The country anchor moves with the detected location.
      columns.push(`lat = $${index++}`);
      values.push(country.lat);
      columns.push(`lng = $${index++}`);
      values.push(country.lng);
    }

    values.push(userId);
    await sql(`UPDATE users SET ${columns.join(', ')} WHERE id = $${index}`, values);

    // Sharing a position means the member wants to meet people around them.
    const preferences = await getPreferences(userId);
    await sql('UPDATE preferences SET location_mode = $1 WHERE user_id = $2', [
      'nearby',
      userId,
    ]);

    const me = await getMe(userId);
    res.json({
      user: me,
      preferences: { ...preferences, location_mode: 'nearby' as const },
    });
  }),
);

usersRouter.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const target = await findUser(req.params.id ?? '');
    if (!target) throw new ApiError(404, 'Profile not found', 'not_found');
    if (target.id !== userId && target.paused_at) {
      throw new ApiError(404, 'Profile not found', 'not_found');
    }
    if (target.id !== userId && (await isBlockedBetween(userId, target.id))) {
      throw new ApiError(404, 'Profile not found', 'not_found');
    }
    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');
    const matched = target.id === userId ? false : await areMatched(userId, target.id);
    res.json({
      user: toPublicUser(target, {
        lat: me.lat,
        lng: me.lng,
        interests: me.interests,
      }),
      matched,
    });
  }),
);

/** Records that a profile was opened — unless the viewer is incognito. */
usersRouter.post(
  '/users/:id/view',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const targetId = req.params.id ?? '';
    if (targetId === userId) {
      res.json({ ok: true, recorded: false });
      return;
    }
    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');
    if (me.incognito) {
      // Incognito members leave no trace.
      res.json({ ok: true, recorded: false });
      return;
    }
    const target = await findUser(targetId);
    if (!target) throw new ApiError(404, 'Profile not found', 'not_found');
    if (target.paused_at) {
      res.json({ ok: true, recorded: false });
      return;
    }
    if (await isBlockedBetween(userId, target.id)) {
      res.json({ ok: true, recorded: false });
      return;
    }

    await sql(
      `INSERT INTO profile_views (id, viewer_id, viewed_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (viewer_id, viewed_id) DO UPDATE SET created_at = NOW()`,
      [randomUUID(), userId, targetId],
    );

    // Every visit raises a fresh alert, including repeat visits from the same
    // person. The profile_views row is still one per viewer, so the tab keeps
    // showing one card with the latest visit time.
    //
    // A free account gets the alert, but not the visitor's identity - that is
    // the same blur/paywall rule used by the Profile views tab.
    const targetSeesIdentity = isPlus(target);
    emitToUser(target.id, 'profile:viewed', {
      viewer: targetSeesIdentity
        ? toPublicUser(me, {
            lat: target.lat,
            lng: target.lng,
            interests: target.interests,
          })
        : null,
      limited: !targetSeesIdentity,
      viewedAt: new Date().toISOString(),
    });

    res.json({ ok: true, recorded: true });
  }),
);

/** Free members see a blurred teaser instead of the viewer's identity. */
function toViewerTeaser(user: PublicUser, index: number): PublicUser {
  return {
    id: `hidden-view-${index}`,
    name: 'Profile viewer',
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
    sharedInterests: [],
    isBot: false,
    memberSince: null,
  };
}

/**
 * People who opened the member's profile. The total count is always visible,
 * but identities and clear photos are a HobyMine Plus feature.
 */
usersRouter.get(
  '/me/viewers',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');

    const member = isPlus(me);
    // Blocked members never appear as visitors, in the list or in the count.
    const blockFilter = `NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = $1 AND b.blocked_id = v.viewer_id)
         OR (b.blocker_id = v.viewer_id AND b.blocked_id = $1)
    )`;
    const result = await sql<UserRow & { viewed_at: string | Date }>(
      `SELECT u.*, v.created_at AS viewed_at
       FROM profile_views v
       JOIN users u ON u.id = v.viewer_id
       WHERE v.viewed_id = $1
         AND v.viewer_id <> $1
         AND u.is_bot = FALSE
         AND u.paused_at IS NULL
         AND ${blockFilter}
       ORDER BY v.created_at DESC
       LIMIT 60`,
      [userId],
    );
    const total = await sql<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM profile_views v
       JOIN users u ON u.id = v.viewer_id
       WHERE v.viewed_id = $1
         AND v.viewer_id <> $1
         AND u.is_bot = FALSE
         AND u.paused_at IS NULL
         AND ${blockFilter}`,
      [userId],
    );

    const viewer = { lat: me.lat, lng: me.lng, interests: me.interests };
    const views = result.rows.map((row, index) => {
      const user = toPublicUser(
        {
          ...row,
          interests: Array.isArray(row.interests) ? row.interests : [],
          photos: Array.isArray(row.photos) ? row.photos : [],
        },
        viewer,
      );
      return {
        user: member ? user : toViewerTeaser(user, index),
        viewedAt: toIso(row.viewed_at) ?? new Date().toISOString(),
      };
    });

    res.json({
      views,
      count: Number(total.rows[0]?.count ?? views.length),
      limited: !member,
    });
  }),
);

/** The profiles the member looked at recently. */
usersRouter.get(
  '/me/views',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const me = await findUser(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');
    const result = await sql<UserRow>(
      `SELECT u.* FROM profile_views v
       JOIN users u ON u.id = v.viewed_id
       WHERE v.viewer_id = $1
       ORDER BY v.created_at DESC
       LIMIT 30`,
      [userId],
    );
    res.json({
      views: result.rows.map((row) =>
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

usersRouter.delete(
  '/me/views',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    await sql('DELETE FROM profile_views WHERE viewer_id = $1', [userId]);
    res.json({ ok: true });
  }),
);

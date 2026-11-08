import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sql } from '../db/index.js';
import { hashPassword, signToken, verifyPassword } from '../lib/auth.js';
import { countryByCode, isCountryCode } from '../lib/countries.js';
import { EMAIL_ERROR_MESSAGE, validateEmail } from '../lib/email.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { TERMS_VERSION } from '../lib/legal.js';
import { parseBody } from '../lib/validation.js';
import { findUser, findUserByEmail, getMe, getPreferences, touchUser } from '../lib/users.js';
import { toMeUser } from '../lib/serialize.js';
import { env } from '../config.js';
import type { Gender, UserRow } from '../types.js';

/** One-time codes are never stored in plain text. */
function hashCode(code: string): string {
  return createHash('sha256').update(`${code}:${env.jwtSecret}`).digest('hex');
}

export const authRouter = Router();

/**
 * Sign up verification and the password reset flow hand out the same kind of
 * six digit code; only the table they live in differs.
 */
type CodeTable = 'password_resets' | 'email_verifications';

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const CODE_RESEND_COOLDOWN_MS = 60 * 1000;

/** Issues a fresh code, replacing any pending one. A short cooldown stops loops. */
async function issueCode(table: CodeTable, userId: string): Promise<string> {
  const recent = await sql<{ created_at: string | Date }>(
    `SELECT created_at FROM ${table}
     WHERE user_id = $1 AND created_at > NOW() - ($2::int * INTERVAL '1 millisecond')
     ORDER BY created_at DESC LIMIT 1`,
    [userId, CODE_RESEND_COOLDOWN_MS],
  );
  if (recent.rows[0]) {
    throw new ApiError(429, 'Please wait a minute before asking for another code.', 'too_many_requests');
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await sql(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
  await sql(
    `INSERT INTO ${table} (id, user_id, code_hash, expires_at)
     VALUES ($1,$2,$3,NOW() + ($4::int * INTERVAL '1 millisecond'))`,
    [randomUUID(), userId, hashCode(code), CODE_TTL_MS],
  );
  return code;
}

/** Checks a code, counts failed attempts, and clears it once it has been used. */
async function consumeCode(table: CodeTable, userId: string, code: string): Promise<void> {
  const result = await sql<{
    id: string;
    code_hash: string;
    attempts: number;
    expires_at: string | Date;
  }>(
    `SELECT id, code_hash, attempts, expires_at FROM ${table}
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  const record = result.rows[0];
  if (!record || new Date(record.expires_at).getTime() < Date.now()) {
    throw new ApiError(400, 'That code has expired. Ask for a new one.', 'invalid_code');
  }
  if (record.attempts >= CODE_MAX_ATTEMPTS) {
    throw new ApiError(429, 'Too many attempts. Ask for a new code.', 'too_many_requests');
  }
  if (record.code_hash !== hashCode(code)) {
    await sql(`UPDATE ${table} SET attempts = attempts + 1 WHERE id = $1`, [record.id]);
    throw new ApiError(400, 'That code is not valid.', 'invalid_code');
  }
  await sql(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
}

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(40),
  email: z
    .string({ required_error: 'Enter your email address' })
    .trim()
    .max(254, 'That email address is too long')
    .refine((value) => validateEmail(value).valid, {
      message: EMAIL_ERROR_MESSAGE,
    }),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  age: z.coerce.number().int().min(18, 'You must be 18 or older').max(99),
  gender: z.enum(['woman', 'man', 'nonbinary']),
  countryCode: z
    .string({ required_error: 'Choose your country' })
    .trim()
    .toUpperCase()
    .refine(isCountryCode, 'Choose a valid country'),
  interestedIn: z.enum(['women', 'men', 'everyone']).default('everyone'),
  /**
   * The sign up form requires the 18+ checkbox before it will submit. The API
   * enforces it too so an account cannot be created by skipping the client.
   */
  ageConfirmed: z.literal(true, {
    errorMap: () => ({
      message: 'Confirm that you are 18 or older to create an account',
    }),
  }),
});

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email').max(120),
  password: z.string().min(1, 'Enter your password').max(72),
});

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const input = parseBody(registerSchema, req.body);
    const existing = await findUserByEmail(input.email);
    if (existing) {
      throw new ApiError(409, 'An account with that email already exists.', 'email_taken');
    }

    const country = countryByCode(input.countryCode);
    if (!country) {
      throw new ApiError(400, 'Choose a valid country', 'invalid_country');
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(input.password);
    // The 18+ confirmation and the legal acceptance are recorded at the moment
    // the account is created, together with the version of the documents.
    await sql(
      `INSERT INTO users
        (id, email, password_hash, name, age, gender, bio, job, city, country_code,
         lat, lng, interests, photos, age_confirmed_at, terms_accepted_at, terms_version)
       VALUES ($1,$2,$3,$4,$5,$6,'','','',$7,$8,$9,'[]'::jsonb,'[]'::jsonb,NOW(),NOW(),$10)`,
      [
        userId,
        input.email.toLowerCase(),
        passwordHash,
        input.name,
        input.age,
        input.gender,
        country.code,
        country.lat,
        country.lng,
        TERMS_VERSION,
      ],
    );
    await sql(
      `INSERT INTO preferences (user_id, interested_in, age_min, age_max, max_distance)
       VALUES ($1,$2,21,40,50)`,
      [userId, input.interestedIn],
    );

    const user = await findUser(userId);
    if (!user) throw new ApiError(500, 'Could not create account');
    const preferences = await getPreferences(userId);

    // Confirm the address before the account can take part: the code is stored
    // hashed and, because there is no mail provider in this demo, handed back
    // to the client outside production.
    const code = await issueCode('email_verifications', userId);
    console.log(`[hobymine] Email verification code for ${user.email}: ${code}`);

    res.status(201).json({
      token: signToken(userId),
      user: toMeUser(user, preferences),
      ...(env.isProduction ? {} : { devCode: code }),
    });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = parseBody(loginSchema, req.body);
    const user = await findUserByEmail(input.email);
    if (!user) {
      throw new ApiError(401, 'Email or password is incorrect.', 'invalid_credentials');
    }
    const valid = await verifyPassword(input.password, user.password_hash);
    if (!valid) {
      throw new ApiError(401, 'Email or password is incorrect.', 'invalid_credentials');
    }

    // Signing back in is the way to undo a pause: the profile becomes visible
    // in discovery again and the member picks up where they left off.
    if (user.paused_at) {
      await sql('UPDATE users SET paused_at = NULL WHERE id = $1', [user.id]);
    }
    await touchUser(user.id);

    const refreshed = (await findUser(user.id)) ?? user;
    const preferences = await getPreferences(user.id);

    res.json({ token: signToken(user.id), user: toMeUser(refreshed, preferences) });
  }),
);

authRouter.post(
  '/demo',
  asyncHandler(async (_req, res) => {
    const user = await findUser('u_demo');
    if (!user) {
      throw new ApiError(503, 'Demo data is not ready yet. Restart the API.', 'demo_unavailable');
    }
    await touchUser(user.id);
    const refreshed = (await findUser(user.id)) ?? user;
    const preferences = await getPreferences(user.id);
    res.json({ token: signToken(user.id), user: toMeUser(refreshed, preferences) });
  }),
);

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email').max(254),
});

const resetPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email').max(254),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6 digit code'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});

/**
 * Starts the "forgot password" flow: a six digit code is generated and stored
 * (hashed) for ten minutes. There is no mail provider in this demo, so the
 * code is returned to the client outside production and logged on the server.
 */
authRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const input = parseBody(forgotPasswordSchema, req.body);
    const user = await findUserByEmail(input.email);
    // Always answer the same way so the endpoint cannot be used to find out
    // which addresses have an account.
    if (!user) {
      res.json({ sent: true });
      return;
    }

    const code = await issueCode('password_resets', user.id);

    console.log(`[hobymine] Password reset code for ${user.email}: ${code}`);
    res.json({
      sent: true,
      // The demo has no mail service, so the code is handed back directly.
      ...(env.isProduction ? {} : { devCode: code }),
    });
  }),
);

authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const input = parseBody(resetPasswordSchema, req.body);
    const user = await findUserByEmail(input.email);
    if (!user) throw new ApiError(400, 'That code is not valid.', 'invalid_code');

    await consumeCode('password_resets', user.id, input.code);

    await sql('UPDATE users SET password_hash = $1 WHERE id = $2', [
      await hashPassword(input.password),
      user.id,
    ]);
    res.json({ ok: true });
  }),
);

const verifyEmailSchema = z.object({
  email: z.string().trim().email('Enter a valid email').max(254),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6 digit code'),
});

/**
 * Confirms the address a new account signed up with. The client is already
 * signed in at this point, so only the address and the code are needed.
 */
authRouter.post(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const input = parseBody(verifyEmailSchema, req.body);
    const user = await findUserByEmail(input.email);
    if (!user) throw new ApiError(400, 'That code is not valid.', 'invalid_code');

    await consumeCode('email_verifications', user.id, input.code);
    await sql('UPDATE users SET email_verified = TRUE WHERE id = $1', [user.id]);

    const refreshed = (await findUser(user.id)) ?? user;
    const preferences = await getPreferences(user.id);
    res.json({ user: toMeUser(refreshed, preferences) });
  }),
);

/** Sends a fresh verification code when the first one expired or was lost. */
authRouter.post(
  '/resend-verification',
  asyncHandler(async (req, res) => {
    const input = parseBody(forgotPasswordSchema, req.body);
    const user = await findUserByEmail(input.email);
    if (!user) throw new ApiError(404, 'Profile not found', 'not_found');
    if (user.email_verified) {
      res.json({ sent: true, alreadyVerified: true });
      return;
    }

    const code = await issueCode('email_verifications', user.id);
    console.log(`[hobymine] Email verification code for ${user.email}: ${code}`);
    res.json({
      sent: true,
      ...(env.isProduction ? {} : { devCode: code }),
    });
  }),
);

authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new ApiError(401, 'Authentication required', 'unauthorized');
    const { verifyToken } = await import('../lib/auth.js');
    const userId = verifyToken(token);
    const me = await getMe(userId);
    if (!me) throw new ApiError(404, 'Profile not found', 'not_found');
    // A paused account is signed out everywhere. The client treats a 401 as an
    // expired session and returns to the welcome screen.
    const row = await findUser(userId);
    if (row?.paused_at) {
      throw new ApiError(
        401,
        'This account is paused. Sign in again to reactivate it.',
        'account_paused',
      );
    }
    res.json({ user: me });
  }),
);

// Narrow helper kept for type-only usage in generated clients.
export type AuthUser = UserRow;
export type AuthGender = Gender;

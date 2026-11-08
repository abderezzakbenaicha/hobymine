import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config.js';
import { sql } from '../db/index.js';
import { ApiError } from './http.js';

export interface AuthRequest extends Request {
  userId: string;
}

interface TokenPayload {
  sub: string;
}

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, 10);

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: '30d' });
}

export function verifyToken(token: string): string {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as TokenPayload;
    if (!payload.sub) throw new Error('Missing subject');
    return payload.sub;
  } catch {
    throw new ApiError(401, 'Your session has expired. Please sign in again.', 'unauthorized');
  }
}

export async function authRequired(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    next(new ApiError(401, 'Authentication required', 'unauthorized'));
    return;
  }
  try {
    const userId = verifyToken(token);
    // A paused account is signed out everywhere: every authenticated request
    // is rejected until the owner signs in again, which clears paused_at.
    const { rows } = await sql<{ paused_at: string | null }>(
      'SELECT paused_at FROM users WHERE id = $1',
      [userId],
    );
    if (rows[0]?.paused_at) {
      throw new ApiError(
        401,
        'This account is paused. Sign in again to reactivate it.',
        'account_paused',
      );
    }
    (req as AuthRequest).userId = userId;
    next();
  } catch (error) {
    next(error);
  }
}

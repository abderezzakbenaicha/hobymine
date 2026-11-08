import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: error.issues[0]?.message ?? 'Invalid request',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (error instanceof MulterError) {
    res.status(400).json({
      error: { code: 'upload_error', message: `Upload failed: ${error.message}` },
    });
    return;
  }

  if (error instanceof Error && error.message === 'UNSUPPORTED_FILE_TYPE') {
    res.status(415).json({
      error: {
        code: 'unsupported_file_type',
        message: 'Only JPEG, PNG, WebP, GIF, WebM, OGG, MP3, WAV or M4A files are supported.',
      },
    });
    return;
  }

  console.error('[hobymine] Unhandled error', error);
  res.status(500).json({
    error: { code: 'internal_error', message: 'Something went wrong on our side.' },
  });
}

import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import morgan from 'morgan';
import { env, isAllowedOrigin } from './config.js';
import { dbKind } from './db/index.js';
import { errorHandler, notFoundHandler } from './lib/http.js';
import { uploadsDir } from './lib/uploads.js';
import { authRouter } from './routes/auth.js';
import { callsRouter } from './routes/calls.js';
import { discoveryRouter } from './routes/discovery.js';
import { matchesRouter } from './routes/matches.js';
import { plusRouter } from './routes/plus.js';
import { safetyRouter } from './routes/safety.js';
import { storiesRouter } from './routes/stories.js';
import { uploadsRouter } from './routes/uploads.js';
import { usersRouter } from './routes/users.js';
import { verificationRouter } from './routes/verification.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../web/dist');

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  if (env.nodeEnv !== 'test') {
    app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  }

  app.use(
    '/uploads',
    express.static(uploadsDir, {
      maxAge: '7d',
      immutable: true,
      fallthrough: true,
      index: false,
      setHeaders: (res, filePath) => {
        // Express maps .webm to video/webm; voice notes need the audio type so
        // the player accepts the stream.
        if (filePath.endsWith('.webm')) res.setHeader('Content-Type', 'audio/webm');
        else if (filePath.endsWith('.ogg')) res.setHeader('Content-Type', 'audio/ogg');
        else if (filePath.endsWith('.m4a')) res.setHeader('Content-Type', 'audio/mp4');
        else if (filePath.endsWith('.mp3')) res.setHeader('Content-Type', 'audio/mpeg');
        else if (filePath.endsWith('.wav')) res.setHeader('Content-Type', 'audio/wav');
        else if (filePath.endsWith('.heic')) res.setHeader('Content-Type', 'image/heic');
        else if (filePath.endsWith('.heif')) res.setHeader('Content-Type', 'image/heif');
        else if (filePath.endsWith('.avif')) res.setHeader('Content-Type', 'image/avif');
        else if (filePath.endsWith('.bmp')) res.setHeader('Content-Type', 'image/bmp');
      },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'hobymine-api',
      version: '1.0.0',
      database: dbKind(),
      time: new Date().toISOString(),
    });
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: { code: 'rate_limited', message: 'Too many attempts. Try again shortly.' },
    },
  });

  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api', usersRouter);
  app.use('/api', discoveryRouter);
  app.use('/api/calls', callsRouter);
  app.use('/api/matches', matchesRouter);
  app.use('/api', safetyRouter);
  app.use('/api/stories', storiesRouter);
  app.use('/api/plus', plusRouter);
  app.use('/api/verification', verificationRouter);
  app.use('/api/uploads', uploadsRouter);

  app.use('/api', notFoundHandler);

  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/uploads') ||
        req.path.startsWith('/socket.io')
      ) {
        next();
        return;
      }
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export { webDist };

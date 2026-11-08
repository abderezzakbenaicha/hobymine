import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { createApp } from './app.js';
import { env } from './config.js';
import { closeDb, initDb } from './db/index.js';
import { DEMO_CREDENTIALS, seedDatabase } from './db/seed.js';
import { setIo } from './lib/realtime.js';
import { ensureStorageBucket, storageEnabled, storageBucket } from './lib/storage.js';
import { attachSocket } from './socket.js';

async function main(): Promise<void> {
  await initDb();
  const { seeded } = await seedDatabase();
  if (seeded) {
    console.log(
      `[hobymine] Seeded demo data. Sign in with ${DEMO_CREDENTIALS.email} / ${DEMO_CREDENTIALS.password}`,
    );
  }

  // Uploads must survive a redeploy, so make sure the bucket exists before the
  // first file arrives. A failure here is logged, not fatal.
  await ensureStorageBucket();
  console.log(
    storageEnabled()
      ? `[hobymine] Uploads: Supabase Storage bucket "${storageBucket}"`
      : '[hobymine] Uploads: local disk (apps/api/uploads). Set SUPABASE_URL and SUPABASE_SECRET_KEY for durable media.',
  );

  const app = createApp();
  const server = createServer(app);
  const io = attachSocket(server);
  setIo(io);

  server.listen(env.port, env.host, () => {
    console.log(`[hobymine] API + Socket.io listening on port ${env.port} (host ${env.host})`);
    console.log(`[hobymine]   local:   http://localhost:${env.port}`);
    for (const [name, addresses] of Object.entries(networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family !== 'IPv4' || address.internal) continue;
        console.log(`[hobymine]   network: http://${address.address}:${env.port}  (${name})`);
      }
    }
    console.log(
      '[hobymine] Phones must use a network URL above (or the deployed HTTPS URL). ' +
        'It can also be changed in the app under Settings → Server connection.',
    );
  });

  const shutdown = (signal: string): void => {
    console.log(`[hobymine] ${signal} received, shutting down`);
    void io.close();
    server.close(() => {
      void closeDb().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[hobymine] Failed to start API', error);
  if (!env.databaseUrl) {
    console.error(
      '[hobymine] If the embedded database cannot start (for example ' +
        '"PANIC: could not locate a valid checkpoint record"), stop the server and run:',
    );
    console.error(
      '  npm run db:recover   - it archives apps/api/data/pg and the next start reseeds a fresh one.',
    );
  }
  process.exit(1);
});

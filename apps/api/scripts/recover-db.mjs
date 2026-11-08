/**
 * Archives an embedded PGlite data directory that can no longer start.
 *
 * PGlite runs a full PostgreSQL inside the process. If the process is killed
 * while PostgreSQL is writing a checkpoint (for example an abrupt tsx-watch
 * restart on Windows), the directory can be left with an invalid checkpoint
 * record and every later start aborts with:
 *
 *   PANIC: could not locate a valid checkpoint record
 *   RuntimeError: Aborted()
 *
 * PostgreSQL cannot recover that directory, so this script moves it aside. The
 * next API start creates a fresh database, applies the schema and reseeds the
 * demo data. Nothing is deleted: the old directory is kept with a timestamp so
 * it can be inspected or copied somewhere else.
 *
 * Usage:
 *   npm run db:recover --workspace @hobymine/api
 *   npm run db:recover                        (from the repo root)
 */

import { existsSync, renameSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');

if (process.env.DATABASE_URL?.trim()) {
  console.log(
    'DATABASE_URL is set, so the API uses an external PostgreSQL server. ' +
      'This recovery script only applies to the embedded PGlite database.',
  );
  process.exit(0);
}

const dataDir =
  process.env.PGLITE_DIR?.trim() || path.join(packageRoot, 'data', 'pg');
const port = Number.parseInt(process.env.PORT ?? '4000', 10);

if (!existsSync(dataDir)) {
  console.log(`No embedded database at ${dataDir}; the next start will create one.`);
  process.exit(0);
}

/** Refuse to move the directory while an API instance still owns it. */
function apiIsRunning() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1000, () => finish(false));
  });
}

if (await apiIsRunning()) {
  console.error(
    `The API is still running on port ${port}. Stop it first (Ctrl+C in its window), ` +
      'then run the recovery again.',
  );
  process.exit(1);
}

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .replace('T', '-')
  .slice(0, 19);
const archived = `${dataDir}-corrupt-${stamp}`;

try {
  renameSync(dataDir, archived);
} catch (error) {
  console.error(`Could not move ${dataDir}: ${error.message}`);
  process.exit(1);
}

console.log(`Archived the unusable database to:\n  ${archived}`);
console.log('Start the API again; a fresh database is created and seeded automatically.');

// Keep only the built-in demo account (u_demo / demo@hobymine.app).
// Stop the API first: the embedded database is single-process.
//   tsx scripts/keep-demo-user.mjs          # delete every other account
//   tsx scripts/keep-demo-user.mjs --dry-run
import net from 'node:net';
import { closeDb, initDb, sql } from '../src/db/index.js';

const DEMO_ID = 'u_demo';
const DEMO_EMAIL = 'demo@hobymine.app';
const dryRun = process.argv.includes('--dry-run');
const port = Number.parseInt(process.env.PORT ?? '4000', 10);

// The embedded database is single-writer: refuse to touch it while the API is
// running, otherwise the data directory can be left in a corrupt state.
const apiIsRunning = await new Promise((resolve) => {
  const socket = net.connect({ host: '127.0.0.1', port });
  const finish = (value) => {
    socket.destroy();
    resolve(value);
  };
  socket.once('connect', () => finish(true));
  socket.once('error', () => finish(false));
  socket.setTimeout(1000, () => finish(false));
});
if (apiIsRunning) {
  console.error(
    `The API is still running on port ${port}. Stop it first, then run this script again.`,
  );
  process.exit(1);
}

await initDb();

const summary = await sql(
  `SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE is_seeded)::int AS seeded,
          COUNT(*) FILTER (WHERE NOT is_seeded)::int AS real
   FROM users`,
);
const { total, seeded, real } = summary.rows[0];
console.log(
  `[hobymine] ${total} account(s): ${real} real account(s), ${seeded} seeded profile(s).`,
);

const people = await sql(
  `SELECT id, email, name, is_seeded
   FROM users
   WHERE NOT is_seeded AND id <> $1
   ORDER BY created_at`,
  [DEMO_ID],
);
if (people.rows.length > 0) {
  console.log('[hobymine] Real accounts that would be removed:');
  for (const row of people.rows) {
    console.log(`[hobymine]   ${row.id}  ${row.email}  ${row.name}`);
  }
}

const demo = await sql('SELECT id, email FROM users WHERE id = $1 OR email = $2', [
  DEMO_ID,
  DEMO_EMAIL,
]);
if (demo.rows.length === 0) {
  console.error('[hobymine] The demo account does not exist; nothing was deleted.');
  await closeDb();
  process.exit(1);
}

const demoId = demo.rows[0].id;
const targets = await sql('SELECT COUNT(*)::int AS count FROM users WHERE id <> $1', [
  demoId,
]);

if (dryRun) {
  console.log(
    `[hobymine] Dry run: would keep ${demoId} and delete ${targets.rows[0].count} account(s).`,
  );
  await closeDb();
  process.exit(0);
}

const removed = await sql(
  'DELETE FROM users WHERE id <> $1 RETURNING id, email',
  [demoId],
);
const left = await sql('SELECT COUNT(*)::int AS count FROM users');
console.log(
  `[hobymine] Removed ${removed.rows.length} account(s); ${left.rows[0].count} left (${demoId}).`,
);
console.log(`[hobymine] Demo login: ${DEMO_EMAIL} / Password123!`);

await closeDb();
process.exit(0);

// Removes the throwaway accounts created by the manual call checks.
// Stop the API first: the embedded database is single-process.
import { closeDb, initDb, sql } from '../src/db/index.js';

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.log('usage: tsx scripts/cleanup-test-accounts.mjs <id> [...]');
  process.exit(0);
}

await initDb();
await sql('DELETE FROM users WHERE id = ANY($1::text[])', [ids]);
const left = await sql('SELECT COUNT(*)::int AS count FROM users');
console.log(`removed ${ids.length} account(s); ${left.rows[0]?.count} account(s) left`);
await closeDb();
process.exit(0);

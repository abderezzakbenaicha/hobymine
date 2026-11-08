import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { applySchema, closeDb, initDb, sql } from './index.js';
import { seedDatabase } from './seed.js';

/**
 * Development helper: wipe every table and reseed the demo data.
 * Stop the API dev server first (the embedded database is a single-writer store).
 */
async function reset(): Promise<void> {
  await initDb();
  await sql(`
    DROP TABLE IF EXISTS verifications, reports, blocks, messages, matches,
      swipes, preferences, users CASCADE
  `);
  await applySchema();
  const { seeded } = await seedDatabase();
  const demoHash = await bcrypt.hash('Password123!', 10);
  await sql('UPDATE users SET password_hash = $1 WHERE id = $2', [demoHash, 'u_demo']);
  console.log(seeded ? '[hobymine] Database reset and seeded.' : '[hobymine] Seed skipped unexpectedly.');
  console.log('[hobymine] Demo login: demo@hobymine.app / Password123!');
  await closeDb();
}

reset().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exitCode = 1;
});

// Keep the import used so bundlers do not tree-shake the helper in watch mode.
void randomUUID;

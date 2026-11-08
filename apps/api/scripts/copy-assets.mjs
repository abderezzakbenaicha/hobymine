import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, '../src/db/schema.sql');
const to = resolve(here, '../dist/db/schema.sql');
mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log('copied schema.sql -> dist/db/schema.sql');

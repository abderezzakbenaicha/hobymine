#!/usr/bin/env node
/**
 * HobyMine -> Supabase connection test.
 *
 * Checks the four things the app depends on:
 *   1. Auth        - GoTrue reachable and credentials are evaluated
 *   2. Database    - the tables HobyMine needs are exposed by PostgREST
 *   3. Realtime    - a WebSocket channel can be subscribed with this key
 *   4. Storage     - the storage API answers
 *
 * Reads SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY from the environment first,
 * then the repo-root `.env`, then `apps/web/.env.local`. Never prints secrets.
 *
 * Usage: npm run test:supabase
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env reader; real environment variables always win. */
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, name, rawValue] = match;
    if (process.env[name] !== undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[name] = value;
  }
}

loadEnvFile(resolve(root, '.env'));
loadEnvFile(resolve(root, 'apps/web/.env.local'));

const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const key = (
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  ''
).trim();

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const checks = [];

function record(name, status, detail, extra = {}) {
  checks.push({ name, status, detail, ...extra });
  const badge =
    status === 'pass'
      ? `${GREEN}PASS${RESET}`
      : status === 'warn'
        ? `${YELLOW}WARN${RESET}`
        : `${RED}FAIL${RESET}`;
  console.log(`  ${badge}  ${name}`);
  if (detail) console.log(`        ${DIM}${detail}${RESET}`);
}

async function timed(fn) {
  const started = performance.now();
  try {
    return { value: await fn(), ms: Math.round(performance.now() - started) };
  } catch (error) {
    return { error, ms: Math.round(performance.now() - started) };
  }
}

function apiHeaders() {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function getJson(path) {
  const response = await fetch(`${url}${path}`, {
    headers: apiHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

if (!url || !key) {
  console.error(
    'Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY,\n' +
      'or add them to .env / apps/web/.env.local.',
  );
  process.exit(1);
}

if (key.startsWith('sb_secret_') || key.startsWith('service_role')) {
  console.error(
    `${RED}Refusing to run:${RESET} the configured key is a secret key.\n` +
      'Use the publishable key for connection tests; keep secret keys server-side.',
  );
  process.exit(1);
}

console.log(`\n${BOLD}HobyMine -> Supabase${RESET}`);
console.log(`${DIM}${url}${RESET}\n`);

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 5 } },
});

// ---------------------------------------------------------------- 1. Auth
{
  const health = await timed(() => getJson('/auth/v1/health'));
  if (health.error) {
    record('Auth: GoTrue health endpoint', 'fail', String(health.error));
  } else {
    const ok = health.value.status === 200 && health.value.body?.name === 'GoTrue';
    record(
      'Auth: GoTrue health endpoint',
      ok ? 'pass' : 'fail',
      `HTTP ${health.value.status} - GoTrue ${health.value.body?.version ?? 'unknown'} (${health.ms} ms)`,
    );
  }

  const settings = await timed(() => getJson('/auth/v1/settings'));
  if (settings.error) {
    record('Auth: settings/providers', 'fail', String(settings.error));
  } else {
    const providers = Array.isArray(settings.value.body?.external)
      ? settings.value.body.external
      : [];
    record(
      'Auth: settings/providers',
      settings.value.status === 200 ? 'pass' : 'fail',
      `HTTP ${settings.value.status} - providers: ${providers.length ? providers.join(', ') : 'email/password'}`,
    );
  }

  // A deliberately invalid sign-in proves credentials are actually processed
  // (rather than only that the health endpoint answers). No account is created.
  const probe = await timed(() =>
    supabase.auth.signInWithPassword({
      email: `hobymine-probe-${Date.now()}@example.invalid`,
      password: 'not-a-real-password-123',
    }),
  );
  const probeError = probe.error ?? probe.value?.error;
  if (probeError) {
    const expected = /invalid login credentials|invalid_grant|invalid_credentials/i.test(
      probeError.message,
    );
    record(
      'Auth: credential check',
      expected ? 'pass' : 'warn',
      expected
        ? `Rejected a bogus login as expected (${probe.ms} ms)`
        : probeError.message,
    );
  } else {
    record('Auth: credential check', 'warn', 'Unexpected success for a bogus login');
  }
}

// ------------------------------------------------------------ 2. Database
const REQUIRED_TABLES = ['users', 'stories', 'story_views', 'messages', 'matches'];
{
  const results = await Promise.all(
    REQUIRED_TABLES.map(async (table) => {
      const response = await timed(() =>
        getJson(`/rest/v1/${table}?select=*&limit=1`),
      );
      return { table, ...response };
    }),
  );

  for (const result of results) {
    if (result.error) {
      record(`Database: public.${result.table}`, 'fail', String(result.error));
      continue;
    }
    const { status, body } = result.value;
    if (status === 200) {
      const rows = Array.isArray(body) ? body.length : 0;
      record(`Database: public.${result.table}`, 'pass', `HTTP 200 - readable (${rows} row sample, ${result.ms} ms)`);
    } else if (body?.code === 'PGRST205') {
      record(
        `Database: public.${result.table}`,
        'fail',
        `Table is not in the schema cache - apply the schema in the Supabase SQL editor`,
      );
    } else if (status === 401 || status === 403) {
      record(
        `Database: public.${result.table}`,
        'warn',
        `HTTP ${status} - table exists but Row Level Security blocked the anonymous read (${body?.code ?? 'no code'})`,
      );
    } else {
      record(
        `Database: public.${result.table}`,
        'fail',
        `HTTP ${status} - ${body?.message ?? 'unknown error'}`,
      );
    }
  }
}

// ------------------------------------------------------------ 3. Realtime
{
  const channelName = `hobymine:connection-test:${Date.now()}`;
  const outcome = await new Promise((resolvePromise) => {
    let settled = false;
    const finish = (status, detail) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void supabase.removeChannel(channel);
      resolvePromise({ status, detail });
    };
    const timer = setTimeout(
      () => finish('fail', 'Timed out after 12 s waiting for SUBSCRIBED'),
      12_000,
    );
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: true } },
    });
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        finish('pass', `WebSocket subscribed to "${channelName}"`);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        finish('fail', `${status}${error ? `: ${error.message}` : ''}`);
      }
    });
  });
  record('Realtime: channel subscribe', outcome.status, outcome.detail);
}

// ------------------------------------------------------------- 4. Storage
{
  const buckets = await timed(() => getJson('/storage/v1/bucket'));
  if (buckets.error) {
    record('Storage: bucket list', 'fail', String(buckets.error));
  } else {
    const { status, body } = buckets.value;
    if (status === 200) {
      const names = Array.isArray(body) ? body.map((b) => b.name) : [];
      record(
        'Storage: bucket list',
        'pass',
        `HTTP 200 - ${names.length} bucket(s)${names.length ? `: ${names.join(', ')}` : ''}`,
      );
    } else if (status === 401 || status === 403) {
      record('Storage: bucket list', 'warn', `HTTP ${status} - not permitted for this key`);
    } else {
      record('Storage: bucket list', 'warn', `HTTP ${status} - ${body?.message ?? 'unknown response'}`);
    }
  }
}

// --------------------------------------------------------------- Summary
const passed = checks.filter((c) => c.status === 'pass').length;
const warned = checks.filter((c) => c.status === 'warn').length;
const failed = checks.filter((c) => c.status === 'fail').length;

console.log(
  `\n${BOLD}Summary${RESET}  ${GREEN}${passed} passed${RESET}, ` +
    `${YELLOW}${warned} warnings${RESET}, ${RED}${failed} failed${RESET}\n`,
);

if (failed > 0) {
  console.log(
    `${DIM}Missing tables are expected on a fresh project. Apply the HobyMine schema\n` +
      `in the Supabase SQL editor (or provide a database connection string) and re-run.${RESET}\n`,
  );
}

try {
  const dir = resolve(root, 'logs');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = resolve(dir, `supabase-connection-${stamp}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        url,
        checkedAt: new Date().toISOString(),
        summary: { passed, warned, failed },
        checks,
      },
      null,
      2,
    ),
  );
  console.log(`${DIM}Report written to ${file}${RESET}\n`);
} catch (error) {
  console.log(`${DIM}Could not write the report file: ${error.message}${RESET}\n`);
}

process.exit(failed > 0 ? 1 : 0);

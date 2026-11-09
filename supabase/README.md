# Supabase integration

Project: `https://orwsthtoopdjmtoojkhb.supabase.co`

## Configuration

| Location | Variables | Safe to ship? |
| --- | --- | --- |
| `apps/web/.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes — Vite inlines these into the web bundle and APK |
| Repo-root `.env` | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | No — server only |
| Repo-root `.env` | `DATABASE_URL` (session pooler, used by the API) | No — contains the database password |

The browser client lives in `apps/web/src/lib/supabase.ts` and is created at boot from
`apps/web/src/main.tsx`. It refuses to start if a `sb_secret_` key is ever placed in a
`VITE_*` variable, because Vite would embed it in the shipped JavaScript and anyone
could bypass Row Level Security with it.

`SUPABASE_SECRET_KEY` is intentionally left empty. Only set it for server-side work
that must bypass RLS, and never expose it to the web app.

## Connection test

```bash
npm run test:supabase
```

This checks Auth, the HobyMine tables, Realtime (WebSocket subscribe) and Storage,
and writes a JSON report to `logs/supabase-connection-*.json`.

## Current status

- All 17 tables exist: `users`, `preferences`, `swipes`, `matches`, `messages`,
  `stories`, `story_likes`, `story_views`, `blocks`, `reports`, `verifications`,
  `call_usage`, `video_usage`, `like_usage`, `message_reactions`,
  `password_resets`, `profile_views`.
- Row Level Security is enabled on every table. The publishable key can see no
  rows; the Express API connects with a privileged role that bypasses RLS.
- Realtime publication includes `messages`, `stories`, `story_likes`,
  `story_views`.
- Auth (GoTrue) reachable, email/password enabled, invalid logins rejected.
- Storage API answers. The API creates the public `media` bucket on boot when
  `SUPABASE_SECRET_KEY` is set, and writes user uploads there when it is hosted
  on a cloud machine with an ephemeral disk.

## Pushing schema changes

```bash
npm run db:supabase
```

This applies `supabase/migrations/20261108000000_hobymine_schema.sql`. It needs a
DDL credential in the repo-root `.env`: `SUPABASE_DB_PASSWORD` (or
`SUPABASE_DB_URL`, or a `SUPABASE_ACCESS_TOKEN`). API keys cannot run DDL.

## Creating the tables from scratch

The schema is maintained in `apps/api/src/db/schema.sql` and mirrored in the
migration above. Either run `npm run db:supabase` or paste the migration into
**Supabase Dashboard → SQL Editor**.

Before exposing any table through the publishable key, enable Row Level Security
and add policies. The Express API connects as a privileged database role, so
deny-all policies for `anon`/`authenticated` do not break it.

## Migrating local data

```bash
npm run migrate:supabase
```

Copies every row from `apps/api/data/pg` into Supabase in foreign-key order,
using `ON CONFLICT DO NOTHING` so it is safe to re-run. It reads the local engine
directly, so stop the API first. Row counts are printed and verified per table.

## Note on the data layer

HobyMine now runs on Supabase Postgres: `DATABASE_URL` in the repo-root `.env`
points at the IPv4 session pooler, so the API reads and writes the cloud database.
Local PGlite is only a fallback when `DATABASE_URL` is empty. Realtime chat and
calls still use Socket.io (not Supabase Realtime); the chat/story tables are in
the Realtime publication but no browser client subscribes to `postgres_changes`
yet. When the API is deployed (see `DEPLOY.md`), uploads go to the Supabase
Storage `media` bucket; local runs keep writing to `apps/api/uploads`.

```bash
npm run migrate:uploads   # copy existing files + rewrite stored paths
```

Moving chat/stories to Supabase Realtime instead of Socket.io would also require
migrating authentication to Supabase Auth and adding RLS policies keyed on
`auth.uid()`.

## Secret key

A secret key (`sb_secret_…`) was shared in chat. It is **not** stored in this
repository. Rotate it in the Supabase dashboard if it was exposed anywhere else.

# Deploying HobyMine to Railway

This is the 24/7 setup: one Railway service runs the Express + Socket.io API,
and that same process serves the built React PWA. Postgres lives in Supabase,
and uploads live in a Supabase Storage bucket. Nothing depends on the
development PC being switched on.

```
Android APK  ──HTTPS/WSS──>  Railway service "hobymine-api"  ──>  Supabase Postgres (session pooler)
Browser / PWA ─HTTPS/WSS──>  (apps/api + apps/web/dist)      └──>  Supabase Storage (bucket "media")
```

**Live service:** <https://hobymine-api-production.up.railway.app>

| | |
| --- | --- |
| Railway project | `hobymine` |
| Service | `hobymine-api` (environment `production`) |
| Region | Amsterdam (`europe-west4`), next to Supabase `eu-central-1` |
| Health check | `GET /api/health` (timeout 300 s) |

## 1. What Railway runs

| Setting | Value |
| --- | --- |
| Source | GitHub `abderezzakbenaicha/hobymine`, branch `main` |
| Builder | Railpack (Railway default, Node auto-detect) |
| Node | 22.12.0, pinned by `.nvmrc` and `.node-version` |
| Build command | `npm install --include=dev --no-audit --no-fund && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Restart policy | On failure, 10 retries |
| Replicas | 1 |

`npm run build` compiles the web app first and then the API. The compiled API
serves `apps/web/dist` (SPA fallback included), so the public URL is the whole
app — API, uploads, Socket.io and the PWA — on one origin.

Two deliberate choices:

- **`npm install`, not `npm ci`.** The builder keeps a cached Vite directory
  (`apps/web/node_modules/.vite`) in the build container; `npm ci` tries to
  delete it and fails with `EBUSY`. `npm install --include=dev` reconciles the
  workspace without wiping it, and keeps TypeScript/Vite available even though
  `NODE_ENV=production` is set for the service.
- **`.railwayignore`** mirrors `.gitignore` for `railway up` uploads (local
  source deploys). GitHub deploys use `.gitignore` instead.

`railway.json` in the repository root declares the same build/start/health
settings so a fresh service picks them up automatically. Railway has deprecated
this file in favour of Infrastructure as Code (`.railway/railway.ts`) — it keeps
working until 2026-12-01, and the settings above are also stored on the service
itself, so nothing breaks when the file is retired.

## 2. Environment variables

All of these are set on the `hobymine-api` service.

| Key | Value / source |
| --- | --- |
| `DATABASE_URL` | Supabase → Connect → **Session pooler** (IPv4) |
| `JWT_SECRET` | 96-character random hex, generated once for the service |
| `SUPABASE_URL` | `https://orwsthtoopdjmtoojkhb.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → secret key |
| `SUPABASE_STORAGE_BUCKET` | `media` |
| `NODE_ENV` | `production` |
| `WEB_ORIGIN` | `https://hobymine-api-production.up.railway.app` |
| `VITE_API_URL` | `https://hobymine-api-production.up.railway.app` |
| `VITE_SUPABASE_URL` | same as `SUPABASE_URL` (publishable, safe in the bundle) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key |
| `NIXPACKS_NODE_VERSION` / `RAILPACK_NODE_VERSION` | `22.12.0` |

Notes:

- `VITE_*` values are read by Vite **at build time**. Railway exposes service
  variables to the build, so changing `VITE_API_URL` requires a redeploy for the
  bundle to pick it up. Process environment variables win over
  `apps/web/.env.production`.
- `SUPABASE_SECRET_KEY` is server-only. Never move it to a `VITE_*` variable —
  Vite would inline it into the APK.
- `DATABASE_URL` must use the **session pooler** host
  (`aws-1-<region>.pooler.supabase.com`), not `db.<ref>.supabase.co`: the direct
  host is IPv6-only and Railway connects over IPv4.

Set them with the CLI (`--stdin` keeps secrets out of your shell history):

```bash
railway variable set NODE_ENV=production SUPABASE_STORAGE_BUCKET=media \
  --service hobymine-api

echo "$DATABASE_URL" | railway variable set DATABASE_URL --stdin --service hobymine-api
echo "$SUPABASE_SECRET_KEY" | railway variable set SUPABASE_SECRET_KEY --stdin --service hobymine-api
railway variable set "JWT_SECRET=$(openssl rand -hex 48)" --service hobymine-api
```

## 3. Deploy

### From GitHub (recommended, used in production)

1. Install the Railway GitHub App once and grant it access to the repository:
   <https://github.com/apps/railway-app/installations/new>
2. Connect the repository to the service:

   ```bash
   railway link            # pick project "hobymine"
   railway service source connect \
     --repo abderezzakbenaicha/hobymine --branch main --service hobymine-api
   ```

3. Push to `main`. Railway builds and deploys automatically.

If `service source connect` answers `User does not have access to the repo`, the
GitHub App step has not been completed (or the installation does not include
this repository).

### From a local checkout

Useful when the repository is not linked yet, or for a hotfix:

```bash
railway up --service hobymine-api
railway up --ci --service hobymine-api   # stream build logs, exit after build
```

`railway up` uploads the working tree (honouring `.railwayignore`), builds on
Railway and swaps the deployment once `/api/health` answers.

## 4. Point the app at the cloud API

`apps/web/.env.production` and `NATIVE_FALLBACK_BASE` in
`apps/web/src/lib/apiConfig.ts` both carry the Railway URL, so a release APK
defaults to it:

```env
VITE_API_URL=https://hobymine-api-production.up.railway.app
```

Then rebuild:

```bash
npm run build
npm run apk:release        # or the documented Android build command
```

The API address is baked into the build from `VITE_API_URL`; there is no
in-app server setting. If the service is ever renamed, update that value and
rebuild the app.

## 5. Move existing uploads into Supabase Storage

Run once from a machine that still has `apps/api/uploads`:

```bash
npm run migrate:uploads
```

It uploads every file to the `media` bucket and rewrites `/uploads/...` paths in
`users.photos`, `users.voice_intro_url`, `messages.media_url`,
`messages.story_media_url`, `stories.media_url` and `verifications.selfie_url`.
Safe to re-run.

## 6. Operations

| Task | Command |
| --- | --- |
| Check health | `curl https://hobymine-api-production.up.railway.app/api/health` |
| Tail logs | `railway logs --service hobymine-api` |
| List deployments | `railway deployment list --service hobymine-api` |
| Redeploy current build | `railway redeploy --service hobymine-api` |
| Open the dashboard | `railway open` |

Verified after the migration:

- `GET /api/health` → `{"ok":true,"service":"hobymine-api","database":"postgres"}`
- `GET /` → the built PWA (HTML 200)
- `GET /socket.io/?EIO=4&transport=polling` → Socket.io handshake, WebSocket upgrade offered
- Upload → `https://orwsthtoopdjmtoojkhb.supabase.co/storage/v1/object/public/media/...` (HTTP 200)
- Supabase row counts unchanged (no reseed on boot: seeding only runs when `users` is empty)

## Notes

- **No idle sleep.** Railway keeps the single replica running; there is no
  Render-style 15-minute spin-down. Disable *App Sleeping* in service settings if
  it was ever enabled, otherwise the first request after an idle period pays a
  cold start.
- **Realtime chat and calls** use Socket.io / WebRTC on the same service. Railway
  supports WebSockets on the generated `*.up.railway.app` domain; keep traffic on
  one replica because socket rooms are in-memory.
- **Uploads** are written to Supabase Storage when `SUPABASE_URL` and
  `SUPABASE_SECRET_KEY` are both set; without them the API falls back to local
  disk, which is wiped on every deploy. The boot log must say
  `Uploads: Supabase Storage bucket "media"`.
- **Database** access uses the privileged `postgres` role, so Row Level Security
  (enabled on all 18 tables) does not block the API. The publishable key shipped
  in the app still cannot read the tables directly.
- **Seeding** runs on boot only when the `users` table is empty, so a redeploy
  never rewrites production data.
- **Trial credit.** Railway's free trial is a one-off credit; watch
  Project → Usage on the dashboard. Deploys stop once it is exhausted and a plan
  is required — the same class of issue that pushed this migration off Render's
  paid tier, so keep an eye on it.

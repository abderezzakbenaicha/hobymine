# Deploying HobyMine to Render

This is the 24/7 setup: the Express + Socket.io API runs on Render, Postgres
lives in Supabase, and uploads live in a Supabase Storage bucket. Nothing
depends on the development PC being switched on.

```
Android APK  ──HTTPS/WSS──>  Render web service (apps/api)
                                   │
                                   ├── Supabase Postgres (pooler)
                                   └── Supabase Storage (bucket "media")
```

## 1. What Render needs

| Setting | Value |
| --- | --- |
| Service type | Web Service |
| Runtime | Node |
| Build command | `npm ci && npm run build --workspace @hobymine/api` |
| Start command | `npm start` |
| Health check | `/api/health` |
| Plan | Starter (always on) or Free (sleeps after 15 min idle) |

`render.yaml` in the repository root already declares all of this, so the
Blueprint flow is a single click after the repository is connected.

### Environment variables

| Key | Source |
| --- | --- |
| `DATABASE_URL` | Supabase → Connect → **Session pooler** (IPv4) |
| `JWT_SECRET` | Any long random string; Render can generate one |
| `SUPABASE_URL` | `https://orwsthtoopdjmtoojkhb.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → secret key |
| `SUPABASE_STORAGE_BUCKET` | `media` |
| `NODE_ENV` | `production` |
| `PORT` | Set by Render automatically |

> `SUPABASE_SECRET_KEY` is server-only. Never put it in a `VITE_*` variable —
> Vite would inline it into the APK.

`DATABASE_URL` must use the **session pooler** host
(`aws-1-<region>.pooler.supabase.com`), not `db.<ref>.supabase.co`, because the
direct host is IPv6-only and Render does not route IPv6.

## 2. Deploy

1. Push this repository to GitHub/GitLab.
2. Render Dashboard → **New** → **Blueprint** → select the repository.
3. Fill in the `sync: false` secrets (`DATABASE_URL`, `SUPABASE_SECRET_KEY`).
4. Deploy, then confirm `https://<service>.onrender.com/api/health` returns
   `"database":"postgres"` and the uploads line in the logs mentions the
   Supabase bucket.

If the service name is not `hobymine-api`, note the real URL — it is baked into
the APK in step 4.

## 3. Move existing uploads into Supabase Storage

Run this once from a machine that still has `apps/api/uploads`:

```bash
npm run migrate:uploads
```

It uploads every file to the `media` bucket and rewrites `/uploads/...` paths in
`users.photos`, `users.voice_intro_url`, `messages.media_url`,
`messages.story_media_url`, `stories.media_url` and `verifications.selfie_url`.
Safe to re-run.

## 4. Point the app at the cloud API

Edit `apps/web/.env.production`:

```env
VITE_API_URL=https://hobymine-api.onrender.com
```

Also update `NATIVE_FALLBACK_BASE` in `apps/web/src/lib/apiConfig.ts` so a fresh
install uses the same address before any runtime override is stored.

Then rebuild:

```bash
npm run build
npm run apk:release        # or the documented Android build command
```

Users can still override the address under **Settings → Server connection** if
the service is renamed.

## 5. Keeping a free instance awake

Render's free plan suspends a service after 15 minutes without traffic, and the
next request pays a ~30–60 s cold start. For genuine 24/7 behavior use the
**Starter** plan. If you stay on free, point a free uptime monitor (for example
cron-job.org) at `https://<service>.onrender.com/api/health` every 10 minutes.

## Notes

- **Realtime chat and calls** use Socket.io on the same Render service. Render
  supports WebSockets, so no extra configuration is needed.
- **Uploads** are written to Supabase Storage when `SUPABASE_SECRET_KEY` is set.
  Without it the API falls back to local disk, which is wiped on every deploy.
- **Database** access uses the privileged `postgres` role, so Row Level Security
  (enabled on all 18 tables) does not block the API. The publishable key shipped
  in the app still cannot read the tables directly.
- **Seeding** runs on boot only when the `users` table is empty, so a redeploy
  never rewrites production data.

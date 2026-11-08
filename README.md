# HobyMine — Find your frequency

A full-stack, mobile-first dating app demo inspired by modern swipe apps: swipeable discovery, mutual-like matches, real-time chat, verification, safety tools, and an HobyMine Plus membership flow.

Built as a **React 18 + Vite PWA**, an **Express + Socket.io API**, and **PostgreSQL** (with a zero-setup embedded PostgreSQL engine for local development).

> **Independent demo.** This project is not affiliated with, endorsed by, or connected to any dating brand. All profiles, portraits, names, and conversations are generated for demonstration. See [Disclaimer](#disclaimer).

---

## Contents

- [What’s included](#whats-included)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Demo walkthrough](#demo-walkthrough)
- [Scripts](#scripts)
- [Troubleshooting: the app cannot reach the server](#troubleshooting-the-app-cannot-reach-the-server)
- [Project structure](#project-structure)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Realtime events](#realtime-events)
- [Data model](#data-model)
- [Database modes](#database-modes)
- [Production build](#production-build)
- [PWA install](#pwa-install)
- [Android APK](#android-apk)
- [Always-on local backend](#always-on-local-backend)
- [Design system](#design-system)
- [Security and privacy](#security-and-privacy)
- [Known demo limitations](#known-demo-limitations)
- [Disclaimer](#disclaimer)

---

## What’s included

### Discovery and matching

- Gesture-driven card deck: drag right to **Like**, left to **Pass**, up to **Super Like**.
- **Story-style photo navigation**: tap the right third of a card for the next photo and the left third for the previous one, with progress dashes across the top showing where you are out of the uploaded photos. The dashes, the arrows and the **Info** button are their own tap targets, so tapping a control never also steps the photo.
- **Full profile view**: the **Info** button expands the card into the whole profile — every photo, the bio, interests with the shared ones highlighted, country, distance and verified state — and you can still Like, Pass or Super Like from there.
- Keyboard shortcuts (`←`, `→`, `↑`) and accessible action buttons.
- Smooth exit animations, stacking, like/nope/super-like stamps, and haptic feedback where supported.
- Global **country picker** with searchable ISO 3166-1 coverage (250 countries and territories), used to anchor distance and discovery.
- Filters for **age range**, **distance**, **gender** and **country**, with live distance calculation.
- **Location modes**: *Nearby* (strict radius around your shared GPS position) or *Worldwide* (no distance bound at all). A country can always be picked manually instead.
- **GPS detection**: the app asks for the Android runtime location permission, reads the device position and works out the city and country (Android `Geocoder`, with the bundled country dataset as the fallback).
- **Undo / rewind** the last swipe (blocked once a match already exists).
- Mutual-like detection, a full-screen **“It’s a match”** celebration, and direct chat hand-off.
- **Real people only**: the seeded automated personas and the auto-reply bot are gone. Discovery, likes, matching and chat involve registered accounts or the optional launch profiles created by `seed:profiles`, which are flagged `is_seeded` and never reply on their own.

### Chat

- Real-time messaging over **Socket.io** with optimistic sends.
- Typing indicators and live conversation updates.
- Read receipts (blue double checks for Plus members; locked state for free members).
- **Free-tier message cooldown**: free members can send one message every 3 minutes. The composer counts down, the send button locks, and the server rejects early messages with `429 message_cooldown` — the rule cannot be bypassed from the client. HobyMine Plus members are never throttled.
- Image sharing, voice notes (MediaRecorder, up to 2 minutes), and an audio player.
- **1-on-1 voice and video calls**: tap the phone or video button in a conversation, the other person gets an incoming call screen, and the media runs peer to peer over WebRTC while the socket relays the offer, answer and ICE candidates. Video calls start on the front camera; the in-call controls include a **flip-camera button** that swaps between the front and rear camera mid-call by replacing the outgoing video track, so the call is not renegotiated and the audio keeps running. On the rear camera, devices that report zoom capability get a **zoom bar and 0.5x/1x/2x/3x chips**: 0.5x switches to the ultra-wide lens when the camera exposes it, the slider zoom is continuous up to the sensor limit, and the controls stay hidden on hardware without zoom support (the chosen zoom is kept when flipping cameras). Zoom is requested as a camera PTZ constraint during capture, because Chromium only exposes zoom after that permission is granted. The **speaker/earpiece button appears on voice calls only**; video calls keep the speakerphone route. Video calls use a **translucent, WhatsApp-style layout**: a frosted name/timer pill at the top, a floating pill-shaped control cluster (mute, camera, flip, end) at the bottom, and a matching frosted zoom card. The controls **appear for two seconds when the call connects and then fade away**; tapping anywhere on the video background toggles them again. Tapping **your own small preview** (or its expand icon) enlarges your video and shrinks the other person into the corner tile; tapping **the other person's tile** brings them back to full screen. These are one-way enlarge actions, so a stray tap can never flip the layout unexpectedly. The first minute of video is free; when it is used up the call ends with the HobyMine Plus upgrade prompt.
- **Screenshot and screen-recording protection**: in the Android app, an open 1-on-1 chat and an active video call are marked secure, so Android blocks screenshots, screen recordings and the recent-apps preview. A blocked attempt also alerts the other participant with an inline chat notice or an in-call banner.
- Icebreaker suggestions, match headers, profile peek, report/block, and unmatch.
- The chat is a full-screen, WhatsApp-style surface: it fills the whole viewport, with the app sidebar and bottom navigation out of the way.

### Profiles and identity

- Multi-photo profile editor (up to 6 photos) with cover-photo ordering and uploads.
- Bio, job, country, age, gender, interests, and “looking for” preferences.
- Searchable country picker shared by onboarding, profile editing, preferences, and the discovery filter sheet.
- Profile strength checklist and public preview.
- Selfie verification flow with an instant demo approval and verified badges across the app.
- **Email confirmation at sign up**: a six digit code confirms the address before the rest of the app unlocks, with a resend button, a one-minute cooldown and a five-guess limit.
- **Mandatory 18+ confirmation**: sign up requires an explicit “I am 18 or older” checkbox, enforced again by the API and recorded with a timestamp.
- **Terms of Service and Privacy Policy**: readable in-app at `/legal/terms` and `/legal/privacy`, linked from sign up, the profile account settings, and discovery preferences.
- Report and block tools on every profile and chat screen, a safety centre, and a mutual block list.

### HobyMine Plus

- Weekly (**$1.99**), monthly (**$6.99**) and yearly (**$39.99**, save 52%) plans with a simulated checkout (no payment details collected). The prices live in the API and are published on `GET /api/plus/plans`.
- **Instant messaging**: Plus members skip the free-tier 3-minute message cooldown entirely.
- Freemium likes: free accounts get a blurred teaser grid, while Plus members see clear photos, full profiles, and can like back.
- Server-enforced Plus gating for **profile boost** and **read receipts**.
- 30-minute boost with an active/paused state.
- Read-receipt preference toggle.
- Cancel/reactivate membership, with immediate tool lock-out on cancellation.

### Platform

- Responsive layouts for phones, tablets, and desktop (sidebar on large screens).
- Light interface by default, with a dark neon alternative, both keeping the coral `#EC5553` brand accent.
- PWA manifest, installable app shell, generated PNG/SVG icons, and a production service worker.
- Seeded data, uploads, health checks, and an API smoke test.
- Android shell with a working hardware back button and proper runtime permissions for the microphone, camera and photo library.
- **Multi-device sync**: the same account can be signed in on several phones at once. Profile, premium status, the free-tier cooldown, matches, messages, read state and typing indicators all travel over the socket, and every device re-syncs (account, conversations and the open chat) as soon as it reconnects.
- **Light, dark and system themes**: **Light Mode** is the default; a switcher in **Profile → Appearance** also offers **Dark Mode** and **System Default**. The choice is remembered on the device, applied before the first paint so a reload never flashes the wrong theme, and drives the Android status-bar and navigation-bar icon colours.
- **Layout that holds up on small screens**: the deck gives up height on short viewports (landscape phones, split screen) so the action bar stays on screen, the card sizes its own typography with container queries, and the bars, badges and controls no longer overlap.
- TypeScript strictness across both apps.

---

## Tech stack

| Layer      | Technology                                                                 |
| ---------- | -------------------------------------------------------------------------- |
| Frontend   | React 18, Vite 6, TypeScript, React Router 6, Zustand, Framer Motion        |
| Styling    | Tailwind CSS 3, custom design tokens, `@fontsource-variable/inter`           |
| Realtime   | Socket.io 4 (client + server)                                               |
| Backend    | Node.js, Express 4, Zod, JWT, bcryptjs, Helmet, express-rate-limit, Multer |
| Database   | PostgreSQL via `pg`, or embedded PGlite for zero-setup local runs          |
| PWA        | Web app manifest + service worker (production)                             |
| Tooling    | npm workspaces, tsx, concurrently, TypeScript 5.7                          |

---

## Quick start

### Prerequisites

- **Node.js 20.19+**
- **npm 10+**
- No database server is required for local development.

### Run it

```bash
npm install
npm run dev
```

Open **http://localhost:5173**.

The API starts on **http://localhost:4000**. The first launch creates the embedded database, applies the schema, and seeds demo data automatically.

### Creating an account

There is no demo login on the sign-in and sign-up screens any more: everyone
creates a real account with a real email address. Addresses are validated on
the device **and** on the API — malformed, random or placeholder addresses
(`notanemail`, `test@test`, `asdf@asdf.com`, `someone@example.com`, throwaway
mail providers, …) are rejected with a clear message, and mistyped provider
domains are caught too (`abigail@gmial.com` → “Did you mean @gmail.com?”).

Because HobyMine ships no automated personas, a single account sees an empty
deck. To exercise matching, chat and calls, create a second account (a second
browser, a private window, or your phone):

```bash
node apps/api/scripts/create-second-caller.mjs   # prints a second account that is matched with the demo account
```

### Confirming your email

Signing up is followed by a six digit confirmation code, so only reachable
addresses can take part. The code is stored hashed for ten minutes, costs
`POST /api/auth/verify-email` to redeem, is refused after five wrong guesses
and cannot be reused; `POST /api/auth/resend-verification` issues a new one
after a one-minute cooldown. The account is already signed in while this step
is pending, but the app keeps it on the confirmation screen until the code
checks out.

There is no mail provider in the demo, so outside production the code comes
back in the API response (`devCode`), is printed in the server log
(`[hobymine] Email verification code for …`) and is shown on the confirmation
screen.

The seeded `demo@hobymine.app` account still exists for local testing (the
`POST /api/auth/demo` endpoint), it is simply not offered in the interface.

---

## Demo walkthrough

1. **Sign up** on the welcome screen, then enter the six digit confirmation code shown on screen to confirm your email (or sign in with an existing account), and create a second account on another device or browser.
2. **Swipe right** on the other person from both accounts — the match celebration appears for whoever swipes second.
3. Open the conversation and **send a message**. Typing indicators, read receipts and live updates work over Socket.io.
4. Tap the **phone button** in the chat header to start a **1-on-1 voice call**. The other side gets an incoming call screen; accept to talk.
5. Visit **Profile → Edit profile**. The old City field is gone; use the searchable **Country** picker (try “Japan”), save, and return to Discover.
6. Open **Filters** to narrow the deck by age, distance and **country**.
7. Open **Verify** and choose **“Use the demo selfie instead”** to earn the verified badge.
8. Open **Matches → Likes** to see the blurred teaser grid. Subscribe to **HobyMine Plus** ($1.99 weekly / $6.99 monthly / $39.99 yearly) to reveal clear photos and full profiles, then run a boost or turn read receipts on/off.
9. Use **Safety** and the chat menu to inspect reporting and blocking. Blocks are mutual and remove the match immediately.

> **Reset the demo:** stop the dev server, run `npm run seed:reset`, then restart `npm run dev`.

---

## Scripts

Run these from the repository root.

| Command              | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| `npm run dev`        | Start API (`:4000`) and Vite (`:5173`) together with hot reload     |
| `npm run dev:api`    | Start only the API with tsx watch                                  |
| `npm run dev:web`    | Start only the Vite dev server                                     |
| `npm run build`      | Type-check and build the web app, then compile the API             |
| `npm run serve`      | Run the API from TypeScript **without** watch mode (stable, LAN)   |
| `npm start`          | Start the compiled API (serves `apps/web/dist` when present)       |
| `npm run db:recover` | Archive an unusable embedded database so the next start reseeds    |
| `npm run typecheck`  | Type-check both workspaces                                         |
| `npm test`           | Run the API smoke test against in-memory PostgreSQL                |
| `npm run seed:reset` | Wipe and reseed the local embedded database                        |
| `npm run seed:profiles` | Insert the 100 launch profiles (50 women, 50 men, `is_seeded`)  |
| `npm run seed:clear` | Delete every profile created by `seed:profiles`                    |
| `npm run countries`  | Regenerate the shared 250-country dataset from `world-countries`   |
| `npm run art`        | Regenerate the original seed portrait SVGs and voice-note asset    |
| `scripts\install-autostart.ps1` | Install or `-Uninstall` the always-on backend          |
| `scripts\server-status.ps1`     | Health, phone URL, firewall and autostart in one view  |
| `scripts\start-api-service.ps1` | Supervisor the autostart entry runs; restarts the API  |

> `npm run dev:api` uses `tsx watch`. On Windows, a file-save restart can kill
> the process while PostgreSQL is writing a checkpoint and corrupt the embedded
> database. For a long-running LAN session (phone connected), use
> `npm run serve` or `npm start` instead, and stop it with **Ctrl+C** rather than
> closing the window or killing the process.

Two small helpers live in `apps/api/scripts` (stop the API first, the
embedded database is single-process):

| Script                                  | Description                                                      |
| --------------------------------------- | ---------------------------------------------------------------- |
| `create-second-caller.mjs`              | Registers a second account that matches the demo account          |
| `cleanup-test-accounts.mjs <id> [...]`  | Deletes throwaway accounts and their matches/messages            |

### Launch profiles

`npm run seed:profiles` adds 100 believable profiles for the launch demo — 50
women and 50 men, aged 20–30 — spread evenly across four markets: the
Philippines (Manila, Cebu), Colombia (Bogotá, Medellín), Brazil (São Paulo) and
Morocco (Casablanca, Marrakech). Each market gets 25 profiles with local names,
bios, languages, country codes and coordinates.

Every profile lists its portraits explicitly and no photo is shared between two
profiles: most people have one photo, while a hand-checked subset has two or
three shots of the *same* person, so a carousel never mixes faces. The script is
idempotent, so it is safe to run twice; it also removes seeded rows left over
from an older roster.

Every row it creates has `is_seeded = TRUE`; real registrations always have
`FALSE`. When the real user base is large enough, remove the whole batch — and
anything that cascades from it — with one statement:

```sql
DELETE FROM users WHERE is_seeded = TRUE;
```

Or run `npm run seed:clear` (stop the API first). Seeded accounts cannot be
signed into: they use a random password hash that is never printed.

---

## Troubleshooting: the app cannot reach the server

The welcome screen shows an offline banner with **Retry** and **Server** when the
API does not answer. Work through this list in order.

1. **Is the API running?** Run `scripts\server-status.ps1` — it prints whether the
   server is up, the exact URL the phone must use, the firewall state and the
   autostart state in one screen. With the always-on setup below you should
   never need to start it by hand.
2. **Same network?** The phone and the PC must be on the same Wi-Fi. The API
   prints the address to use, for example `http://192.168.1.33:4000`. `localhost`
   in the app points at the phone, not at your PC.
3. **Correct address on the device?** Open **Welcome → Server** (or
   **Profile → Server connection**), tap **Auto-detect on Wi-Fi**, or type the
   printed LAN URL. A rebuilt APK only changes the *default*; the saved value
   wins.
4. **Windows Firewall.** `start-server.cmd` runs `scripts/allow-firewall.ps1`
   once and creates the `HobyMine API (TCP 4000)` inbound rule. Run it in an
   elevated PowerShell if the rule is missing:
   `powershell -ExecutionPolicy Bypass -File scripts\allow-firewall.ps1`.
   Note that a Wi-Fi network set to **Public** blocks more traffic; the rule is
   created for all profiles, but a guest/isolated Wi-Fi can still block
   phone-to-PC traffic (client isolation).
5. **Address changed.** A new router lease changes the LAN IP. The app retries,
   probes addresses it used before, then scans the subnet, so it normally
   recovers on its own; the manual fallback is **Profile → Server connection**.
   The durable fix is a DHCP reservation for this PC in the router.
6. **API crashes at startup with `PANIC: could not locate a valid checkpoint record`
   or `RuntimeError: Aborted()`.** The embedded database was interrupted while
   writing (typically a `tsx watch` restart or a killed process) and PostgreSQL
   cannot recover it. Stop the server and run:

   ```bash
   npm run db:recover
   ```

   This moves `apps/api/data/pg` to `apps/api/data/pg-corrupt-<timestamp>` and
   leaves it untouched for inspection. Start the API again: it creates a fresh
   database, applies the schema, and reseeds the demo data
   (`demo@hobymine.app` / `Password123!`). Accounts and messages created after
   the last good backup are **not** restored from a corrupt directory.

---

## Project structure

```text
ofo-clone/
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  │  ├─ db/                 # PGlite/pg adapter, schema, seed, reset
│  │  │  ├─ lib/                # auth, HTTP errors, uploads, serializers, countries, bot
│  │  │  ├─ routes/             # auth, users, discovery, matches, plus, safety
│  │  │  ├─ test/smoke.ts       # integration smoke test
│  │  │  ├─ app.ts              # Express app + static web serving
│  │  │  ├─ config.ts           # environment loading
│  │  │  ├─ index.ts            # HTTP + Socket.io bootstrap
│  │  │  └─ socket.ts           # Socket.io auth, rooms, typing, presence
│  │  └─ uploads/               # User-uploaded photos and voice notes
│  └─ web/
│     ├─ public/                # Manifest, service worker, icons, seed art, audio
│     ├─ android/               # Capacitor Android project (APK packaging)
│     └─ src/
│        ├─ components/         # App shell, swipe deck, modals, country picker…
│        ├─ lib/                # API client, socket client, countries, helpers
│        ├─ pages/              # Welcome, Discover, Matches, Chat, Profile, Plus…
│        ├─ store/              # Zustand auth/chat/ui stores
│        ├─ App.tsx             # Routes and guards
│        └─ index.css           # Tokens, component classes, responsive polish
├─ scripts/generate-countries.mjs
├─ scripts/generate-seed-art.mjs
├─ .env.example
└─ package.json
```

---

## Configuration

Copy the example file if you want to change defaults:

```bash
cp .env.example .env
```

The API reads `.env` from the repository root and from `apps/api/.env` (root first). Real environment variables take precedence.

| Variable        | Default                     | Purpose                                                        |
| --------------- | --------------------------- | -------------------------------------------------------------- |
| `PORT`          | `4000`                      | API and Socket.io port                                          |
| `HOST`          | `0.0.0.0`                   | Interface to bind; use `127.0.0.1` to block LAN access           |
| `JWT_SECRET`    | development fallback        | **Set a long random value in production**                       |
| `WEB_ORIGIN`    | _(allow all)_               | Comma-separated allowed CORS/Socket.io origins                  |
| `DATABASE_URL`  | _(empty → PGlite)_          | PostgreSQL / Supabase connection string                         |
| `PGLITE_DIR`    | `apps/api/data/pg`          | Embedded database directory                                     |
| `PGLITE_MEMORY` | `0`                         | Set to `1` for a throwaway in-memory database                   |
| `VITE_API_URL`  | _(same origin)_             | API base URL when the web app is hosted separately              |

`VITE_API_URL` is read by Vite from `apps/web/.env` (or the process environment) at build time. In local development the Vite proxy forwards `/api`, `/uploads`, and `/socket.io` to port 4000, so no value is needed. In the packaged Android app it is only the **default** server address: the user can change it at runtime under **Welcome → Server** or **Profile → Server connection** (stored in `localStorage`), so a changing LAN IP does not require a rebuild.

---

## API reference

All routes are prefixed with `/api`. Protected routes require:

```http
Authorization: Bearer <jwt>
```

Errors use a consistent envelope:

```json
{
  "error": {
    "code": "plus_required",
    "message": "HobyMine Plus is required for this feature.",
    "details": null
  }
}
```

### Auth

| Method | Path                 | Description                                      |
| ------ | -------------------- | ------------------------------------------------ |
| `POST` | `/auth/register`     | Create an account, return a JWT, and send the verification code |
| `POST` | `/auth/login`        | Sign in and return a JWT                         |
| `POST` | `/auth/verify-email` | `{ email, code }` — confirm the sign up address   |
| `POST` | `/auth/resend-verification` | `{ email }` — issue a new sign up code     |
| `POST` | `/auth/forgot-password` | `{ email }` — start the password reset flow   |
| `POST` | `/auth/reset-password`  | `{ email, code, password }` — set a new password |
| `POST` | `/auth/demo`         | Sign in to the seeded test account (dev only)    |
| `GET`  | `/auth/me`           | Current user (also available as `GET /me`)        |

Registration requires a valid ISO 3166-1 alpha-2 `countryCode` (for example `"SG"` or `"JP"`), along with name, email, password, age, and gender, plus a **real, deliverable email address** — malformed and placeholder addresses are rejected with a clear message. The response carries `user.emailVerified: false` and, outside production, the `devCode` to redeem. Country changes on `PATCH /me` use the same code and automatically update the stored country anchor used by discovery.

### Profile and discovery

| Method   | Path                    | Description                                               |
| -------- | ----------------------- | --------------------------------------------------------- |
| `GET`    | `/me`                   | Current user + preferences                               |
| `PATCH`  | `/me`                   | Update name, age, bio, job, country, interests, gender    |
| `POST`   | `/me/photos`            | Upload a photo (`multipart/form-data`, field `photo`)     |
| `DELETE` | `/me/photos`            | Remove a photo by URL                                     |
| `PATCH`  | `/me/preferences`       | Update age range, distance, gender mix, verified-only and country |
| `GET`    | `/users/:id`            | Public profile (blocked users return 404)                 |
| `GET`    | `/discovery`            | Filtered deck + `likesYouCount`                           |
| `GET`    | `/likes`                | Likes teaser grid (blurred for free, clear for Plus)      |
| `POST`   | `/swipes`               | `{ targetId, action: "like" \| "pass" \| "superlike" }`   |
| `DELETE` | `/swipes/:targetId`     | Undo the last swipe if no match exists                    |

### Matches and messages

| Method   | Path                      | Description                                               |
| -------- | ------------------------- | --------------------------------------------------------- |
| `GET`    | `/matches`                | Match summaries, last message, unread count               |
| `GET`    | `/matches/:id`            | One match with profile data                               |
| `DELETE` | `/matches/:id`            | Unmatch                                                   |
| `GET`    | `/matches/:id/messages`   | Paginated message history (`?limit=80`)                   |
| `POST`   | `/matches/:id/messages`   | Send text, image, or voice message                        |
| `POST`   | `/matches/:id/read`       | Mark incoming messages as read                            |

Sending a message returns `{ message, cooldownUntil }`. `cooldownUntil` is
`null` for Plus members and an ISO timestamp for free members, who have to
wait three minutes between messages. Sending too early returns
`429 message_cooldown` with `details.retryAfterSeconds` and
`details.cooldownEndsAt`. `GET /me` also reports `messageCooldownUntil`, so
every device signed in to the account knows when it may talk again.

### Plus

| Method | Path                    | Description                                      |
| ------ | ----------------------- | ------------------------------------------------ |
| `GET`  | `/plus/plans`           | Published plan prices (weekly $1.99, monthly $6.99, yearly $39.99) |
| `POST` | `/plus/subscribe`       | `{ plan: "weekly" \| "monthly" \| "yearly" }` demo checkout |
| `POST` | `/plus/cancel`          | End membership immediately                       |
| `POST` | `/plus/boost`           | `{ enabled: boolean }` 30-minute boost           |
| `POST` | `/plus/read-receipts`   | `{ enabled: boolean }`                           |

### Safety and verification

| Method   | Path                        | Description                                   |
| -------- | --------------------------- | --------------------------------------------- |
| `POST`   | `/reports`                  | Report a user, optionally block them          |
| `GET`    | `/blocks`                   | Blocked accounts                              |
| `POST`   | `/blocks/:targetId`         | Block                                         |
| `DELETE` | `/blocks/:targetId`         | Unblock                                       |
| `POST`   | `/verification/selfie`      | Submit a selfie (`selfie` file or `selfieUrl`) |
| `GET`    | `/verification/status`      | Verification state                            |
| `POST`   | `/uploads`                  | Generic chat media upload (field `file`)      |
| `GET`    | `/health`                   | Liveness + active database engine             |

### Example

```bash
# Sign in
curl -X POST http://localhost:4000/api/auth/demo

# Fetch the deck
curl http://localhost:4000/api/discovery \
  -H "Authorization: Bearer <token>"

# Like someone
curl -X POST http://localhost:4000/api/swipes \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"targetId":"u_isla","action":"like"}'
```

---

## Realtime events

The client connects with `auth: { token }`. The server authenticates the JWT, joins per-user and per-match rooms, and re-checks membership for `match:join`.

| Direction        | Event                 | Payload                                              |
| ---------------- | --------------------- | ---------------------------------------------------- |
| Client → Server  | `match:join`          | `{ matchId }`                                        |
| Client → Server  | `typing:start/stop`   | `{ matchId }`                                        |
| Client → Server  | `presence:ping`       | _(none; refreshes `last_active_at`)_                 |
| Client → Server  | `call:invite`         | `{ matchId, callId }` — ring the other person         |
| Client → Server  | `call:accept`         | `{ matchId, callId }`                                 |
| Client → Server  | `call:decline`        | `{ matchId, callId }`                                 |
| Client → Server  | `call:end`            | `{ matchId, callId }`                                 |
| Client → Server  | `call:signal`         | `{ matchId, callId, description \| candidate }`       |
| Server → Client  | `message:new`         | Full `ChatMessage`                                   |
| Server → Client  | `message:read`        | `{ matchId, readerId, readAt }`                      |
| Server → Client  | `typing:start/stop`   | `{ matchId, userId }`                                |
| Server → Client  | `match:new`           | `MatchSummary`                                       |
| Server → Client  | `match:removed`       | `{ matchId }`                                        |
| Server → Client  | `superlike:received`  | `{ user }`                                           |
| Server → Client  | `call:incoming`        | `{ matchId, callId, fromUserId }`                    |
| Server → Client  | `call:accepted`        | `{ matchId, callId, fromUserId }`                    |
| Server → Client  | `call:declined`        | `{ matchId, callId, fromUserId }`                    |
| Server → Client  | `call:ended`           | `{ matchId, callId, fromUserId }`                    |
| Server → Client  | `call:signal`          | `{ matchId, callId, description \| candidate }`       |
| Server → Client  | `call:error`           | `{ matchId, reason: "busy" \| "not_allowed" }`       |

---

## Data model

| Table           | Purpose                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `users`         | Account, profile fields, `country_code` (ISO alpha-2), photos, `is_bot`  |
| `preferences`   | Gender mix, age range, max distance, verified-only, deck country         |
| `swipes`        | One row per swiper/target with `like`, `pass`, or `superlike`            |
| `matches`       | Canonical pair (`user_a < user_b`) with a unique constraint             |
| `messages`      | Text/image/voice/system messages, media URL, duration, read timestamp   |
| `blocks`        | Mutual visibility barrier between two users                             |
| `reports`       | Confidential moderation reports                                         |
| `verifications` | Selfie verification attempts and status                                 |
| `email_verifications` | One-time sign up codes (hashed, ten minute expiry)               |

The schema is applied automatically on startup (`apps/api/src/db/schema.sql`), including indexes for discovery, unread messages, block lookups, and country matching. Existing PGlite/PostgreSQL installs are migrated in place: `country_code` is added if missing, the discovery filters are added to `preferences`, the legacy `is_demo` column becomes `is_bot`, and the old automated personas are deleted so only real accounts remain.

Country storage is canonical (ISO alpha-2) while the display name and flag are derived from the shared dataset. Discovery first orders people in the viewer's country ahead of the rest, then includes same-country profiles regardless of the distance slider and applies the distance limit only across borders. This keeps a selected country meaningful without making large countries disappear when the nearest city is far from a centroid.

---

## Database modes

### Supabase (current)

This workspace runs against Supabase Postgres through the IPv4 session pooler.
`DATABASE_URL` in the repo-root `.env` points at the project; while it is set the
API never opens the local PGlite directory.

```env
DATABASE_URL=postgresql://postgres.<ref>:<db-password>@aws-1-<region>.pooler.supabase.com:5432/postgres?uselibpqcompat=true&sslmode=require
```

- `npm run db:supabase` creates or updates the schema. It needs a database
  password, `SUPABASE_DB_PASSWORD`, or a personal access token — API keys cannot
  run DDL.
- `npm run migrate:supabase` copies the local PGlite rows into Supabase. It is
  idempotent and verifies row counts.
- Row Level Security is enabled on every table. The API connects with the
  privileged `postgres` role, which bypasses RLS; the publishable key used by the
  browser cannot read the tables directly.
- `?uselibpqcompat=true&sslmode=require` keeps TLS enabled with libpq's `require`
  semantics, because the Supabase pooler presents its own CA.

### Embedded PGlite (fallback)

Used only when `DATABASE_URL` is empty. No installation, no Docker, no connection string. Data is stored under `apps/api/data/pg`.

```bash
npm run seed:reset   # wipe and reseed (stop the API first)
npm run db:recover   # archive a database that no longer starts
```

PGlite is excellent for demos and tests, but it is a single-process engine. Use real PostgreSQL for multi-instance deployments.

Because it is single-process, an abrupt stop (killed terminal, `tsx watch` restart on Windows) can leave a WAL checkpoint that PostgreSQL refuses to replay. The symptom is `PANIC: could not locate a valid checkpoint record` followed by `RuntimeError: Aborted()`. `npm run db:recover` renames the directory to `pg-corrupt-<timestamp>` instead of deleting it, and the next start creates a fresh seeded database. Do not run the recovery while the API owns the directory; the script refuses when port 4000 is answering.

### PostgreSQL

```bash
createdb hobymine
```

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hobymine
```

Restart the API. The schema is created if missing. For a managed provider, add TLS options to the connection string as required (for example `?sslmode=require`).

### Tests

`npm test` starts the API on a random port with an **in-memory** PGlite database, seeds it, exercises the flows, and exits. It never touches local demo data.

---

## Production build

```bash
npm run build
NODE_ENV=production \
JWT_SECRET="replace-with-a-long-random-secret" \
DATABASE_URL="postgres://…" \
npm start
```

The compiled API serves the built web app from `apps/web/dist` on port 4000, including SPA fallback routes. Socket.io runs on the same origin, so a single reverse proxy (Caddy, nginx, a PaaS) is enough.

Checklist:

- Set a strong `JWT_SECRET` and explicit `WEB_ORIGIN`.
- Supabase Postgres is the configured database; keep `DATABASE_URL` on the
  session pooler and leave RLS enabled.
- Terminate TLS at the proxy and forward WebSocket upgrades for `/socket.io`.
- Move uploads to object storage (S3/R2) before scaling horizontally.
- Replace the demo checkout and selfie review with real providers.
- Add backups, observability, and a moderation workflow.

---

## PWA install

The web app ships a manifest (`/manifest.webmanifest`) and a service worker (`/sw.js`).

1. Build and serve the production app (`npm run build && npm start`), or use a deployed HTTPS URL.
2. In Chrome/Edge, choose **Install app** from the address bar or menu.
3. The standalone app opens at `/discover`; unauthenticated users are redirected to the welcome screen.

Service-worker registration is intentionally limited to production builds so development refreshes are never cached.

---

## Always-on local backend

The phone can only reach the app while the API is running on the PC. Instead of
leaving a terminal window open, install the backend once as a supervised
background process:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
```

That command:

- verifies (and creates) the `HobyMine API (TCP 4000)` firewall rule,
- registers autostart — a per-user **Startup** shortcut, or a **scheduled task**
  that also starts at boot when run with `-Elevate`,
- starts `scripts\start-api-service.ps1`, a supervisor that restarts the API
  within seconds if it crashes and backs off when it keeps failing,
- writes `logs\api.log` (rotated at 5 MB) so failures are diagnosable,
- prints the URL the phone must use.

Nothing has to stay open. Closing the window, signing out or rebooting does not
stop the backend.

| Task | Command |
| --- | --- |
| Show status and the phone URL | `powershell -ExecutionPolicy Bypass -File scripts\server-status.ps1` |
| Also start at boot, before sign-in (UAC) | `... install-autostart.ps1 -Elevate` |
| Keep the PC awake while plugged in | `... install-autostart.ps1 -PreventSleep` |
| Remove autostart | `... install-autostart.ps1 -Uninstall` |
| Follow the log | `Get-Content logs\api.log -Tail 50 -Wait` |

Notes:

- The supervisor holds `logs\api-service.lock`, so a second copy exits instead of
  competing for port 4000. `start-server.cmd` detects the running server and only
  prints the status.
- **The LAN address can still change** when the router hands out a new lease. The
  app recovers on its own (retry, then known addresses, then a subnet scan), but
  the durable fix is a **DHCP reservation** for this PC in the router, so it
  always receives the same `192.168.x.x`.
- Sleep is the other reason a server "vanishes": Windows suspends every process
  while asleep. `-PreventSleep` disables standby only while plugged in.
- If the PC reboots and nobody signs in, a Startup shortcut cannot run. Only the
  scheduled task (`-Elevate`) covers that case.

---

## Android APK

The web app is packaged with **Capacitor 6** into a native Android shell. The APK bundles the React assets and calls the API over the network.

### App identity

The Android application ID is `com.hobymine.app` and the launcher label is **HobyMine**. The current build is version 1.12.0 (versionCode 16). The release build output is `apps/web/android/app/build/outputs/apk/release/app-release.apk`; convenient copies are placed at the repository root as `HobyMine-release.apk` (release) and `HobyMine-debug.apk` (debug).

Physical devices cannot use `localhost`, so the APK ships with the cloud API address. The build default is set in `apps/web/.env.production`:

```dotenv
VITE_API_URL=https://hobymine-api-production.up.railway.app
```

That service is described in [DEPLOY.md](DEPLOY.md): Express + Socket.io on Railway (serving the built PWA from the same origin), Postgres and uploads in Supabase, no dependency on the development PC. The app works from any network while the Railway service is up.

The address baked into the APK is only a default. If the service is renamed or the API moves, open the app and go to **Welcome → Server** (signed out) or **Profile → Server connection** (signed in). The sheet offers three ways to recover:

1. **Automatic.** While the backend is unreachable, the connection banner retries every few seconds and also probes the addresses this device has used successfully before. As soon as one answers (checked against `GET /api/health`, which must report `service: "hobymine-api"`), the app switches to it, reconnects Socket.io and restores the session. Resuming the app or coming back to Wi-Fi triggers an immediate probe instead of waiting for the timer.
2. **Auto-detect on Wi-Fi.** When no known address works, this checks the usual candidates and then scans the local `/24` subnet (port 4000) for a HobyMine server, with live progress. Tap a result to use it right away. This is what recovers a fresh install whose baked address is wrong.
3. **Manual.** Enter the new address such as `http://192.168.1.42:4000`, use **Test** to verify it, then **Save**.

The choice is stored on the device and used immediately by both the REST client and Socket.io.

Start the API — or install the [always-on backend](#always-on-local-backend)
once so it starts with Windows — and keep the phone on the same Wi-Fi.
`start-server.cmd` prints the current LAN URL and opens the firewall for it:

```bat
start-server.cmd
@REM   Phone / Wi-Fi:  http://192.168.1.33:4000
```

```bash
npm run dev:api
# The server logs every reachable URL, e.g.
#   local:   http://localhost:4000
#   network: http://192.168.1.33:4000  (Wi-Fi)
```

The API binds `0.0.0.0` by default and prints the current LAN address, so use that `network:` URL on the phone. Install with `adb install -r HobyMine-release.apk`. The app uses cleartext HTTP for the local demo API, so the phone and computer must be on the same network, and the computer firewall must allow inbound TCP 4000. `start-server.cmd` handles that by running `scripts/allow-firewall.ps1`, which asks for elevation once and adds an inbound rule scoped to the local subnet (LAN only). To do it by hand, run the same script from an elevated PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\allow-firewall.ps1 -Port 4000
```

Windows often classifies home Wi-Fi as a **Public** network, so the rule is created for all profiles but limited to `LocalSubnet`. Without it the phone times out even though the server is running — which looks exactly like a wrong address.

### Release build

The release APK is signed with a local keystore (`apps/web/android/app/hobymine-release.keystore`, described in `apps/web/android/app/keystore.properties`). Both files are git-ignored: the key never leaves the machine that builds it. If no keystore is present, the release build falls back to the debug key so it still produces an installable APK.

```bash
cd apps/web
npm run build            # bundles the web app with VITE_API_URL from .env.production
npx cap sync android     # copies dist/ into the Android project
cd android
./gradlew assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

On Windows PowerShell:

```powershell
cd apps/web
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleRelease
```

Toolchain requirements: JDK 17+ (JDK 21 verified), Android SDK platform 35, and Android build-tools 35.0.0. The project uses AGP 8.13 and Gradle 8.14.3. The generated `android/local.properties` points at the local SDK and is machine-specific.

### Rebuild for another API URL

Update `VITE_API_URL` in `apps/web/.env.production` (or set it in the shell), then rebuild and sync:

```bash
cd apps/web
VITE_API_URL=http://YOUR_LAN_IP:4000 npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

On Windows PowerShell:

```powershell
cd apps/web
$env:VITE_API_URL='http://YOUR_LAN_IP:4000'
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

### Safe area / status bar

Android 15 (API 35) draws apps edge to edge, so the WebView extends behind the
status bar. The `HobymineDevice` plugin reports the real window insets, the
web layer stores them in the `--safe-top` / `--safe-bottom` CSS variables, and
the `safe-top`, `safe-bottom`, `safe-bottom-nav` and `safe-bottom-composer`
classes add the padding. The top bar is a clean 56 px (like a native toolbar)
plus the status bar height, the bottom navigation and the chat composer clear
the gesture bar, and the WebView is painted in the app background colour so
nothing flashes white behind the system bars.

### Hardware back button
`MainActivity` hands the Android back button to the web app first:

1. An open dialog, sheet or drawer is closed.
2. Otherwise the app navigates back one screen (the router history index decides whether there is somewhere to go).
3. At the root of the app, the first press shows “Press back again to exit HobyMine” and a second press inside two seconds hands the press back to Android, which backgrounds the app instead of killing it.

### Microphone, camera, photo and location permissions

`AndroidManifest.xml` declares `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `CAMERA`, `READ_MEDIA_IMAGES`, legacy `READ_EXTERNAL_STORAGE`, `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION`. The app-level `HobyminePermissions` plugin asks for the runtime permission before a voice note, a photo upload or a voice call, and the WebView's own `onPermissionRequest` handler covers the media APIs. The `HobymineLocation` plugin requests the location permission and returns the last known position plus a reverse geocode (city and country). If a permission is refused, the feature explains what is needed instead of failing silently.

### Location and distance filters

The discovery filters have two modes:

| Mode | Behaviour |
| ---- | --------- |
| **Nearby** | Only people inside the distance radius (default 50 km), measured from the shared GPS position — or from the selected country when one is picked. |
| **Worldwide** | The distance bound is removed entirely: people from every country appear. |

`PUT /api/me/location` stores the GPS position and the detected city and switches the account to nearby mode; `PATCH /api/me/preferences` accepts `locationMode` and the distance radius.

### Voice notes

A recording is captured with the best container the device supports (WebM/Opus,
Ogg/Opus, MP4 or MP3), uploaded with the plain base MIME type and stored by the
API as `/uploads/<id>.webm` (or `.ogg`, `.m4a`, `.mp3`). Voice files are served
with an `audio/*` content type and byte ranges, so the player can stream and
seek them. Uploaded media paths are resolved against the API host, which is
what makes photos and voice notes load inside the packaged Android app. If a
WebView refuses to stream a clip, the player falls back to fetching it into
memory and playing it from a blob URL.

Uploads are always written to `apps/api/uploads`, no matter which directory the
server was started from — resolving them from the working directory made every
photo and voice note 404 as soon as the API ran from the repository root.

### Notifications

Incoming messages, super likes and matches raise a notification when the app is
in the background. On Android the `HobymineNotifications` plugin posts them
through the notification manager (channels: *Messages* and *Likes and matches*)
after the `POST_NOTIFICATIONS` runtime permission is granted; tapping a
notification reopens the app on the right conversation. The notification uses
the HobyMine mark (`res/drawable/ic_notification.xml`) as the small icon and
the launcher icon as the large one, so alerts never show a generic system
symbol.

**Background alerts** (Profile → *Background alerts*) keep a small foreground
service (`HobymineBackgroundService`) alive so messages still arrive when the
app has been closed or killed. The service polls the API, compares the unread
counters and posts the notification itself; it stays quiet while the app is in
the foreground, where the socket already handles the events. In the browser the
same events use the Notification API through the service worker.

### Calls

Calls are not locked behind a subscription. Free members can call **and always
receive** calls; they only have a fair daily budget (3 calls and 10 minutes of
talk time per day, `GET /api/calls/allowance`). The chat shows the remaining
budget, and the server refuses a call that is over the limit
(`call:error` with `reason: "limit"`). HobyMine Plus members are not limited.

### Images

Photos use the same pipeline: the system picker (or the camera) hands over a
file, the browser re-encodes it as a JPEG (Android galleries hand over HEIC
files that many browsers cannot decode), the API stores it and returns
`/uploads/<id>.jpg`, and the client resolves that path against the API host.
Avatars, the profile grid, the deck cards, the likes grid and chat bubbles all
go through the same helper, and a failed load falls back to initials instead
of a broken image icon.

### Screen scaling

The interface is sized in `rem` and the root font size grows with the viewport
(16 px → 18.5 px), so the app scales the way native apps do instead of looking
tiny on a large phone. The swipe card sizes its own typography with container
queries, so the name and the meta line always fit the card, and the headers
stack their controls on narrow screens instead of squeezing them. Android font
boosting is switched off so the type stays consistent with the design.

### Voice calls

Calls use WebRTC with the public Google STUN servers and the socket for signalling. For production, add a TURN server to `ICE_SERVERS` in `apps/web/src/lib/callManager.ts` — without TURN, calls fail on networks that block direct peer connections.

### Rebuild for another API URL

Update `VITE_API_URL` in `apps/web/.env.production` (or set it in the shell), then rebuild and sync as shown in **Release build** above — swap `assembleRelease` for `assembleDebug` if you want the debug variant.

### Emulator note

For an Android emulator, the host machine is reachable at `10.0.2.2`. Build with `VITE_API_URL=http://10.0.2.2:4000` instead, or change the address at runtime under **Server settings**. Without a build-time URL, the native app falls back to the cloud API address in `apps/web/src/lib/apiConfig.ts` (`https://hobymine-api-production.up.railway.app`).

### Cloud API

The shipping app talks to the Railway service in [DEPLOY.md](DEPLOY.md). To point a build somewhere else, set `VITE_API_URL` and rebuild the APK; HTTPS needs no extra Android network policy. Local development still uses the LAN server described above.

### Backend requirement

An APK cannot run the Express server by itself. The API must be reachable from the device; the shipping build points at Railway, and local testing points at the development PC on port 4000.

---

## Design system

| Token        | Value / behavior                                      |
| ------------ | ----------------------------------------------------- |
| Primary      | `#00FF66` neon green                                  |
| Primary soft | `#7CFFB2`                                             |
| Accent       | `#6FD3FF` light blue                                  |
| Background   | `#06070A` near-black                                  |
| Surfaces     | `#0C0E13` – `#161922`                                 |
| Type         | Inter Variable, tight display tracking                |
| Shape        | 16–30px radii, layered borders, soft neon glows       |
| Motion       | Spring-based card exits, staggered reveals, reduced-motion support |

Reusable classes such as `panel`, `btn-primary`, `btn-ghost`, `field`, `label`, and `chip` live in `apps/web/src/index.css`. The accent palette is defined in `apps/web/tailwind.config.js`.

### Theming

The palette lives in CSS variables on `:root` (the dark palette) with a `[data-theme='light']` override, and the Tailwind tokens point at those variables — so one class means the same thing in both themes. The app starts in light mode unless a saved choice exists:

| Tailwind token        | Meaning                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `canvas`              | The page background and the bars that sit on it (near black ↔ near white). |
| `ink-900` … `ink-100` | Surfaces, borders and text, from "raised panel" to "strongest foreground". |
| `white`               | The foreground ink: white on dark, near black on light.                    |
| `neon`, `sky`, `rose`, `violet` | Accents that keep their hue but deepen on light surfaces.        |

`ink-950` is deliberately **not** part of the flipping ramp: it is the literal deepest ink, used for scrims over photos, immersive surfaces (the call screen, the match celebration) and text on the neon accent, all of which read dark in both themes. Content drawn on a photo sits inside a `.force-dark` scope, which re-declares the dark palette locally so it cannot flip.

The theme is stored in `localStorage` (key `hobymine.theme`) by [theme.ts](apps/web/src/store/theme.ts), resolved in an inline script in `index.html` before React mounts (no flash of the wrong theme), and kept in step with the device while "system" is selected. The resolved theme also updates the `theme-color` meta tag and calls the native `HobymineDevice.setSystemBarStyle` method so the Android status-bar and navigation-bar icons stay readable in both palettes.

Switching the system theme is treated as an untrusted path: `applyTheme` cannot throw, a missing or `null` `matchMedia` resolves to light, an unrecognised stored mode resolves to a real theme (so `data-theme` is never `undefined` and the palette never collapses), rapid Android scheme changes are coalesced into one update per frame, and the Android appearance call is dispatched on the UI thread and always resolves instead of rejecting. The whole tree is also wrapped in [ErrorBoundary](apps/web/src/components/ErrorBoundary.tsx), which turns a render failure into a "Try again" panel instead of a blank screen.

The swipe deck fits between the app header and bottom navigation on phone/tablet viewports; on short screens the likes banner collapses so the action bar stays reachable.

---

## Security and privacy

Implemented in the demo:

- Passwords hashed with **bcrypt**; signed **JWT** access tokens.
- Auth rate limiting, Helmet headers, CORS allow-listing, and Zod request validation.
- Upload MIME allow-list and a 10 MB file limit.
- Authorization checks on every match, message, and profile mutation.
- Mutual blocks: blocked users disappear from discovery, likes, and direct profile access.
- Exact coordinates are never exposed to clients; only rounded distance labels.
- Selfies and uploads stay on the local machine in this demo.

### Screenshot and recording protection (Android)

The Android shell registers a `HobymineSecurity` plugin. While a 1-on-1 chat
is open, or a video call is ringing, connecting or active, the activity window
gets `FLAG_SECURE`. Android then omits the window from screenshots, screen
recordings, casting and the recent-apps preview, so the conversation is never
included in the capture.

Both participants get the protection automatically; there is no setting to turn
it off for chats or video calls. The web build cannot apply an OS-level capture
block, so this control is only effective in the packaged Android app.

When Android reports a blocked attempt:

- **Chat:** the server inserts a `kind = 'system'` message from the person who
  tried to capture. The other participant sees it inline immediately and after
  a reload; a background notification is posted when the chat is not open.
- **Video call:** the other participant sees an in-call "Capture blocked"
  banner for a few seconds. If they are no longer in that call, they get a
  toast and a notification instead.

Detection is layered because a secure window suppresses some system callbacks:

- Android 14+ `Activity.registerScreenCaptureCallback` and Android 15+
  `WindowManager.addScreenRecordingCallback` report the screenshot chord and
  when the app becomes visible to a recorder.
- A `MediaStore` content observer catches screenshots saved by OEM gestures and
  the power-menu button. When gallery access is available, the new row is
  checked for a screenshot path/name and screen-sized dimensions; without that
  access, a media change paired with the brief window-focus loss caused by the
  screenshot overlay is used instead.
- A `DisplayManager` listener reports virtual displays created by screen
  recorders and casters.

Duplicate signals from these paths are collapsed for one second before a single
alert is sent. Blocking never depends on detection: `FLAG_SECURE` is applied
before any detector starts. The behavior still varies by device and OEM, so
**blocking is guaranteed, but the peer alert is best effort**. ADB or
instrumentation screenshots are not reported by Android's callback, and on a
device that neither saves a gallery file nor delivers a callback only
accessibility-level access could detect the attempt; verification requires a
physical Power + Volume Down press.

Before using this with real people:

- Add refresh tokens / session revocation and password reset by email.
- Put uploads behind signed URLs and virus scanning; strip EXIF metadata.
- Use a real moderation vendor for reports and selfie verification.
- Add CSRF strategy if you move tokens into cookies, plus stricter CSP.
- Add audit logging, abuse detection, and a data-retention/deletion policy.
- Review app-store and privacy-law obligations for your jurisdiction.

---

## Known demo limitations

- Payments are simulated. No card data is requested, stored, or charged.
- Verification is auto-approved for demonstration; there is no biometric comparison.
- There are no bots: every profile, like, match and message comes from a registered account. The launch deck can be filled with 100 `is_seeded` profiles (see **Launch profiles**); they never reply on their own and are deleted with one query.
- Voice notes depend on browser `MediaRecorder` support (Chrome/Edge/Firefox; Safari support varies).
- Voice calls need WebRTC plus a reachable network path; add a TURN server before shipping them publicly.
- The generated seed art uses abstract, locally drawn SVG portraits. The optional launch profiles use Unsplash CDN photographs (free under the Unsplash license); replace them with your own licensed photography before a commercial launch.
- Screenshot and recording alerts depend on Android's capture callbacks; some devices or OEM builds may block the capture without reporting it, so the peer alert is best effort while the capture itself remains blocked.
- PGlite is not intended for horizontally scaled production traffic.

---

## Disclaimer

This is an independent educational/portfolio project. **It is not affiliated with, endorsed by, sponsored by, or connected to any existing dating brand.** “HobyMine” is a fictional demo brand created for this project. No proprietary code, imagery, user data, or other assets from any commercial app are included.

All personas, portraits, bios, messages, and audio are original generated content for demonstration. The interface is an original interpretation of common dating-app patterns, not a reproduction of proprietary artwork.

If you publish or commercialize a derivative, rebrand it, replace the demo assets, and review the trademark and IP position in your jurisdiction first.

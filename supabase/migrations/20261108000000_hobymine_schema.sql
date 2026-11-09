-- HobyMine schema for Supabase
-- Generated from apps/api/src/db/schema.sql on 2026-11-08.
-- Idempotent: safe to re-run. Creates every table the app uses.
--
-- Apply with: npm run db:supabase
-- or paste this file into the Supabase SQL editor.
-- ---------------------------------------------------------------------------
-- HobyMine â€” PostgreSQL schema
-- Works on PostgreSQL 14+ and on the embedded PGlite engine.

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL,
  age             INTEGER NOT NULL CHECK (age >= 18 AND age <= 120),
  gender          TEXT NOT NULL CHECK (gender IN ('woman', 'man', 'nonbinary')),
  bio             TEXT NOT NULL DEFAULT '',
  job             TEXT NOT NULL DEFAULT '',
  city            TEXT NOT NULL DEFAULT '',
  country_code    TEXT,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  location_city   TEXT,
  interests       JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Rich profile details shown on the discovery card and the full profile.
  lifestyle       JSONB NOT NULL DEFAULT '[]'::jsonb,
  languages       JSONB NOT NULL DEFAULT '[]'::jsonb,
  height_cm       INTEGER,
  relationship_goal TEXT NOT NULL DEFAULT '',
  -- Family and pet answers collected during onboarding.
  has_kids        TEXT NOT NULL DEFAULT '',
  wants_kids      TEXT NOT NULL DEFAULT '',
  kids_count      INTEGER,
  has_pets        TEXT NOT NULL DEFAULT '',
  pet_types       JSONB NOT NULL DEFAULT '[]'::jsonb,
  pets_count      INTEGER,
  -- A short (max 20 s) self-introduction recorded from the profile editor.
  voice_intro_url TEXT,
  voice_intro_duration INTEGER,
  voice_intro_updated_at TIMESTAMPTZ,
  photos          JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified        BOOLEAN NOT NULL DEFAULT FALSE,
  plus            BOOLEAN NOT NULL DEFAULT FALSE,
  plus_until      TIMESTAMPTZ,
  boost_until     TIMESTAMPTZ,
  read_receipts   BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  is_bot          BOOLEAN NOT NULL DEFAULT FALSE,
  -- Marks launch/demo profiles created by scripts/seed-profiles.ts. Real
  -- members always have FALSE, so the whole batch can be removed with one
  -- `DELETE FROM users WHERE is_seeded = TRUE`.
  is_seeded       BOOLEAN NOT NULL DEFAULT FALSE,
  paused_at       TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rebrand seeded/demo accounts created before the HobyMine rename.
UPDATE users
SET email = replace(email, '@ofo.app', '@hobymine.app')
WHERE email LIKE '%@ofo.app';

CREATE TABLE IF NOT EXISTS preferences (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  interested_in TEXT NOT NULL DEFAULT 'everyone'
                CHECK (interested_in IN ('women', 'men', 'everyone')),
  age_min       INTEGER NOT NULL DEFAULT 21 CHECK (age_min >= 18),
  age_max       INTEGER NOT NULL DEFAULT 45 CHECK (age_max <= 120),
  max_distance  INTEGER NOT NULL DEFAULT 50 CHECK (max_distance > 0),
  country_code  TEXT,
  location_mode TEXT NOT NULL DEFAULT 'global'
                CHECK (location_mode IN ('nearby', 'global')),
  CHECK (age_min <= age_max)
);

CREATE TABLE IF NOT EXISTS swipes (
  id         TEXT PRIMARY KEY,
  swiper_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action     TEXT NOT NULL CHECK (action IN ('like', 'pass', 'superlike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (swiper_id, target_id),
  CHECK (swiper_id <> target_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id         TEXT PRIMARY KEY,
  user_a     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  match_id   TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'text'
             CHECK (kind IN ('text', 'image', 'voice', 'file', 'system', 'call')),
  body       TEXT NOT NULL DEFAULT '',
  media_url  TEXT,
  file_name  TEXT,
  file_size  INTEGER,
  duration   INTEGER,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  details     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  selfie_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily call budget for free members (Plus members are not limited).
CREATE TABLE IF NOT EXISTS call_usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     DATE NOT NULL,
  calls   INTEGER NOT NULL DEFAULT 0,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- The free 1-minute video-calling trial. The counter is lifetime, so the free
-- minute really is a one-time trial; Plus members are unlimited and ignore it.
CREATE TABLE IF NOT EXISTS video_usage (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  seconds_used INTEGER NOT NULL DEFAULT 0 CHECK (seconds_used >= 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily like budget for free members. Plus members have unlimited likes.
-- One row per member per UTC day makes the counter atomic and easy to reset.
CREATE TABLE IF NOT EXISTS like_usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     DATE NOT NULL,
  likes   INTEGER NOT NULL DEFAULT 0 CHECK (likes >= 0),
  PRIMARY KEY (user_id, day)
);

-- Emoji reactions on a single message.
CREATE TABLE IF NOT EXISTS message_reactions (
  id         TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id)
);

-- One-time codes for the "forgot password" flow.
CREATE TABLE IF NOT EXISTS password_resets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Who looked at whose profile. Nothing is recorded in incognito mode.
CREATE TABLE IF NOT EXISTS profile_views (
  id         TEXT PRIMARY KEY,
  viewer_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (viewer_id, viewed_id)
);

-- Lightweight migration for databases created before the country picker.
ALTER TABLE users ADD COLUMN IF NOT EXISTS country_code TEXT;

-- Lightweight migration for the discovery filters added after the first release.
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS country_code TEXT;

-- Legacy column from the removed free-tier message cooldown. It is kept so
-- existing databases keep working, but no code reads or writes it any more.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

-- Lightweight migration for the GPS location and the nearby/global mode.
ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_city TEXT;
ALTER TABLE preferences
  ADD COLUMN IF NOT EXISTS location_mode TEXT NOT NULL DEFAULT 'global';

-- Lightweight migration for the incognito mode.
ALTER TABLE users ADD COLUMN IF NOT EXISTS incognito BOOLEAN NOT NULL DEFAULT FALSE;

-- Lightweight migration for richer public profiles: lifestyle tags, spoken
-- languages, height and the relationship goal shown on the discovery card.
ALTER TABLE users ADD COLUMN IF NOT EXISTS lifestyle JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS languages JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS height_cm INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_goal TEXT NOT NULL DEFAULT '';

-- Lightweight migration for the 20-second voice introduction shown on the full
-- profile. The URL is an upload path and the duration is stored so the player
-- can render a progress bar before the audio metadata loads.
ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_intro_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_intro_duration INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_intro_updated_at TIMESTAMPTZ;

-- Lightweight migration for the family and pet answers collected at sign up.
-- Empty text means "not answered yet"; the API serialises that as null.
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_kids TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS wants_kids TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS kids_count INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_pets TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS pet_types JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pets_count INTEGER;

-- Lightweight migration for the mandatory 18+ / terms acceptance at sign up.
-- Existing accounts predate the checkbox, so their timestamps stay NULL rather
-- than being invented.
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT;

-- Lightweight migration for sign up email verification. Accounts created before
-- this column existed are trusted, so nobody is locked out by the upgrade.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE users SET email_verified = TRUE;
  END IF;
END $$;

-- Sign up no longer asks for an emailed code: every account is usable as soon
-- as it is created. Existing accounts that never confirmed their address are
-- unlocked, and the old code table is removed.
UPDATE users SET email_verified = TRUE WHERE email_verified = FALSE;
DROP TABLE IF EXISTS email_verifications;

-- Lightweight migration for pausing / deactivating an account. A paused profile
-- is hidden from discovery and every list, and signing in again reactivates it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- Lightweight migration for voice call history. A finished call is stored as a
-- message with kind = 'call' so it appears in the conversation in order.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_kind_check;
ALTER TABLE messages
  ADD CONSTRAINT messages_kind_check
  CHECK (kind IN ('text', 'image', 'voice', 'file', 'system', 'call'));

-- Lightweight migration for file attachments in chat. Documents keep their
-- original name and size so the bubble can show a useful download card.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size INTEGER;

-- The demo personas used to be automatic accounts that answered on their own.
-- They are gone: only real, registered people can match and chat now.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE;

-- Lightweight migration for launch/demo profiles that can be deleted in bulk.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_seeded BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_users_seeded ON users (is_seeded) WHERE is_seeded;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_demo'
  ) THEN
    EXECUTE 'UPDATE users SET is_bot = is_demo WHERE id <> ''u_demo''';
    EXECUTE 'ALTER TABLE users DROP COLUMN IF EXISTS is_demo';
  END IF;
END $$;

-- Remove the legacy bot personas (and, by cascade, their swipes, matches and
-- messages) so no fabricated account can take part in matching or chat.
DELETE FROM users
WHERE id IN (
  'u_maya', 'u_aria', 'u_sofia', 'u_isla', 'u_chloe', 'u_priya', 'u_luna',
  'u_zoe', 'u_hana', 'u_elle', 'u_kai', 'u_diego', 'u_jordan'
);

-- Backfill the seeded demo profiles so existing installations gain countries
-- without requiring a destructive reseed.
UPDATE users
SET country_code = CASE city
  WHEN 'Singapore' THEN 'SG'
  WHEN 'Manila' THEN 'PH'
  WHEN 'Seoul' THEN 'KR'
  WHEN 'Tokyo' THEN 'JP'
  WHEN 'Ho Chi Minh City' THEN 'VN'
  ELSE country_code
END
WHERE country_code IS NULL;

UPDATE users
SET country_code = CASE id
  WHEN 'u_demo' THEN 'SG'
  ELSE country_code
END
WHERE country_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_swipes_target ON swipes (target_id, action);
CREATE INDEX IF NOT EXISTS idx_matches_user_a ON matches (user_a);
CREATE INDEX IF NOT EXISTS idx_matches_user_b ON matches (user_b);
CREATE INDEX IF NOT EXISTS idx_messages_match_created ON messages (match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (match_id, sender_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_gender_age ON users (gender, age);
CREATE INDEX IF NOT EXISTS idx_users_country ON users (country_code);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks (blocked_id);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports (target_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_viewed ON profile_views (viewed_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_views_viewer ON profile_views (viewer_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Stories
--
-- A story is private to the author's matches: it is never public, and every
-- read path joins `matches`. Stories expire 24 hours after they are posted.
--
-- `story_views` exists only so a viewer's own ring can show "seen". The view
-- count is never exposed to the author, by design â€” the author only ever sees
-- the number of likes a story received.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stories (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_url  TEXT NOT NULL,
  caption    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS story_likes (
  story_id   TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, user_id)
);

CREATE TABLE IF NOT EXISTS story_views (
  story_id   TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_stories_user_expiry ON stories (user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_expiry ON stories (expires_at);
CREATE INDEX IF NOT EXISTS idx_story_likes_story ON story_likes (story_id);
CREATE INDEX IF NOT EXISTS idx_story_views_story ON story_views (story_id);

-- A story reply or like is delivered as a normal chat message, carrying a
-- snapshot of the story it refers to so the recipient can see which one it is.
-- The preview is copied (not joined) on purpose: stories expire after 24 hours
-- but the message, and its thumbnail, must survive.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS story_id TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS story_media_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS story_caption TEXT;
-- 'reply' for a comment, 'like' for a like notification. NULL for normal chat.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS story_event TEXT;

-- ---------------------------------------------------------------------------
-- Supabase hardening: Row Level Security
--
-- HobyMine reads and writes through the Express API, which connects with the
-- privileged `postgres` role and bypasses RLS. Browser clients use the
-- publishable key (mapped to `anon`), so with RLS enabled and no policies they
-- cannot read or write these tables directly. Add policies keyed on auth.uid()
-- only when a feature is deliberately moved into the browser.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'users', 'preferences', 'swipes', 'matches', 'messages', 'blocks',
    'reports', 'verifications', 'call_usage', 'video_usage', 'like_usage',
    'message_reactions', 'password_resets',
    'profile_views', 'stories', 'story_likes', 'story_views'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- Make chat and story tables available to Supabase Realtime. RLS still decides
-- which rows a subscriber may see.
DO $$
DECLARE
  tbl text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH tbl IN ARRAY ARRAY['messages', 'stories', 'story_likes', 'story_views'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      END IF;
    END LOOP;
  END IF;
END $$;

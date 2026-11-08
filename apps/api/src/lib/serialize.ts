import type {
  ChatMessage,
  MeUser,
  MessageRow,
  PublicUser,
  ReactionSummary,
  UserRow,
  VoiceIntro,
} from '../types.js';
import { countryByCode } from './countries.js';
import { haversineKm } from './distance.js';

export const toIso = (value: string | Date | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

export const nowMs = (): number => Date.now();

export function isPlus(row: Pick<UserRow, 'plus' | 'plus_until'>): boolean {
  if (!row.plus) return false;
  if (!row.plus_until) return true;
  return new Date(row.plus_until).getTime() > Date.now();
}

export function isBoostActive(row: Pick<UserRow, 'boost_until'>): boolean {
  return Boolean(row.boost_until && new Date(row.boost_until).getTime() > Date.now());
}

interface Viewer {
  lat: number | null;
  lng: number | null;
  interests: string[];
}

/** JSONB columns arrive as arrays from pg/PGlite, but older rows can be text. */
function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** The voice intro is optional; older rows have no columns at all. */
function toVoiceIntro(row: UserRow): VoiceIntro | null {
  const url = typeof row.voice_intro_url === 'string' ? row.voice_intro_url.trim() : '';
  if (!url) return null;
  const raw = row.voice_intro_duration;
  const parsed = raw === null || raw === undefined ? 0 : Number(raw);
  const duration = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.round(parsed), 20) : 0;
  return {
    url,
    duration,
    updatedAt: toIso(row.voice_intro_updated_at),
  };
}

export function toPublicUser(row: UserRow, viewer?: Viewer): PublicUser {
  let distanceKm: number | null = null;
  if (
    viewer &&
    viewer.lat !== null &&
    viewer.lng !== null &&
    row.lat !== null &&
    row.lng !== null
  ) {
    const km = haversineKm(
      { lat: viewer.lat, lng: viewer.lng },
      { lat: row.lat, lng: row.lng },
    );
    distanceKm = Math.round(km * 10) / 10;
  }

  const interests = asStringArray(row.interests);
  const photos = asStringArray(row.photos);
  const sharedInterests = viewer
    ? interests.filter((interest) => viewer.interests.includes(interest))
    : [];

  const country = countryByCode(row.country_code);
  // Rows selected with `SELECT u.*` can carry raw JSONB values; older rows may
  // predate the richer profile columns, so every list is normalised here too.
  const lifestyle = asStringArray(row.lifestyle);
  const languages = asStringArray(row.languages);
  const petTypes = asStringArray(row.pet_types);
  const voiceIntro = toVoiceIntro(row);
  const hasKids: PublicUser['hasKids'] =
    row.has_kids === 'yes' || row.has_kids === 'no' ? row.has_kids : null;
  const wantsKids: PublicUser['wantsKids'] =
    row.wants_kids === 'yes' || row.wants_kids === 'no' || row.wants_kids === 'maybe'
      ? row.wants_kids
      : null;
  const hasPets: PublicUser['hasPets'] =
    row.has_pets === 'yes' || row.has_pets === 'no' ? row.has_pets : null;
  const kidsCount =
    row.kids_count === null || row.kids_count === undefined ? null : Number(row.kids_count);
  const petsCount =
    row.pets_count === null || row.pets_count === undefined ? null : Number(row.pets_count);

  return {
    id: row.id,
    name: row.name,
    age: row.age,
    gender: row.gender,
    bio: row.bio,
    job: row.job,
    city: row.city,
    countryCode: country?.code ?? row.country_code ?? '',
    countryName: country?.name ?? row.city,
    countryFlag: country?.flag ?? '',
    interests,
    lifestyle,
    languages,
    heightCm:
      row.height_cm === null || row.height_cm === undefined
        ? null
        : Number(row.height_cm),
    relationshipGoal: row.relationship_goal ?? '',
    hasKids,
    wantsKids,
    kidsCount,
    hasPets,
    petTypes,
    petsCount,
    voiceIntro,
    photos,
    verified: row.verified,
    plus: isPlus(row),
    online: Date.now() - new Date(row.last_active_at).getTime() < 5 * 60_000,
    lastActiveAt: toIso(row.last_active_at) ?? new Date().toISOString(),
    distanceKm,
    sharedInterests,
    isBot: row.is_bot,
    memberSince: toIso(row.created_at),
  };
}

export function toMeUser(
  row: UserRow,
  preferences: {
    interested_in: 'women' | 'men' | 'everyone';
    age_min: number;
    age_max: number;
    max_distance: number;
    country_code: string | null;
    location_mode: 'nearby' | 'global';
  },
): MeUser {
  return {
    ...toPublicUser(row),
    email: row.email,
    emailVerified: row.email_verified,
    readReceipts: row.read_receipts,
    plusUntil: toIso(row.plus_until),
    boostUntil: toIso(row.boost_until),
    boostActive: isBoostActive(row),
    // Deprecated: messages are no longer throttled. Kept as null so installed
    // clients from older builds never wait for a cooldown that cannot happen.
    messageCooldownUntil: null,
    latitude: row.latitude,
    longitude: row.longitude,
    locationCity: row.location_city,
    incognito: row.incognito,
    ageConfirmedAt: toIso(row.age_confirmed_at),
    termsAcceptedAt: toIso(row.terms_accepted_at),
    termsVersion: row.terms_version,
    preferences: {
      interestedIn: preferences.interested_in,
      ageMin: preferences.age_min,
      ageMax: preferences.age_max,
      maxDistance: preferences.max_distance,
      countryCode: preferences.country_code,
      locationMode: preferences.location_mode,
    },
  };
}

export function toChatMessage(
  row: MessageRow,
  reactions: ReactionSummary[] = [],
): ChatMessage {
  return {
    id: row.id,
    matchId: row.match_id,
    senderId: row.sender_id,
    kind: row.kind,
    body: row.body,
    mediaUrl: row.media_url,
    fileName: row.file_name ?? null,
    fileSize: row.file_size ?? null,
    duration: row.duration,
    readAt: toIso(row.read_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    reactions,
    // A story reply or like carries a snapshot of the story it refers to, so
    // the chat can show the thumbnail above the text.
    story: row.story_id
      ? {
          id: row.story_id,
          mediaUrl: row.story_media_url ?? null,
          caption: row.story_caption ?? '',
          event: row.story_event === 'like' ? 'like' : 'reply',
        }
      : null,
  };
}

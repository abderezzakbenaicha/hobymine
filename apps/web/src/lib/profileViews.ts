import { api } from './api';
import type { Gender, ProfileView, ProfileViewsResponse, PublicUser } from '../types';

/* ------------------------------------------------------------------ */
/*  Profile views — API with an offline localStorage fallback         */
/* ------------------------------------------------------------------ */

const LOCAL_VIEWS_KEY = 'hobymine.profileViews';
const MOCK_VIEWERS_KEY = 'hobymine.mockProfileViewers';

interface LocalProfileView {
  viewerId: string;
  viewedId: string;
  createdAt: string;
}

interface StoredMockViewer {
  user: PublicUser;
  viewedAt: string;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be full or disabled (private browsing). The feature still
    // works during the current session.
  }
}

function readLocalViews(): LocalProfileView[] {
  const value = readJson<unknown>(LOCAL_VIEWS_KEY, []);
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is LocalProfileView => {
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as Partial<LocalProfileView>;
    return (
      typeof record.viewerId === 'string' &&
      typeof record.viewedId === 'string' &&
      typeof record.createdAt === 'string'
    );
  });
}

function rememberLocalView(viewerId: string, viewedId: string): void {
  if (!viewerId || viewerId === viewedId) return;
  const next = readLocalViews().filter(
    (entry) => !(entry.viewerId === viewerId && entry.viewedId === viewedId),
  );
  next.unshift({ viewerId, viewedId, createdAt: new Date().toISOString() });
  writeJson(LOCAL_VIEWS_KEY, next.slice(0, 200));
}

function mockUser(input: {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  bio: string;
  job: string;
  city: string;
  countryCode: string;
  countryName: string;
  countryFlag: string;
  interests: string[];
  photos: string[];
  verified?: boolean;
  plus?: boolean;
  online?: boolean;
  distanceKm?: number;
  lastActiveAt?: string;
}): PublicUser {
  return {
    id: input.id,
    name: input.name,
    age: input.age,
    gender: input.gender,
    bio: input.bio,
    job: input.job,
    city: input.city,
    countryCode: input.countryCode,
    countryName: input.countryName,
    countryFlag: input.countryFlag,
    interests: input.interests,
    lifestyle: [],
    languages: [],
    heightCm: null,
    relationshipGoal: '',
    hasKids: null,
    wantsKids: null,
    kidsCount: null,
    hasPets: null,
    petTypes: [],
    petsCount: null,
    voiceIntro: null,
    photos: input.photos,
    verified: input.verified ?? false,
    plus: input.plus ?? false,
    online: input.online ?? false,
    lastActiveAt: input.lastActiveAt ?? new Date().toISOString(),
    distanceKm: input.distanceKm ?? null,
    sharedInterests: [],
    isBot: false,
    memberSince: input.lastActiveAt ?? new Date().toISOString(),
  };
}

/** Dummy viewers make the tab testable without a running backend. */
function seedMockViewers(): StoredMockViewer[] {
  const now = Date.now();
  const minutesAgo = (minutes: number): string =>
    new Date(now - minutes * 60_000).toISOString();

  const make = (
    input: Parameters<typeof mockUser>[0],
    minutes: number,
    viewedAt = minutesAgo(minutes),
  ): StoredMockViewer => ({
    user: mockUser({ ...input, lastActiveAt: viewedAt }),
    viewedAt,
  });

  return [
    make(
      {
        id: 'mock_viewer_maya',
        name: 'Maya Chen',
        age: 27,
        gender: 'woman',
        bio: 'Weekend hiker, weekday designer. Always looking for a better coffee spot.',
        job: 'UX Designer',
        city: 'Singapore',
        countryCode: 'SG',
        countryName: 'Singapore',
        countryFlag: '🇸🇬',
        interests: ['Travel', 'Coffee', 'Photography'],
        photos: ['/seed/maya-1.svg', '/seed/maya-2.svg'],
        verified: true,
        online: true,
      },
      4,
    ),
    make(
      {
        id: 'mock_viewer_isla',
        name: 'Isla Rossi',
        age: 25,
        gender: 'woman',
        bio: 'Pasta, playlists, and long walks by the water.',
        job: 'Music Producer',
        city: 'Manila',
        countryCode: 'PH',
        countryName: 'Philippines',
        countryFlag: '🇵🇭',
        interests: ['Music', 'Food', 'Movies'],
        photos: ['/seed/isla-1.svg', '/seed/isla-2.svg'],
        online: true,
      },
      17,
    ),
    make(
      {
        id: 'mock_viewer_priya',
        name: 'Priya Nair',
        age: 29,
        gender: 'woman',
        bio: 'Product manager by day, amateur chef by night.',
        job: 'Product Manager',
        city: 'Singapore',
        countryCode: 'SG',
        countryName: 'Singapore',
        countryFlag: '🇸🇬',
        interests: ['Food', 'Travel', 'Reading'],
        photos: ['/seed/priya-1.svg', '/seed/priya-2.svg'],
        verified: true,
        plus: true,
      },
      90,
    ),
    make(
      {
        id: 'mock_viewer_luna',
        name: 'Luna Park',
        age: 24,
        gender: 'woman',
        bio: 'Illustrator with too many plants and not enough shelf space.',
        job: 'Illustrator',
        city: 'Seoul',
        countryCode: 'KR',
        countryName: 'South Korea',
        countryFlag: '🇰🇷',
        interests: ['Art', 'Gaming', 'Coffee'],
        photos: ['/seed/luna-1.svg', '/seed/luna-2.svg'],
      },
      60 * 6,
    ),
    make(
      {
        id: 'mock_viewer_hana',
        name: 'Hana Sato',
        age: 26,
        gender: 'woman',
        bio: 'Runner, reader, and part-time bakery critic.',
        job: 'Copywriter',
        city: 'Tokyo',
        countryCode: 'JP',
        countryName: 'Japan',
        countryFlag: '🇯🇵',
        interests: ['Running', 'Reading', 'Travel'],
        photos: ['/seed/hana-1.svg', '/seed/hana-2.svg'],
        verified: true,
      },
      60 * 26,
    ),
    make(
      {
        id: 'mock_viewer_sofia',
        name: 'Sofia Alvarez',
        age: 30,
        gender: 'woman',
        bio: 'Architect. Sunset chaser. Dog person, obviously.',
        job: 'Architect',
        city: 'Ho Chi Minh City',
        countryCode: 'VN',
        countryName: 'Vietnam',
        countryFlag: '🇻🇳',
        interests: ['Architecture', 'Travel', 'Dogs'],
        photos: ['/seed/sofia-1.svg', '/seed/sofia-2.svg'],
        plus: true,
      },
      60 * 24 * 3,
    ),
  ];
}

function mockViewers(): StoredMockViewer[] {
  const stored = readJson<unknown>(MOCK_VIEWERS_KEY, null);
  if (Array.isArray(stored) && stored.length > 0) {
    return stored.filter((entry): entry is StoredMockViewer => {
      if (!entry || typeof entry !== 'object') return false;
      const record = entry as Partial<StoredMockViewer>;
      return Boolean(record.user && typeof record.viewedAt === 'string');
    });
  }
  const seeded = seedMockViewers();
  writeJson(MOCK_VIEWERS_KEY, seeded);
  return seeded;
}

function toViewerTeaser(user: PublicUser, index: number): PublicUser {
  return {
    ...user,
    id: `hidden-view-${index}`,
    name: 'Profile viewer',
    bio: '',
    job: '',
    city: '',
    countryCode: '',
    countryName: '',
    countryFlag: '',
    interests: [],
    lifestyle: [],
    languages: [],
    heightCm: null,
    relationshipGoal: '',
    hasKids: null,
    wantsKids: null,
    kidsCount: null,
    hasPets: null,
    petTypes: [],
    petsCount: null,
    voiceIntro: null,
    verified: false,
    plus: false,
    online: false,
    distanceKm: null,
    sharedInterests: [],
    memberSince: null,
  };
}

function localViewers(meId: string, plus: boolean): ProfileViewsResponse {
  const local = readLocalViews()
    .filter((entry) => entry.viewedId === meId && entry.viewerId !== meId)
    .map((entry) => {
      // Local accounts can view each other when testing offline. Until that
      // viewer is known, the dummy personas stand in for them.
      const known = mockViewers().find((viewer) => viewer.user.id === entry.viewerId);
      return known
        ? { user: known.user, viewedAt: entry.createdAt }
        : null;
    })
    .filter((entry): entry is ProfileView => entry !== null);

  const seen = new Set(local.map((entry) => entry.user.id));
  const combined: ProfileView[] = [
    ...local,
    ...mockViewers()
      .filter((entry) => entry.user.id !== meId && !seen.has(entry.user.id))
      .map((entry) => ({ user: entry.user, viewedAt: entry.viewedAt })),
  ].sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime());

  return {
    views: plus
      ? combined
      : combined.map((entry, index) => ({
          user: toViewerTeaser(entry.user, index),
          viewedAt: entry.viewedAt,
        })),
    count: combined.length,
    limited: !plus,
  };
}

/**
 * Records a profile visit. The server owns the durable record; the local copy
 * keeps the tab testable when the API is unreachable.
 */
export async function trackProfileView(
  viewedId: string,
  viewerId: string | undefined,
): Promise<void> {
  if (!viewerId || viewerId === viewedId) return;
  rememberLocalView(viewerId, viewedId);
  try {
    await api.post(`/api/users/${encodeURIComponent(viewedId)}/view`);
  } catch {
    // Offline mode: the local record is enough for the mock viewer tab.
  }
}

/** Loads who viewed this member, falling back to dummy local data offline. */
export async function loadProfileViewers(
  meId: string,
  plus: boolean,
): Promise<ProfileViewsResponse> {
  try {
    return await api.get<ProfileViewsResponse>('/api/me/viewers');
  } catch {
    return localViewers(meId, plus);
  }
}

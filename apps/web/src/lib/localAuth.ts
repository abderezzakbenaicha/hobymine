import type { Gender, InterestedIn, MeUser, Preferences } from '../types';

/* ------------------------------------------------------------------ */
/*  Local (offline) authentication — no server required               */
/* ------------------------------------------------------------------ */

/** Storage keys */
const USERS_KEY = 'hobymine_local_users';
const SESSION_KEY = 'hobymine_local_session';

/** A user record stored entirely in localStorage. */
export interface StoredUser {
  id: string;
  email: string;
  /** Stored in plaintext for this local demo — real apps hash passwords. */
  password: string;
  name: string;
  age: number;
  gender: Gender;
  countryCode: string;
  interestedIn: InterestedIn;
  bio: string;
  job: string;
  interests: string[];
  photos: string[];
  verified: boolean;
  emailVerified: boolean;
  plus: boolean;
  readReceipts: boolean;
  plusUntil: string | null;
  boostUntil: string | null;
  boostActive: boolean;
  messageCooldownUntil: string | null;
  latitude: number | null;
  longitude: number | null;
  locationCity: string | null;
  incognito: boolean;
  /** When the member confirmed they are 18 or older. */
  ageConfirmedAt?: string | null;
  /** When the member accepted the Terms of Service and Privacy Policy. */
  termsAcceptedAt?: string | null;
  termsVersion?: string | null;
  preferences: Preferences;
  createdAt: string;
}

function getUsers(): StoredUser[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getSession(): { token: string; userId: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setSession(token: string, userId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ token, userId }));
}

function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_KEY);
}

function generateToken(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function generateDevCode(): string {
  return `1${Math.floor(Math.random() * 900000) + 100000}`;
}

const DEFAULT_PREFS: Preferences = {
  interestedIn: 'everyone',
  ageMin: 21,
  ageMax: 40,
  maxDistance: 50,
  countryCode: 'US',
  locationMode: 'global',
};

function seedUsers(): StoredUser[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'u_demo',
      email: 'demo@hobymine.app',
      password: 'password123',
      name: 'Demo User',
      age: 28,
      gender: 'woman',
      countryCode: 'US',
      interestedIn: 'everyone',
      bio: 'Demo account for testing HobyMine offline.',
      job: 'Product Designer',
      interests: ['Travel', 'Photography', 'Coffee'],
      photos: ['/seed/alex-1.svg'],
      verified: true,
      emailVerified: true,
      plus: false,
      readReceipts: false,
      plusUntil: null,
      boostUntil: null,
      boostActive: false,
      messageCooldownUntil: null,
      latitude: null,
      longitude: null,
      locationCity: null,
      incognito: false,
      preferences: { ...DEFAULT_PREFS },
      createdAt: now,
    },
  ];
}

function ensureSeeded(): void {
  const users = getUsers();
  if (users.length === 0) {
    saveUsers(seedUsers());
  }
}

function userToMeUser(user: StoredUser): MeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    age: user.age,
    gender: user.gender,
    bio: user.bio,
    job: user.job,
    city: user.locationCity || '',
    countryCode: user.countryCode,
    countryName: '',
    countryFlag: '',
    interests: user.interests,
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
    photos: user.photos,
    verified: user.verified,
    plus: user.plus,
    online: false,
    lastActiveAt: user.createdAt,
    distanceKm: null,
    sharedInterests: [],
    isBot: false,
    memberSince: user.createdAt,
    emailVerified: user.emailVerified,
    readReceipts: user.readReceipts,
    plusUntil: user.plusUntil,
    boostUntil: user.boostUntil,
    boostActive: user.boostActive,
    messageCooldownUntil: user.messageCooldownUntil,
    latitude: user.latitude,
    longitude: user.longitude,
    locationCity: user.locationCity,
    incognito: user.incognito,
    ageConfirmedAt: user.ageConfirmedAt ?? null,
    termsAcceptedAt: user.termsAcceptedAt ?? null,
    termsVersion: user.termsVersion ?? null,
    preferences: user.preferences,
  };
}

/* ------------------------------------------------------------------ */
/*  Public local auth API                                             */
/* ------------------------------------------------------------------ */

export const localAuth = {
  /** Load the signed-in user from localStorage (called on app bootstrap). */
  bootstrap: async (): Promise<{ token: string | null; user: MeUser | null }> => {
    ensureSeeded();
    const session = getSession();
    if (!session) return { token: null, user: null };
    const users = getUsers();
    const user = users.find((u) => u.id === session.userId);
    if (!user) {
      clearSession();
      return { token: null, user: null };
    }
    return { token: session.token, user: userToMeUser(user) };
  },

  /** Sign in with email + password against locally stored accounts. */
  login: async (email: string, password: string): Promise<{ token: string; user: MeUser }> => {
    ensureSeeded();
    const users = getUsers();
    const user = users.find((u) => u.email === email.toLowerCase().trim());
    if (!user || user.password !== password) {
      throw new Error('Invalid email or password');
    }
    const token = generateToken();
    setSession(token, user.id);
    return { token, user: userToMeUser(user) };
  },

  /** Create a new account stored locally. */
  register: async (input: {
    name: string;
    email: string;
    password: string;
    age: number;
    gender: Gender;
    countryCode: string;
    interestedIn: InterestedIn;
    /** Mandatory 18+ confirmation from the sign up checkbox. */
    ageConfirmed?: boolean;
  }): Promise<{ token: string; user: MeUser; devCode: string }> => {
    ensureSeeded();
    const users = getUsers();
    const normalizedEmail = input.email.toLowerCase().trim();
    if (users.some((u) => u.email === normalizedEmail)) {
      throw new Error('An account with this email already exists');
    }
    const now = new Date().toISOString();
    const newUser: StoredUser = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      email: normalizedEmail,
      password: input.password,
      name: input.name.trim(),
      age: input.age,
      gender: input.gender,
      countryCode: input.countryCode,
      interestedIn: input.interestedIn,
      bio: '',
      job: '',
      interests: [],
      photos: [],
      verified: false,
      emailVerified: false,
      plus: false,
      readReceipts: false,
      plusUntil: null,
      boostUntil: null,
      boostActive: false,
      messageCooldownUntil: null,
      latitude: null,
      longitude: null,
      locationCity: null,
      incognito: false,
      ageConfirmedAt: input.ageConfirmed ? now : null,
      termsAcceptedAt: input.ageConfirmed ? now : null,
      termsVersion: input.ageConfirmed ? '2026-10' : null,
      preferences: {
        ...DEFAULT_PREFS,
        interestedIn: input.interestedIn,
        countryCode: input.countryCode,
      },
      createdAt: now,
    };
    users.push(newUser);
    saveUsers(users);
    const token = generateToken();
    setSession(token, newUser.id);
    return { token, user: userToMeUser(newUser), devCode: generateDevCode() };
  },

  /** Reload the current user from localStorage (used on socket reconnect). */
  refresh: async (): Promise<{ token: string | null; user: MeUser | null }> => {
    return localAuth.bootstrap();
  },

  /** Start a password reset — returns a demo code (no email sent). */
  forgotPassword: async (email: string): Promise<{ devCode?: string }> => {
    ensureSeeded();
    const users = getUsers();
    const user = users.find((u) => u.email === email.toLowerCase().trim());
    if (!user) return {};
    return { devCode: generateDevCode() };
  },

  /** Set a new password after a reset. (`code` accepted for interface compatibility.) */
  resetPassword: async (email: string, _code: string, password: string): Promise<void> => {
    ensureSeeded();
    const users = getUsers();
    const user = users.find((u) => u.email === email.toLowerCase().trim());
    if (!user) throw new Error('Account not found');
    user.password = password;
    saveUsers(users);
  },

  /** Mark an email as verified. (`code` accepted for interface compatibility.) */
  verifyEmail: async (email: string, _code: string): Promise<{ user: MeUser }> => {
    ensureSeeded();
    const users = getUsers();
    const user = users.find((u) => u.email === email.toLowerCase().trim());
    if (!user) throw new Error('Account not found');
    user.emailVerified = true;
    saveUsers(users);
    return { user: userToMeUser(user) };
  },

  /** Issue a new verification code. (`code` not used in local demo.) */
  resendVerification: async (_email: string): Promise<{ devCode?: string; alreadyVerified?: boolean }> => {
    ensureSeeded();
    const users = getUsers();
    const user = users.find((u) => u.email === _email.toLowerCase().trim());
    if (!user) return {};
    if (user.emailVerified) return { alreadyVerified: true };
    return { devCode: generateDevCode() };
  },

  /** Sign out — clear the local session. */
  logout: async (): Promise<void> => {
    clearSession();
  },
};

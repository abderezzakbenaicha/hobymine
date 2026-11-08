import bcrypt from 'bcryptjs';
import { sql } from './index.js';

interface SeedUser {
  id: string;
  email: string;
  name: string;
  age: number;
  gender: 'woman' | 'man' | 'nonbinary';
  bio: string;
  job: string;
  city: string;
  countryCode: string;
  lat: number;
  lng: number;
  interests: string[];
  lifestyle?: string[];
  languages?: string[];
  heightCm?: number | null;
  relationshipGoal?: string;
  /** Bundled demo clip used to show the voice-intro player without a recording. */
  voiceIntroUrl?: string;
  voiceIntroDuration?: number;
  verified?: boolean;
  plus?: boolean;
  interestedIn: 'women' | 'men' | 'everyone';
  ageMin?: number;
  ageMax?: number;
  maxDistance?: number;
  activeMinutesAgo: number;
  photos?: string[];
}

/**
 * Only one account is created automatically: the demo account used to try the
 * app on a second device. It behaves like any other person — it never replies
 * on its own, because HobyMine no longer ships automated personas.
 */
const SEED_USERS: SeedUser[] = [
  {
    id: 'u_demo',
    email: 'demo@hobymine.app',
    name: 'Alex Rivera',
    age: 28,
    gender: 'man',
    bio: 'Product designer. Sunsets, synthwave, and street food. Let’s find a rooftop and overthink the playlist.',
    job: 'Product Designer',
    city: 'Singapore',
    countryCode: 'SG',
    lat: 1.3521,
    lng: 103.8198,
    interests: ['Movies', 'Travel', 'Coffee', 'K-pop', 'Games'],
    lifestyle: ['Coffee addict', 'Night owl', 'Fitness lover', 'Foodie'],
    languages: ['English', 'Tagalog'],
    heightCm: 178,
    relationshipGoal: 'Long-term relationship',
    voiceIntroUrl: '/sounds/voice-note.wav',
    voiceIntroDuration: 3,
    interestedIn: 'women',
    ageMin: 23,
    ageMax: 34,
    maxDistance: 80,
    activeMinutesAgo: 0,
    photos: ['/seed/alex-1.svg', '/seed/alex-2.svg'],
  },
];

const minutesAgo = (minutes: number): Date => new Date(Date.now() - minutes * 60_000);

async function insertUser(user: SeedUser, passwordHash: string): Promise<void> {
  const photos = user.photos ?? [];
  await sql(
    `INSERT INTO users
      (id, email, password_hash, name, age, gender, bio, job, city, country_code,
       lat, lng, interests, lifestyle, languages, height_cm, relationship_goal,
       photos, verified, plus, plus_until, read_receipts, email_verified, is_bot,
       last_active_at, created_at, voice_intro_url, voice_intro_duration,
       voice_intro_updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16,$17,$18::jsonb,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
     ON CONFLICT (id) DO NOTHING`,
    [
      user.id,
      user.email,
      passwordHash,
      user.name,
      user.age,
      user.gender,
      user.bio,
      user.job,
      user.city,
      user.countryCode,
      user.lat,
      user.lng,
      JSON.stringify(user.interests),
      JSON.stringify(user.lifestyle ?? []),
      JSON.stringify(user.languages ?? []),
      user.heightCm ?? null,
      user.relationshipGoal ?? '',
      JSON.stringify(photos),
      Boolean(user.verified),
      Boolean(user.plus),
      user.plus ? new Date(Date.now() + 30 * 86_400_000) : null,
      true,
      // The seeded demo account is created by the server, so it is trusted.
      true,
      false,
      minutesAgo(user.activeMinutesAgo),
      minutesAgo(60 * 24 * 30),
      user.voiceIntroUrl ?? null,
      user.voiceIntroDuration ?? null,
      user.voiceIntroUrl ? minutesAgo(60 * 24 * 3) : null,
    ],
  );

  await sql(
    `INSERT INTO preferences (user_id, interested_in, age_min, age_max, max_distance)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO NOTHING`,
    [
      user.id,
      user.interestedIn,
      user.ageMin ?? 21,
      user.ageMax ?? 40,
      user.maxDistance ?? 100,
    ],
  );
}

export async function seedDatabase(): Promise<{ seeded: boolean }> {
  const existing = await sql<{ count: string | number }>('SELECT COUNT(*) AS count FROM users');
  const count = Number(existing.rows[0]?.count ?? 0);
  if (count > 0) return { seeded: false };

  const passwordHash = await bcrypt.hash('Password123!', 10);

  for (const user of SEED_USERS) {
    await insertUser(user, passwordHash);
  }

  return { seeded: true };
}

export const DEMO_CREDENTIALS = {
  email: 'demo@hobymine.app',
  password: 'Password123!',
  id: 'u_demo',
};

export { SEED_USERS };

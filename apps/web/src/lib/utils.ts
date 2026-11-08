import clsx, { type ClassValue } from 'clsx';
import { format, isToday, isYesterday } from 'date-fns';

export function cn(...classes: ClassValue[]): string {
  return clsx(classes);
}

export function formatClock(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return format(date, 'HH:mm');
}

export function formatMessageTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return `Yesterday ${format(date, 'HH:mm')}`;
  return format(date, 'dd MMM, HH:mm');
}

export function formatDayLabel(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE, d MMMM');
}

export function formatRelativeShort(value: string): string {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return format(date, 'd MMM');
}

export function formatDuration(seconds: number | null): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** "820 B" / "1.4 MB" — used for uploaded documents in chat. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return 'Unknown size';
  const total = Math.max(0, Math.round(bytes));
  if (total < 1024) return `${total} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = total / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[index]}`;
}

/** "40 secs" / "2 min 5 secs" — the wording used on call history cards. */
export function formatCallDuration(seconds: number | null): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  if (total < 60) return `${total} sec${total === 1 ? '' : 's'}`;

  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (rest === 0) return `${minutes} min`;
  return `${minutes} min ${rest} sec${rest === 1 ? '' : 's'}`;
}

/** "Active now" style label for the last time somebody was seen. */
export function lastActiveLabel(value: string | Date | null | undefined): string {
  if (!value) return 'a while ago';
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return 'a while ago';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return format(date, 'd MMM');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function distanceLabel(km: number | null): string {
  if (km === null) return 'Somewhere nearby';
  if (km < 1) return 'Less than a km away';
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

export const INTERESTS = [
  { label: 'K-pop', emoji: '🎤' },
  { label: 'Movies', emoji: '🎬' },
  { label: 'Pets', emoji: '🐾' },
  { label: 'Games', emoji: '🎮' },
  { label: 'Travel', emoji: '✈️' },
  { label: 'Coffee', emoji: '☕' },
  { label: 'Music', emoji: '🎧' },
  { label: 'Food', emoji: '🍜' },
  { label: 'Fitness', emoji: '🏃' },
  { label: 'Art', emoji: '🎨' },
  { label: 'Nightlife', emoji: '🌃' },
  { label: 'Books', emoji: '📚' },
  { label: 'Fashion', emoji: '👗' },
  { label: 'Tech', emoji: '💻' },
  { label: 'Hiking', emoji: '🥾' },
  { label: 'Photography', emoji: '📷' },
  { label: 'Dancing', emoji: '💃' },
  { label: 'Cooking', emoji: '🍳' },
  { label: 'Yoga', emoji: '🧘' },
  { label: 'Gym', emoji: '🏋️' },
  { label: 'Cycling', emoji: '🚴' },
  { label: 'Running', emoji: '👟' },
  { label: 'Swimming', emoji: '🏊' },
  { label: 'Surfing', emoji: '🏄' },
  { label: 'Camping', emoji: '🏕️' },
  { label: 'Gardening', emoji: '🌱' },
  { label: 'Anime', emoji: '🍥' },
  { label: 'Comics', emoji: '💥' },
  { label: 'Board games', emoji: '🎲' },
  { label: 'Live music', emoji: '🎸' },
  { label: 'Karaoke', emoji: '🎙️' },
  { label: 'Theatre', emoji: '🎭' },
  { label: 'Museums', emoji: '🏛️' },
  { label: 'Podcasts', emoji: '🎙️' },
  { label: 'Stand-up comedy', emoji: '😂' },
  { label: 'Wine', emoji: '🍷' },
  { label: 'Baking', emoji: '🧁' },
  { label: 'Volunteering', emoji: '🤝' },
  { label: 'Astronomy', emoji: '🔭' },
  { label: 'Cars', emoji: '🚗' },
  { label: 'Football', emoji: '⚽' },
  { label: 'Basketball', emoji: '🏀' },
  { label: 'Tennis', emoji: '🎾' },
  { label: 'Badminton', emoji: '🏸' },
  { label: 'Meditation', emoji: '🕯️' },
  { label: 'Fishing', emoji: '🎣' },
] as const;

export function interestEmoji(label: string): string {
  return INTERESTS.find((interest) => interest.label === label)?.emoji ?? '✨';
}

/** Lifestyle tags, kept in sync with the API's profile validation. */
export const LIFESTYLE_TAGS = [
  'Non-smoker',
  'Social smoker',
  'Never drinks',
  'Social drinker',
  'Drinks occasionally',
  'Fitness lover',
  'Early bird',
  'Night owl',
  'Vegetarian',
  'Vegan',
  'Pet parent',
  'Plant parent',
  'Coffee addict',
  'Foodie',
  'Homebody',
  'Always travelling',
  'Creative',
  'Workaholic',
] as const;

export const LANGUAGES = [
  'English',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Portuguese',
  'Dutch',
  'Swedish',
  'Polish',
  'Russian',
  'Turkish',
  'Arabic',
  'Hindi',
  'Bengali',
  'Urdu',
  'Mandarin',
  'Cantonese',
  'Japanese',
  'Korean',
  'Thai',
  'Vietnamese',
  'Indonesian',
  'Malay',
  'Filipino',
  'Swahili',
] as const;

/** Matches the API's accepted relationship goals exactly. */
export const RELATIONSHIP_GOALS = [
  'Long-term relationship',
  'Short-term, open to long',
  'Something casual',
  'Friends first',
  'Still figuring it out',
] as const;

/** "178 cm · 5′10″" — null when no usable height was shared. */
export function heightLabel(cm: number | null | undefined): string | null {
  if (cm === null || cm === undefined || !Number.isFinite(cm) || cm < 120 || cm > 230) {
    return null;
  }
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${Math.round(cm)} cm · ${feet}′${inches}″`;
}

/** Human label for the gender field on the full profile. */
export function genderLabel(gender: string | null | undefined): string | null {
  if (gender === 'woman') return 'Woman';
  if (gender === 'man') return 'Man';
  if (gender === 'nonbinary') return 'Non-binary';
  return null;
}

/** "Member since March 2025" without exposing an exact join date. */
export function memberSinceLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'MMMM yyyy');
}

export const REPORT_REASONS = [
  'Inappropriate messages',
  'Fake profile',
  'Harassment',
  'Underage',
  'Spam or scam',
  'Other',
] as const;

export const MAX_PHOTOS = 6;

export function gradientForId(id: string): string {
  const palettes = [
    'linear-gradient(135deg, #4a0a1a, #ec1350)',
    'linear-gradient(135deg, #2a1236, #a855f7)',
    'linear-gradient(135deg, #0b2740, #0ea5e9)',
    'linear-gradient(135deg, #3b1d0e, #f59e0b)',
    'linear-gradient(135deg, #3b1024, #fb7185)',
    'linear-gradient(135deg, #3b1a12, #ff7a59)',
  ];
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return palettes[hash % palettes.length] ?? palettes[0]!;
}

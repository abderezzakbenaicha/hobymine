export type Gender = 'woman' | 'man' | 'nonbinary';
export type InterestedIn = 'women' | 'men' | 'everyone';
export type SwipeAction = 'like' | 'pass' | 'superlike';
export type MessageKind = 'text' | 'image' | 'voice' | 'file' | 'system' | 'call';
/** Answers to the family questions. Empty string in the database means unset. */
export type YesNo = 'yes' | 'no';
export type WantsKids = 'yes' | 'no' | 'maybe';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  age: number;
  gender: Gender;
  bio: string;
  job: string;
  city: string;
  country_code: string | null;
  lat: number | null;
  lng: number | null;
  latitude: number | null;
  longitude: number | null;
  location_city: string | null;
  interests: string[];
  /** Lifestyle tags such as "Non-smoker" or "Fitness lover". */
  lifestyle: string[];
  /** Languages the member speaks. */
  languages: string[];
  height_cm: number | null;
  /** What the member is looking for, e.g. "Long-term relationship". */
  relationship_goal: string;
  has_kids: string;
  wants_kids: string;
  kids_count: number | null;
  has_pets: string;
  pet_types: string[];
  pets_count: number | null;
  /** Short self-introduction recording, at most 20 seconds. */
  voice_intro_url: string | null;
  voice_intro_duration: number | null;
  voice_intro_updated_at: string | Date | null;
  photos: string[];
  verified: boolean;
  plus: boolean;
  plus_until: string | Date | null;
  boost_until: string | Date | null;
  read_receipts: boolean;
  email_verified: boolean;
  is_bot: boolean;
  /** Launch/demo profile created by the seed script; safe to delete in bulk. */
  is_seeded: boolean;
  incognito: boolean;
  /** Set while the member has paused (deactivated) their account. */
  paused_at: string | Date | null;
  /** When the member confirmed they are 18 or older at sign up. */
  age_confirmed_at: string | Date | null;
  /** When the member accepted the Terms of Service and Privacy Policy. */
  terms_accepted_at: string | Date | null;
  terms_version: string | null;
  last_message_at: string | Date | null;
  last_active_at: string | Date;
  created_at: string | Date;
}

export type LocationMode = 'nearby' | 'global';

export interface PreferenceRow {
  user_id: string;
  interested_in: InterestedIn;
  age_min: number;
  age_max: number;
  max_distance: number;
  country_code: string | null;
  location_mode: LocationMode;
}

export interface MessageRow {
  id: string;
  match_id: string;
  sender_id: string;
  kind: MessageKind;
  body: string;
  media_url: string | null;
  /** Original name of an uploaded document, shown in the chat bubble. */
  file_name: string | null;
  /** Size of the uploaded document in bytes. */
  file_size: number | null;
  duration: number | null;
  read_at: string | Date | null;
  created_at: string | Date;
  /** Story this message replies to or likes, when it came from the story player. */
  story_id?: string | null;
  /** Snapshot of the story image, kept after the story itself expires. */
  story_media_url?: string | null;
  story_caption?: string | null;
  /** 'reply' for a comment, 'like' for a like notification. */
  story_event?: string | null;
}

/** Aggregated reactions on a message. */
export interface ReactionSummary {
  emoji: string;
  count: number;
  /** True when the signed in member reacted with this emoji. */
  mine: boolean;
}

export interface MatchRow {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string | Date;
}

/** A 24-hour story, visible only to the author's matches. */
export interface StoryRow {
  id: string;
  user_id: string;
  media_url: string;
  caption: string;
  created_at: string | Date;
  expires_at: string | Date;
}

/** A recorded self-introduction. Duration is capped at 20 seconds. */
export interface VoiceIntro {
  url: string;
  /** Length of the clip in whole seconds (1-20). */
  duration: number;
  /** When the member last recorded or replaced the clip. */
  updatedAt: string | null;
}

export interface PublicUser {
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
  lifestyle: string[];
  languages: string[];
  heightCm: number | null;
  relationshipGoal: string;
  /** Family answers. `null` until the member has been asked. */
  hasKids: YesNo | null;
  wantsKids: WantsKids | null;
  kidsCount: number | null;
  hasPets: YesNo | null;
  petTypes: string[];
  petsCount: number | null;
  /** Up to 20 seconds of the member introducing themselves, when recorded. */
  voiceIntro: VoiceIntro | null;
  photos: string[];
  verified: boolean;
  plus: boolean;
  online: boolean;
  lastActiveAt: string;
  distanceKm: number | null;
  sharedInterests: string[];
  isBot: boolean;
  /** When the member joined, used for the "Member since" profile detail. */
  memberSince: string | null;
}

export interface MeUser extends PublicUser {
  email: string;
  /** False until the six digit code sent at sign up has been confirmed. */
  emailVerified: boolean;
  readReceipts: boolean;
  plusUntil: string | null;
  boostUntil: string | null;
  boostActive: boolean;
  /** When a free member may send their next message. `null` when they can send now. */
  /** Deprecated: always null. Messages are no longer throttled. */
  messageCooldownUntil: string | null;
  /** Last known GPS position, when the member shared it. */
  latitude: number | null;
  longitude: number | null;
  locationCity: string | null;
  /** Browse without leaving a view history (HobyMine Plus). */
  incognito: boolean;
  /** When the member confirmed they are 18 or older at sign up. */
  ageConfirmedAt: string | null;
  /** When the member accepted the Terms of Service and Privacy Policy. */
  termsAcceptedAt: string | null;
  /** Version of the legal documents that was accepted. */
  termsVersion: string | null;
  preferences: {
    interestedIn: InterestedIn;
    ageMin: number;
    ageMax: number;
    maxDistance: number;
    countryCode: string | null;
    locationMode: LocationMode;
  };
}

export interface ChatMessage {
  id: string;
  matchId: string;
  senderId: string;
  kind: MessageKind;
  body: string;
  mediaUrl: string | null;
  /** Original name of an uploaded document (kind = "file"). */
  fileName: string | null;
  /** Size of the uploaded document in bytes (kind = "file"). */
  fileSize: number | null;
  duration: number | null;
  readAt: string | null;
  createdAt: string;
  reactions: ReactionSummary[];
  /** The story a message replies to or likes, with a snapshot for the preview. */
  story: ChatStoryRef | null;
}

/** A copy of the story a chat message refers to. */
export interface ChatStoryRef {
  id: string;
  mediaUrl: string | null;
  caption: string;
  /** 'reply' for a comment, 'like' for a like notification. */
  event: 'reply' | 'like';
}

export interface MatchSummary {
  id: string;
  matchedAt: string;
  user: PublicUser;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  isNew: boolean;
}

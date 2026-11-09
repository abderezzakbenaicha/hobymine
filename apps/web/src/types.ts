export type Gender = 'woman' | 'man' | 'nonbinary';
export type InterestedIn = 'women' | 'men' | 'everyone';
export type SwipeAction = 'like' | 'pass' | 'superlike';
export type MessageKind = 'text' | 'image' | 'voice' | 'file' | 'system' | 'call';

/** A blocked capture attempt reported by the Android shell. */
export type CaptureAttemptKind = 'screenshot' | 'screen-recording';
export type CaptureContext = 'chat' | 'video';

/** An in-chat or in-call alert about the other person's capture attempt. */
export interface CaptureAttemptAlert {
  matchId: string;
  kind: CaptureAttemptKind;
  context: CaptureContext;
  fromUserId: string;
  /** First name of the person who tried to capture the screen. */
  fromName: string;
  at: string;
}

/** A recorded self-introduction. The server caps it at 20 seconds. */
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
  /** Lifestyle tags such as "Non-smoker" or "Fitness lover". */
  lifestyle: string[];
  /** Languages the member speaks. */
  languages: string[];
  /** Height in centimetres, when the member shared it. */
  heightCm: number | null;
  /** What the member is looking for, e.g. "Long-term relationship". */
  relationshipGoal: string;
  /** Family answers. `null` until the member has been asked. */
  hasKids: 'yes' | 'no' | null;
  wantsKids: 'yes' | 'no' | 'maybe' | null;
  kidsCount: number | null;
  hasPets: 'yes' | 'no' | null;
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

export type LocationMode = 'nearby' | 'global';

export interface Preferences {
  interestedIn: InterestedIn;
  ageMin: number;
  ageMax: number;
  maxDistance: number;
  /** ISO 3166-1 alpha-2 country the discovery deck is limited to. */
  countryCode: string | null;
  /** "nearby" uses the shared GPS position, "global" removes the distance bound. */
  locationMode: LocationMode;
}

export interface MeUser extends PublicUser {
  email: string;
  /** Set at sign up; kept for clients that still read the flag. */
  emailVerified: boolean;
  readReceipts: boolean;
  plusUntil: string | null;
  boostUntil: string | null;
  boostActive: boolean;
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
  preferences: Preferences;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  /** True when the signed in member reacted with this emoji. */
  mine: boolean;
}

export interface ChatMessage {
  id: string;
  matchId: string;
  senderId: string;
  /** Filled in on socket events so an alert can name the sender immediately. */
  senderName?: string;
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

/** A 24-hour story, visible only to members who matched with the author. */
export interface Story {
  id: string;
  mediaUrl: string;
  caption: string;
  createdAt: string;
  expiresAt: string;
  /** True when the signed in member is the author. */
  mine: boolean;
  /** Total likes received. Viewer counts are never shown. */
  likes: number;
  /** True when the signed in member liked this story. */
  liked: boolean;
  /** True when the signed in member has already watched it. */
  seen: boolean;
}

/** One author and their active stories. */
export interface StoryGroup {
  user: PublicUser;
  mine: boolean;
  storyCount: number;
  updatedAt: string;
  /** True when every story in the group has been watched. */
  seen: boolean;
  stories: Story[];
}

/** The daily like budget returned with discovery and swipe responses. */
export interface LikeAllowance {
  limit: number;
  used: number;
  remaining: number;
  /** UTC midnight when the free daily budget resets. */
  resetsAt: string;
  /** True for HobyMine Plus members, who can like all day. */
  unlimited: boolean;
}

export interface DiscoveryResponse {
  candidates: PublicUser[];
  likesYouCount: number;
  likeAllowance: LikeAllowance;
  filters: Preferences;
}

export interface SwipeResponse {
  matched: boolean;
  match: MatchSummary | null;
  likesYouCount: number;
  likeAllowance: LikeAllowance;
}

export interface MatchesResponse {
  matches: MatchSummary[];
  likesYouCount: number;
}

export interface LikesResponse {
  users: PublicUser[];
  count: number;
  limited: boolean;
}

/** A person who opened the signed in member's profile. */
export interface ProfileView {
  user: PublicUser;
  /** When that person last opened the profile. */
  viewedAt: string;
}

export interface ProfileViewsResponse {
  views: ProfileView[];
  count: number;
  limited: boolean;
}

/** Realtime alert emitted when somebody opens the signed in member's profile. */
export interface ProfileViewEvent {
  /** Null for free accounts, whose visitor identities stay blurred. */
  viewer: PublicUser | null;
  limited: boolean;
  viewedAt: string;
}

export interface MessagesResponse {
  messages: ChatMessage[];
  hasMore: boolean;
}

/** The one-time free video trial; Plus members are unlimited. */
export interface VideoAllowance {
  plan: 'free' | 'plus';
  secondsUsed: number;
  secondsLimit: number;
  remainingSeconds: number;
  canVideo: boolean;
}

export interface AuthResponse {
  token: string;
  user: MeUser;
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

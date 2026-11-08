import { CalendarDays, Images, MapPin, Mic, Navigation, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { sortBySharedInterests } from '../lib/profile';
import {
  cn,
  distanceLabel,
  genderLabel,
  lastActiveLabel,
  memberSinceLabel,
} from '../lib/utils';
import type { PublicUser } from '../types';
import { InterestPill } from './InterestPill';
import { PhotoCarousel } from './PhotoCarousel';
import { ProfileHighlights } from './ProfileHighlights';
import { VerifiedBadge } from './VerifiedBadge';
import { VoiceIntroPlayer } from './VoiceIntro';

interface FullProfileProps {
  user: PublicUser;
  /** Height override for the photo carousel, e.g. a taller frame on the deck. */
  photoClassName?: string;
  /** Rendered after the interests, before the footer (e.g. safety actions). */
  afterInterests?: ReactNode;
  /** The action row at the bottom of the profile (like/pass/back to chat). */
  footer?: ReactNode;
  /**
   * Show presence (online / last active). Presence is only shared after two
   * members have matched, so Discover and Likes leave this off.
   */
  showPresence?: boolean;
  className?: string;
}

/**
 * The one complete profile layout.
 *
 * Discover, chat and the likes list all open this component inside a `Modal`,
 * so a member sees exactly the same photos, voice introduction, bio, lifestyle
 * details and interests no matter where they tapped.
 */
export function FullProfile({
  user,
  photoClassName,
  afterInterests,
  footer,
  showPresence = false,
  className,
}: FullProfileProps) {
  const interests = sortBySharedInterests(user);
  const gender = genderLabel(user.gender);
  const livesIn = [user.city, user.countryName].filter(Boolean).join(', ');
  const memberSince = memberSinceLabel(user.memberSince);

  const facts: {
    key: string;
    icon: typeof UserRound;
    label: string;
    value: string;
    tone: string;
  }[] = [];
  if (gender) {
    facts.push({ key: 'gender', icon: UserRound, label: 'Gender', value: gender, tone: 'text-neon' });
  }
  if (livesIn) {
    facts.push({ key: 'lives', icon: MapPin, label: 'Lives in', value: livesIn, tone: 'text-sky' });
  }
  if (memberSince) {
    facts.push({
      key: 'member',
      icon: CalendarDays,
      label: 'Member since',
      value: memberSince,
      tone: 'text-violet',
    });
  }
  if (user.photos.length > 0) {
    facts.push({
      key: 'photos',
      icon: Images,
      label: 'Photos',
      value: `${user.photos.length} ${user.photos.length === 1 ? 'photo' : 'photos'}`,
      tone: 'text-neon',
    });
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl',
          photoClassName ?? 'h-[min(45dvh,22.5rem)] min-h-[12rem]',
        )}
      >
        <PhotoCarousel photos={user.photos} name={user.name} id={user.id} />
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="text-xl font-black tracking-[-0.03em] text-white">{user.name}</h2>
          <span className="text-lg font-light text-ink-300">{user.age}</span>
          {user.verified && <VerifiedBadge size="sm" label />}
          {user.plus && (
            <span className="rounded-full border border-neon/30 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-[0.16em] text-neon">
              Plus
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-ink-400">
          {user.job || 'Here for good conversation'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-300">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-neon" />
          {user.countryFlag} {user.countryName || user.city || 'Nearby'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Navigation className="h-3.5 w-3.5 shrink-0 text-neon" />
          {distanceLabel(user.distanceKm)}
        </span>
        {showPresence &&
          (user.online ? (
            <span className="inline-flex items-center gap-1.5 text-neon">
              <span className="h-1.5 w-1.5 rounded-full bg-neon shadow-glow-sm" />
              Active now
            </span>
          ) : (
            <span className="text-ink-500">
              Last active {lastActiveLabel(user.lastActiveAt)}
            </span>
          ))}
      </div>

      {facts.length > 0 && (
        <section aria-label="Profile details">
          <h3 className="mb-2 text-[0.625rem] font-bold uppercase tracking-[0.16em] text-ink-400">
            Details
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {facts.map((fact) => (
              <div
                key={fact.key}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
              >
                <p className="flex items-center gap-1.5 text-[0.5625rem] font-bold uppercase tracking-[0.14em] text-ink-500">
                  <fact.icon className={cn('h-3 w-3 shrink-0', fact.tone)} />
                  {fact.label}
                </p>
                <p className="mt-1 text-[0.6875rem] font-semibold leading-snug text-white">
                  {fact.value}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {user.voiceIntro && (
        <section aria-label="Voice introduction">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="flex items-center gap-1.5 text-[0.625rem] font-bold uppercase tracking-[0.16em] text-ink-400">
              <Mic className="h-3 w-3 text-neon" />
              Voice introduction
            </h3>
            <span className="text-[0.5625rem] font-semibold text-neon">
              {user.voiceIntro.duration > 0 ? `${user.voiceIntro.duration}s` : '20s max'}
            </span>
          </div>
          <VoiceIntroPlayer intro={user.voiceIntro} name={user.name} />
        </section>
      )}

      {user.bio.trim().length > 0 && (
        <section aria-label="About">
          <h3 className="mb-1.5 text-[0.625rem] font-bold uppercase tracking-[0.16em] text-ink-400">
            About
          </h3>
          <p className="text-sm leading-relaxed text-ink-200">{user.bio}</p>
        </section>
      )}

      <ProfileHighlights user={user} variant="full" />

      {interests.length > 0 && (
        <section aria-label="Interests">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="text-[0.625rem] font-bold uppercase tracking-[0.16em] text-ink-400">
              Interests
            </h3>
            {user.sharedInterests.length > 0 && (
              <span className="text-[0.625rem] font-semibold text-neon">
                {user.sharedInterests.length} in common
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {interests.map((interest) => (
              <InterestPill
                key={interest}
                label={interest}
                shared={user.sharedInterests.includes(interest)}
              />
            ))}
          </div>
        </section>
      )}

      {afterInterests}

      {footer ? <div className="pt-1">{footer}</div> : null}
    </div>
  );
}

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from 'framer-motion';
import { Eye, Heart, Info, MapPin, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { sortBySharedInterests } from '../lib/profile';
import { cn, distanceLabel } from '../lib/utils';
import type { PublicUser, SwipeAction } from '../types';
import { InterestPill } from './InterestPill';
import { PhotoCarousel } from './PhotoCarousel';
import { ProfileSheet, useProfileViewer } from './ProfileSheet';
import { VerifiedBadge } from './VerifiedBadge';

interface SwipeDeckProps {
  candidates: PublicUser[];
  onSwipe: (user: PublicUser, action: SwipeAction) => void;
  onRewind?: () => void;
  canRewind?: boolean;
  /** Free members see the rewind control, but tapping it opens the Plus paywall. */
  rewindLocked?: boolean;
  busy?: boolean;
}

const exitVariants = {
  exit: (action: SwipeAction | null) => {
    if (action === 'like') return { x: 640, y: 40, rotate: 22, opacity: 0 };
    if (action === 'pass') return { x: -640, y: 40, rotate: -22, opacity: 0 };
    if (action === 'superlike') return { y: -760, x: 0, rotate: 0, opacity: 0 };
    return { opacity: 0, scale: 0.96 };
  },
};

function SwipeCard({
  user,
  onFullProfile,
}: {
  user: PublicUser;
  onFullProfile?: (user: PublicUser) => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const firstName = user.name.split(' ')[0];
  const place = user.countryName || user.city || 'Nearby';
  const interests = sortBySharedInterests(user);

  return (
    <div className="swipe-card force-dark group relative flex h-full w-full flex-col overflow-hidden rounded-[1.75rem] border border-white/[0.1] bg-ink-850 shadow-card-warm sm:rounded-[2.25rem]">
      {/*
        The portrait is the card. Only a short, soft gradient sits at the
        bottom so the face stays unobstructed while the name, meta line and
        "View full profile" CTA remain readable.
      */}
      <PhotoCarousel
        photos={user.photos}
        name={user.name}
        id={user.id}
        index={photoIndex}
        onIndexChange={setPhotoIndex}
        showArrows={false}
        barsRightInset
        className="absolute inset-0"
      />

      <div className="swipe-card-scrim-top pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-ink-950/45 to-transparent" />
      <div className="swipe-card-scrim-bottom pointer-events-none absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-ink-950 via-ink-950/55 to-transparent" />

      {onFullProfile && (
        <button
          type="button"
          data-photo-control
          onClick={() => onFullProfile(user)}
          className="absolute right-3 top-2 z-30 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-ink-950/30 text-white/85 shadow-float backdrop-blur-md transition hover:border-white/30 hover:bg-ink-950/45 hover:text-white active:scale-95"
          aria-label={`View ${user.name}'s full profile`}
          title="View full profile"
        >
          <Info className="h-4 w-4" />
        </button>
      )}

      <div className="swipe-card-body pointer-events-none absolute inset-x-0 bottom-0 z-10 px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="flex items-center gap-2">
          <h2 className="swipe-card-name min-w-0 truncate font-black leading-none tracking-[-0.045em] text-photo">
            {firstName}
            <span className="ml-2 font-light tracking-[-0.02em] text-photo/65">
              {user.age}
            </span>
          </h2>
          {user.verified && (
            <span className="inline-flex shrink-0 items-center" title="Selfie verified">
              <VerifiedBadge size="sm" />
            </span>
          )}
          {user.plus && (
            <span className="shrink-0 rounded-full border border-neon/30 bg-neon/10 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-[0.14em] text-neon-soft backdrop-blur-md">
              Plus
            </span>
          )}
        </div>

        <p className="swipe-card-meta mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-photo/75">
          <span className="truncate">{user.job || 'Living curiously'}</span>
          <span className="text-photo/30">·</span>
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0 text-photo/55" />
            <span className="truncate">
              {user.countryFlag} {place}
            </span>
          </span>
          <span className="text-photo/30">·</span>
          <span className="shrink-0 text-neon-soft">{distanceLabel(user.distanceKm)}</span>
        </p>

        {interests.length > 0 && (
          <div className="swipe-card-interests mt-2.5 flex flex-wrap gap-1.5">
            {interests.slice(0, 3).map((interest) => (
              <InterestPill
                key={interest}
                label={interest}
                shared={user.sharedInterests.includes(interest)}
                className="border-white/20 bg-ink-950/30 px-2 py-0.5 text-[0.625rem] text-photo/90"
              />
            ))}
            {interests.length > 3 && (
              <span className="inline-flex items-center rounded-full border border-white/15 bg-ink-950/25 px-2 py-0.5 text-[0.625rem] font-medium text-photo/70 backdrop-blur">
                +{interests.length - 3}
              </span>
            )}
          </div>
        )}

        {onFullProfile && (
          <button
            type="button"
            data-photo-control
            onClick={() => onFullProfile(user)}
            className="swipe-card-cta pointer-events-auto mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-full border border-white/20 bg-ink-950/35 py-2.5 text-[0.6875rem] font-semibold text-photo backdrop-blur-md transition hover:border-white/35 hover:bg-ink-950/50 active:scale-[0.99]"
            aria-label={`View ${user.name}'s full profile`}
          >
            <Eye className="h-3.5 w-3.5" />
            View full profile
          </button>
        )}
      </div>
    </div>
  );
}

function TopCard({
  user,
  onSwipe,
  disabled,
  onFullProfile,
}: {
  user: PublicUser;
  onSwipe: (action: SwipeAction) => void;
  disabled: boolean;
  onFullProfile?: (user: PublicUser) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-320, 0, 320], [-16, 0, 16]);
  const likeOpacity = useTransform(x, [20, 110], [0, 1]);
  const nopeOpacity = useTransform(x, [-20, -110], [0, 1]);
  const superOpacity = useTransform(y, [-20, -120], [0, 1]);
  const leftRef = useRef(false);

  const finish = (action: SwipeAction): void => {
    if (leftRef.current || disabled) return;
    leftRef.current = true;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.(action === 'superlike' ? [12, 30, 12] : 12);
    }
    onSwipe(action);
  };

  const onDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo): void => {
    const { offset, velocity } = info;
    if (offset.y < -120 || velocity.y < -750) {
      finish('superlike');
      return;
    }
    if (offset.x > 110 || velocity.x > 700) {
      finish('like');
      return;
    }
    if (offset.x < -110 || velocity.x < -700) {
      finish('pass');
      return;
    }
    animate(x, 0, { type: 'spring', stiffness: 420, damping: 32 });
    animate(y, 0, { type: 'spring', stiffness: 420, damping: 32 });
  };

  return (
    <motion.div
      className={cn(
        'absolute inset-0 z-30 cursor-grab touch-none active:cursor-grabbing',
        disabled && 'pointer-events-none',
      )}
      style={{ x, y, rotate }}
      drag={!disabled}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.82}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      variants={exitVariants}
      exit="exit"
      custom={null}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <SwipeCard user={user} onFullProfile={onFullProfile} />

      <motion.div
        className="pointer-events-none absolute left-6 top-24 z-40 -rotate-12 rounded-2xl border-2 border-neon/80 bg-neon/10 px-4 py-2 text-xl font-black uppercase tracking-[0.18em] text-neon-soft shadow-glow backdrop-blur-md"
        style={{ opacity: likeOpacity }}
      >
        Like
      </motion.div>
      <motion.div
        className="pointer-events-none absolute right-6 top-24 z-40 rotate-12 rounded-2xl border-2 border-rose/80 bg-rose/10 px-4 py-2 text-xl font-black uppercase tracking-[0.18em] text-rose backdrop-blur-md"
        style={{ opacity: nopeOpacity }}
      >
        Nope
      </motion.div>
      <motion.div
        className="pointer-events-none absolute inset-x-0 top-24 z-40 mx-auto w-fit rounded-2xl border-2 border-sky/80 bg-sky/10 px-4 py-2 text-xl font-black uppercase tracking-[0.18em] text-sky shadow-[0_0_30px_rgba(111,211,255,0.25)] backdrop-blur-md"
        style={{ opacity: superOpacity }}
      >
        Super Like
      </motion.div>
    </motion.div>
  );
}

export function SwipeDeck({
  candidates,
  onSwipe,
  onRewind,
  canRewind = false,
  rewindLocked = false,
  busy = false,
}: SwipeDeckProps) {
  const [lastAction, setLastAction] = useState<SwipeAction | null>(null);
  const viewer = useProfileViewer();
  const top = candidates[0];
  const visibleBack = candidates.slice(1, 3);

  const trigger = (action: SwipeAction): void => {
    if (!top || busy) return;
    setLastAction(action);
    onSwipe(top, action);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!top || busy) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        trigger('pass');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        trigger('like');
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        trigger('superlike');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top?.id, busy]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center">
      <div className="swipe-stage relative w-full max-w-[26.875rem] flex-1 lg:h-[min(72vh,700px)] lg:flex-none">
        {visibleBack
          .slice()
          .reverse()
          .map((user, reverseIndex) => {
            const depth = visibleBack.length - reverseIndex;
            return (
              <div
                key={user.id}
                className="absolute inset-0 overflow-hidden rounded-[1.75rem] border border-white/[0.06] sm:rounded-[2.25rem]"
                style={{
                  transform: `translateY(${depth * 8}px) scale(${1 - depth * 0.035})`,
                  opacity: depth === 1 ? 0.8 : 0.45,
                  zIndex: 20 - depth,
                  filter: depth === 2 ? 'saturate(0.65)' : 'saturate(0.9)',
                }}
                aria-hidden="true"
              >
                <SwipeCard user={user} onFullProfile={viewer.openProfile} />
                <div className="absolute inset-0 bg-gradient-to-b from-ink-950/35 via-ink-950/20 to-ink-950/45 backdrop-blur-[1px]" />
              </div>
            );
          })}

        <AnimatePresence custom={lastAction} initial={false}>
          {top ? (
            <motion.div
              key={top.id}
              className="absolute inset-0"
              style={{ zIndex: 30 }}
              custom={lastAction}
              variants={exitVariants}
              exit="exit"
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <TopCard
                user={top}
                disabled={busy}
                onFullProfile={viewer.openProfile}
                onSwipe={(action) => {
                  setLastAction(action);
                  onSwipe(top, action);
                }}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {!top && (
          <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-gradient-to-b from-ink-850/80 via-ink-900/70 to-ink-850/80 px-6 text-center shadow-card-warm backdrop-blur-sm sm:rounded-[2.25rem] sm:px-8">
            <div className="pointer-events-none absolute -top-16 h-48 w-48 rounded-full bg-neon/15 blur-3xl" aria-hidden="true" />
            <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] shadow-float sm:h-[4.5rem] sm:w-[4.5rem]">
              <span className="absolute inset-0 rounded-full bg-gradient-to-br from-neon/25 to-transparent" aria-hidden="true" />
              <Heart className="relative h-6 w-6 text-neon-soft sm:h-7 sm:w-7" />
            </div>
            <p className="relative text-base font-semibold tracking-[-0.01em] text-white sm:text-lg">
              That’s everyone for now
            </p>
            <p className="relative mt-2 max-w-[14rem] text-xs leading-relaxed text-ink-400 sm:max-w-[15rem] sm:text-sm">
              You’ve seen the whole deck. Widen your filters or check back soon.
            </p>
          </div>
        )}
      </div>

      {/* The stacked cards stay inside the front card's footprint, and the
          action bar keeps a clear gap plus a higher z-index: the buttons can
          never sit underneath the card or its shadow. */}
      {top && (
        <div className="swipe-actions relative z-30 mt-5 flex w-full max-w-[26.875rem] shrink-0 items-center justify-center gap-3 pb-1 sm:mt-6 sm:gap-5 sm:pb-2">
          <button
            type="button"
            onClick={() => trigger('pass')}
            disabled={!top || busy}
            className="swipe-action-pass flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.09] bg-gradient-to-b from-white/[0.09] to-white/[0.02] text-ink-200 shadow-float backdrop-blur-md transition hover:border-rose/35 hover:from-rose/15 hover:to-rose/[0.04] hover:text-rose active:scale-95 disabled:opacity-40 sm:h-14 sm:w-14"
            aria-label="Pass"
            title="Pass (←)"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>

          <button
            type="button"
            onClick={() => trigger('like')}
            disabled={!top || busy}
            className="swipe-action-like group relative flex h-16 w-16 items-center justify-center rounded-full bg-neon-gradient text-ink-950 shadow-glow ring-1 ring-inset ring-white/25 transition hover:brightness-105 active:scale-95 disabled:opacity-40 sm:h-[4.25rem] sm:w-[4.25rem]"
            aria-label="Like"
            title="Like (→)"
          >
            <span
              className="pointer-events-none absolute -inset-1.5 rounded-full bg-neon/25 blur-lg transition-opacity group-hover:opacity-90"
              aria-hidden="true"
            />
            <Heart className="relative h-7 w-7 fill-ink-950 sm:h-8 sm:w-8" />
          </button>

          <button
            type="button"
            onClick={onRewind}
            disabled={!onRewind || busy || (!canRewind && !rewindLocked)}
            className={cn(
              'swipe-action-rewind flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.09] bg-gradient-to-b from-white/[0.09] to-white/[0.02] text-ink-200 shadow-float backdrop-blur-md transition hover:border-neon/30 hover:from-neon/15 hover:to-neon/[0.04] hover:text-neon-soft active:scale-95 disabled:opacity-40 sm:h-14 sm:w-14',
              /*
               * Free members still get the full-size control, just faded. No
               * lock glyph: tapping it opens the Plus paywall instead.
               */
              rewindLocked && 'opacity-60 hover:opacity-90',
            )}
            aria-label={rewindLocked ? 'Rewind last swipe (HobyMine Plus)' : 'Rewind last swipe'}
            title={rewindLocked ? 'Rewind — HobyMine Plus' : 'Rewind'}
          >
            <RotateCcw className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>
      )}

      <ProfileSheet
        user={viewer.profile}
        onClose={viewer.closeProfile}
        photoClassName="h-[min(52dvh,26rem)] max-h-[26rem] min-h-[12rem] w-full"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                const target = viewer.profile;
                viewer.closeProfile();
                if (target) onSwipe(target, 'pass');
              }}
            >
              <X className="h-4 w-4" />
              Pass
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                const target = viewer.profile;
                viewer.closeProfile();
                if (target) onSwipe(target, 'like');
              }}
            >
              <Heart className="h-4 w-4 fill-ink-950" />
              Like
            </button>
            <button
              type="button"
              className="btn-ghost col-span-2"
              onClick={() => {
                const target = viewer.profile;
                viewer.closeProfile();
                if (target) onSwipe(target, 'superlike');
              }}
            >
              Super Like
            </button>
          </div>
        }
      />
    </div>
  );
}

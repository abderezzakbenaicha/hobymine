import { ArrowRight, Heart, Lock, Sparkles, Star } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { mediaUrl } from '../lib/media';
import { cn, interestEmoji } from '../lib/utils';
import { useChatStore } from '../store/chat';
import type { PublicUser } from '../types';

function LikeCard({ person, limited }: { person: PublicUser; limited: boolean }) {
  const photo = mediaUrl(person.photos[0]);

  if (limited) {
    return (
      <Link
        to="/plus"
        className="force-dark group relative aspect-[3/4] w-[7.375rem] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-ink-850"
        aria-label="Hidden admirer. Upgrade to HobyMine Plus to see who likes you."
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            draggable={false}
            className="h-full w-full scale-110 object-cover blur-[0.6875rem] saturate-[0.75]"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-ink-700 via-ink-800 to-ink-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/25 to-black/10" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-neon/30 bg-ink-950/70 text-neon backdrop-blur">
            <Lock className="h-4 w-4" />
          </span>
          <span className="rounded-full border border-neon/25 bg-ink-950/70 px-2 py-0.5 text-[0.5rem] font-bold uppercase tracking-[0.16em] text-neon backdrop-blur">
            Hidden
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-2.5 text-center">
          <p className="text-[0.625rem] font-semibold text-white/85">{person.age} · Someone nearby</p>
          <p className="mt-0.5 text-[0.5625rem] text-ink-400">Tap to reveal</p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to="/likes"
      className="force-dark group relative aspect-[3/4] w-[8.875rem] shrink-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-850 shadow-float"
    >
      {photo ? (
        <img
          src={photo}
          alt={person.name}
          draggable={false}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-ink-700 via-ink-800 to-ink-900" />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-card-fade" />
      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-neon/30 bg-black/45 px-2 py-1 text-[0.5rem] font-bold uppercase tracking-wider text-neon backdrop-blur">
        <Heart className="h-2.5 w-2.5 fill-neon" />
        Likes you
      </span>
      {person.plus && (
        <span className="absolute right-2 top-2 rounded-full border border-neon/25 bg-black/45 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-neon backdrop-blur">
          Plus
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 p-2.5">
        <div className="flex items-end gap-1.5">
          <p className="truncate text-base font-black leading-none tracking-[-0.03em] text-white">
            {person.name.split(' ')[0]}
          </p>
          <span className="text-sm font-light text-white/85">{person.age}</span>
        </div>
        <p className="mt-1 truncate text-[0.625rem] text-white/70">
          {person.job || 'Here for good conversation'}
        </p>
        {person.sharedInterests.length > 0 && (
          <p className="mt-1.5 flex items-center gap-1 truncate text-[0.5625rem] font-medium text-neon-soft">
            <Star className="h-2.5 w-2.5 shrink-0 fill-neon-soft" />
            {person.sharedInterests
              .slice(0, 2)
              .map((interest) => `${interestEmoji(interest)} ${interest}`)
              .join(' · ')}
          </p>
        )}
      </div>
    </Link>
  );
}

export function LikesSection({ className }: { className?: string }) {
  const likes = useChatStore((state) => state.likes);
  const likesLimited = useChatStore((state) => state.likesLimited);
  const likesLoaded = useChatStore((state) => state.likesLoaded);
  const loadingLikes = useChatStore((state) => state.loadingLikes);
  const likesYouCount = useChatStore((state) => state.likesYouCount);
  const loadLikes = useChatStore((state) => state.loadLikes);

  useEffect(() => {
    void loadLikes().catch(() => {
      // The section still renders an empty state if the request fails.
    });
  }, [loadLikes]);

  const preview = likes.slice(0, 8);
  const isInitialLoading = loadingLikes && !likesLoaded;

  return (
    <section className={cn('mt-8', className)} aria-labelledby="likes-section-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="likes-section-heading"
            className="flex items-center gap-2 text-sm font-semibold text-white"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neon/10 text-neon">
              <Heart className="h-3.5 w-3.5 fill-neon" />
            </span>
            Likes
            {likesYouCount > 0 && (
              <span className="rounded-full bg-neon/10 px-2 py-0.5 text-[0.625rem] font-semibold text-neon">
                {likesYouCount}
              </span>
            )}
          </h2>
          <p className="mt-1.5 text-[0.6875rem] text-ink-400">
            {likesLimited
              ? 'Your admirers are here, but their identities stay blurred until you upgrade.'
              : 'People who already swiped right. Your move.'}
          </p>
        </div>
        <Link
          to="/likes"
          className="flex items-center gap-1 text-[0.6875rem] font-semibold text-neon transition hover:gap-1.5"
        >
          See all
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {isInitialLoading ? (
        <div className="mt-4 flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="aspect-[3/4] w-[7.375rem] shrink-0 animate-pulse rounded-2xl bg-ink-850"
            />
          ))}
        </div>
      ) : preview.length === 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] text-ink-500">
              <Heart className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium text-ink-200">No new likes right now</p>
              <p className="text-[0.6875rem] text-ink-500">Your next admirer is one swipe away.</p>
            </div>
          </div>
          <Link to="/discover" className="text-xs font-semibold text-neon hover:underline">
            Discover
          </Link>
        </div>
      ) : (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {preview.map((person) => (
            <LikeCard key={person.id} person={person} limited={likesLimited} />
          ))}
          <Link
            to="/likes"
            className="flex aspect-[3/4] w-[4.25rem] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-ink-400 transition hover:border-neon/30 hover:text-neon"
            aria-label="See all likes"
          >
            <ArrowRight className="h-4 w-4" />
            <span className="text-[0.5625rem] font-semibold uppercase tracking-wider">All</span>
          </Link>
        </div>
      )}

      {likesLimited && preview.length > 0 && (
        <Link
          to="/plus"
          className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-neon/20 bg-gradient-to-r from-neon/[0.1] via-ink-850 to-sky/[0.05] px-4 py-3 transition hover:border-neon/40"
        >
          <span className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neon/15 text-neon">
              <Sparkles className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-[0.6875rem] font-semibold text-white">
                Unlock every like with HobyMine Plus
              </span>
              <span className="block text-[0.625rem] text-ink-400">
                Clear photos, full profiles, and a like back button.
              </span>
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-neon" />
        </Link>
      )}
    </section>
  );
}

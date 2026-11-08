import {
  ArrowRight,
  Eye,
  Heart,
  Lock,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState } from '../components/EmptyState';
import { PhotoCarousel } from '../components/PhotoCarousel';
import { ProfileSheet, useProfileViewer } from '../components/ProfileSheet';
import { SafetyActions } from '../components/SafetyActions';
import { Skeleton } from '../components/Spinner';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { api, ApiClientError } from '../lib/api';
import { mediaUrl } from '../lib/media';
import { loadProfileViewers } from '../lib/profileViews';
import {
  cn,
  distanceLabel,
  formatRelativeShort,
  interestEmoji,
} from '../lib/utils';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import type { ProfileView, PublicUser, SwipeResponse } from '../types';

type LikesTab = 'received' | 'sent' | 'views';

function tabFromParam(value: string | null): LikesTab {
  return value === 'sent' || value === 'views' ? value : 'received';
}

export function LikesPage() {
  const user = useAuthStore((state) => state.user);
  const likes = useChatStore((state) => state.likes);
  const likesLimited = useChatStore((state) => state.likesLimited);
  const likesLoaded = useChatStore((state) => state.likesLoaded);
  const loadingLikes = useChatStore((state) => state.loadingLikes);
  const likesYouCount = useChatStore((state) => state.likesYouCount);
  const loadLikes = useChatStore((state) => state.loadLikes);
  const removeLike = useChatStore((state) => state.removeLike);
  const applySwipeResult = useChatStore((state) => state.applySwipeResult);
  const showMatch = useUiStore((state) => state.showMatch);
  const openPaywall = useUiStore((state) => state.openPaywall);

  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<LikesTab>(() => tabFromParam(searchParams.get('tab')));
  const [sent, setSent] = useState<PublicUser[]>([]);
  const [sentLoading, setSentLoading] = useState(false);
  const [views, setViews] = useState<ProfileView[]>([]);
  const [viewsCount, setViewsCount] = useState(0);
  const [viewsLimited, setViewsLimited] = useState(false);
  const [viewsLoading, setViewsLoading] = useState(false);
  const [viewsError, setViewsError] = useState<string | null>(null);
  const profileViewer = useProfileViewer();

  const changeTab = (value: LikesTab): void => {
    setTab(value);
    const next = new URLSearchParams(searchParams);
    if (value === 'received') next.delete('tab');
    else next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    setTab(tabFromParam(searchParams.get('tab')));
  }, [searchParams]);

  /**
   * Opens the one shared full profile sheet. The hook records the visit (so the
   * other member gets the usual realtime alert) and refreshes the details.
   */
  const viewProfile = (person: PublicUser): void => {
    profileViewer.openProfile(person);
  };

  const loadSent = useCallback(async (): Promise<void> => {
    setSentLoading(true);
    try {
      const data = await api.get<{ users: PublicUser[] }>('/api/likes/sent');
      setSent(data.users);
    } catch {
      setSent([]);
    } finally {
      setSentLoading(false);
    }
  }, []);

  const loadViews = useCallback(async (): Promise<void> => {
    if (!user) return;
    setViewsLoading(true);
    setViewsError(null);
    try {
      const data = await loadProfileViewers(user.id, user.plus);
      setViews(data.views);
      setViewsCount(data.count);
      setViewsLimited(data.limited);
    } catch (loadError) {
      setViewsError(
        loadError instanceof ApiClientError
          ? loadError.message
          : 'Could not load your profile views.',
      );
    } finally {
      setViewsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (tab === 'sent') void loadSent();
    if (tab === 'views') void loadViews();
  }, [tab, loadSent, loadViews]);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      await loadLikes(true);
    } catch (loadError) {
      setError(
        loadError instanceof ApiClientError
          ? loadError.message
          : 'Could not load the people who like you.',
      );
    }
  }, [loadLikes]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (person: PublicUser, action: 'like' | 'pass'): Promise<void> => {
    if (busyId) return;
    setBusyId(person.id);
    try {
      const result = await api.post<SwipeResponse>('/api/swipes', {
        targetId: person.id,
        action,
      });
      applySwipeResult(result);
      removeLike(person.id);
      if (result.match) {
        showMatch(result.match);
      } else if (action === 'like') {
        toast.success(`You liked ${person.name.split(' ')[0]}`);
      } else {
        toast(`Passed on ${person.name.split(' ')[0]}`);
      }
    } catch (actionError) {
      if (actionError instanceof ApiClientError && actionError.code === 'like_limit') {
        const details = (actionError.details ?? {}) as {
          limit?: number;
          used?: number;
          resetsAt?: string;
        };
        openPaywall({
          reason: 'like_limit',
          limit: details.limit ?? 30,
          used: details.used ?? 30,
          resetsAt: details.resetsAt,
        });
        return;
      }
      toast.error(
        actionError instanceof ApiClientError
          ? actionError.message
          : 'That did not go through. Try again.',
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!user) return null;

  const isInitialLoading = loadingLikes && !likesLoaded;

  return (
    <div className="animate-slide-up">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[0.625rem] font-bold uppercase tracking-[0.28em] text-neon">
            <Heart className="h-3 w-3 fill-neon" />
            Connections
          </p>
          <h1 className="mt-1.5 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
            Likes
          </h1>
          <p className="mt-1 text-[0.6875rem] text-ink-400 sm:text-xs">
            {tab === 'views'
              ? viewsLimited
                ? 'Free accounts see the count and blurred cards. Plus unblurs every visitor.'
                : 'Only you can see who opened your profile.'
              : likesLimited
                ? 'Blurred for free accounts. Upgrade to meet your admirers.'
                : 'These people already swiped right. Your move.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-neon/25 bg-neon/10 px-3 py-1.5 text-[0.625rem] font-bold text-neon">
            {tab === 'views'
              ? `${viewsCount} ${viewsCount === 1 ? 'view' : 'views'}`
              : `${likesYouCount} waiting`}
          </span>
          <button
            type="button"
            onClick={() =>
              void (tab === 'views' ? loadViews() : tab === 'sent' ? loadSent() : load())
            }
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-ink-300 transition hover:text-white sm:h-10 sm:w-10"
            aria-label={
              tab === 'views' ? 'Refresh profile views' : tab === 'sent' ? 'Refresh sent likes' : 'Refresh likes'
            }
          >
            <RefreshCw
              className={cn(
                'h-4 w-4',
                (tab === 'views' ? viewsLoading : tab === 'sent' ? sentLoading : loadingLikes) &&
                  'animate-spin',
              )}
            />
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-1 rounded-2xl border border-white/8 bg-ink-900/90 p-1">
        {(
          [
            { value: 'received', label: 'Likes you' },
            { value: 'sent', label: 'Sent likes' },
            { value: 'views', label: 'Profile views' },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => changeTab(option.value)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-xl px-2 py-2.5 text-[0.6875rem] font-semibold transition sm:px-4 sm:text-sm',
              tab === option.value
                ? 'bg-white text-canvas shadow-sm'
                : 'text-ink-400 hover:text-white',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === 'sent' ? (
        sentLoading ? (
          <div className="card-grid mt-4 gap-3 sm:mt-6 sm:gap-5">
            {[0, 1, 2].map((index) => (
              <div key={index} className="space-y-2 sm:space-y-3">
                <Skeleton className="aspect-[4/5] w-full rounded-2xl sm:rounded-3xl" />
                <Skeleton className="h-3 w-2/3 sm:h-4" />
              </div>
            ))}
          </div>
        ) : sent.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Heart}
              title="You have not liked anyone yet"
              description="Everyone you swipe right on shows up here, so you can keep track of the people you liked."
              action={
                <Link to="/discover" className="btn-primary">
                  <Heart className="h-4 w-4" />
                  Start swiping
                </Link>
              }
            />
          </div>
        ) : (
          <div className="card-grid mt-4 gap-3 sm:mt-6 sm:gap-5">
            {sent.map((person) => (
              <article
                key={person.id}
                className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/70 shadow-float sm:rounded-3xl"
              >
                <div className="force-dark relative aspect-[4/5] overflow-hidden">
                  <PhotoCarousel photos={person.photos} name={person.name} id={person.id} />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-card-fade" />
                  <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2 pt-5 sm:p-3 sm:pt-6">
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky/30 bg-black/40 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-sky backdrop-blur-md sm:px-2 sm:py-1 sm:text-[0.5625rem]">
                      <Heart className="h-2 w-2 fill-sky sm:h-2.5 sm:w-2.5" />
                      You liked them
                    </span>
                    {person.verified && (
                      <span className="rounded-full border border-sky/30 bg-black/40 px-1.5 py-0.5 text-sky backdrop-blur-md sm:px-2 sm:py-1">
                        <VerifiedBadge size="sm" />
                      </span>
                    )}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 z-10 p-2.5 sm:p-4">
                    <div className="flex items-end gap-1.5 sm:gap-2">
                      <h2 className="truncate text-lg font-black leading-none tracking-[-0.03em] text-white sm:text-2xl">
                        {person.name.split(' ')[0]}
                      </h2>
                      <span className="pb-0.5 text-sm font-light text-white/85 sm:text-lg">
                        {person.age}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-[0.5625rem] text-white/75 sm:mt-1.5 sm:gap-x-2 sm:text-[0.65625rem]">
                      <span className="hidden truncate sm:inline">
                        {person.job || 'Here for good conversation'}
                      </span>
                      <span className="hidden text-white/30 sm:inline">•</span>
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="h-2.5 w-2.5 shrink-0 text-neon-soft" />
                        <span className="truncate">{distanceLabel(person.distanceKm)}</span>
                      </span>
                    </p>
                  </div>
                </div>
                <div className="p-2 sm:p-3">
                  <button
                    type="button"
                    onClick={() => viewProfile(person)}
                    className="flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] text-[0.625rem] font-bold text-ink-200 transition hover:border-neon/30 hover:text-white disabled:opacity-50 sm:h-12 sm:text-xs"
                  >
                    <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    View Full Profile
                  </button>
                </div>
              </article>
            ))}
          </div>
        )
      ) : tab === 'views' ? (
        viewsLoading ? (
          <div className="card-grid mt-4 gap-3 sm:mt-6 sm:gap-5">
            {[0, 1, 2].map((index) => (
              <div key={index} className="space-y-2 sm:space-y-3">
                <Skeleton className="aspect-[4/5] w-full rounded-2xl sm:rounded-3xl" />
                <Skeleton className="h-3 w-2/3 sm:h-4" />
                <Skeleton className="h-9 w-full rounded-xl sm:h-10" />
              </div>
            ))}
          </div>
        ) : viewsError ? (
          <div className="mt-4">
            <EmptyState
              icon={Eye}
              title="Couldn’t load profile views"
              description={viewsError}
              action={
                <button type="button" className="btn-primary" onClick={() => void loadViews()}>
                  <RefreshCw className="h-4 w-4" />
                  Try again
                </button>
              }
            />
          </div>
        ) : views.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Eye}
              title="No profile views yet"
              description="When someone opens your profile, they’ll show up here. A complete profile with great photos gets more visits."
              action={
                <Link to="/profile/edit" className="btn-primary">
                  <Sparkles className="h-4 w-4" />
                  Polish your profile
                </Link>
              }
            />
          </div>
        ) : (
          <>
            <section
              className={cn(
                'relative mt-4 overflow-hidden rounded-2xl border p-4 sm:mt-6 sm:rounded-[1.75rem] sm:p-6',
                viewsLimited
                  ? 'border-neon/20 bg-gradient-to-r from-neon/[0.11] via-ink-900 to-sky/[0.06]'
                  : 'border-white/[0.07] bg-ink-900/60',
              )}
            >
              {viewsLimited && (
                <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-neon/15 blur-[5.625rem]" />
              )}
              <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border sm:h-11 sm:w-11',
                      viewsLimited
                        ? 'border-neon/30 bg-neon/10 text-neon'
                        : 'border-sky/25 bg-sky/10 text-sky',
                    )}
                  >
                    {viewsLimited ? <Lock className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      {viewsCount} {viewsCount === 1 ? 'person viewed' : 'people viewed'} your
                      profile
                    </h2>
                    <p className="mt-1 max-w-lg text-[0.6875rem] leading-relaxed text-ink-300">
                      {viewsLimited
                        ? 'Free accounts see the total count and blurred cards. HobyMine Plus reveals every visitor, their photo, age, and full profile.'
                        : 'Only you can see this list. Tap any visitor to open their full profile.'}
                    </p>
                  </div>
                </div>
                {viewsLimited ? (
                  <Link to="/plus" className="btn-primary w-full shrink-0 justify-center sm:w-auto">
                    <Zap className="h-4 w-4" />
                    Unlock with Plus
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <span className="shrink-0 rounded-full border border-sky/25 bg-sky/10 px-3 py-1.5 text-[0.625rem] font-bold text-sky">
                    {viewsCount} total
                  </span>
                )}
              </div>
            </section>

            <div className="card-grid mt-4 gap-3 sm:mt-6 sm:gap-5">
              {views.map((entry) => {
                const person = entry.user;
                const viewedLabel =
                  formatRelativeShort(entry.viewedAt) === 'now'
                    ? 'Viewed just now'
                    : `Viewed ${formatRelativeShort(entry.viewedAt)} ago`;

                return viewsLimited ? (
                  <article
                    key={person.id}
                    className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/70 shadow-float sm:rounded-3xl"
                  >
                    <div className="force-dark relative aspect-[4/5] overflow-hidden">
                      {person.photos[0] ? (
                        <img
                          src={mediaUrl(person.photos[0]) ?? undefined}
                          alt=""
                          draggable={false}
                          className="h-full w-full scale-110 object-cover blur-[0.9375rem] saturate-[0.75]"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-ink-700 via-ink-800 to-ink-900" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-black/10" />
                      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2 pt-5 sm:p-3 sm:pt-6">
                        <span className="inline-flex items-center gap-1 rounded-full border border-neon/30 bg-black/45 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-neon backdrop-blur-md sm:px-2 sm:py-1 sm:text-[0.5625rem]">
                          <Eye className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
                          Viewed you
                        </span>
                        <span className="hidden rounded-full border border-neon/25 bg-black/45 px-2 py-1 text-[0.5rem] font-bold uppercase tracking-wider text-neon backdrop-blur-md sm:inline">
                          Plus
                        </span>
                      </div>
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 sm:gap-3">
                        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-neon/30 bg-ink-950/65 text-neon backdrop-blur sm:h-16 sm:w-16 sm:rounded-2xl">
                          <Lock className="h-5 w-5 sm:h-7 sm:w-7" />
                        </span>
                        <span className="text-[0.5rem] font-bold uppercase tracking-[0.2em] text-neon-soft sm:text-[0.625rem] sm:tracking-[0.24em]">
                          Hidden visitor
                        </span>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 z-10 p-2.5 text-center sm:p-4">
                        <p className="text-xs font-semibold text-white sm:text-sm">
                          {person.age} · Someone nearby
                        </p>
                        <p className="mt-1 text-[0.5625rem] text-ink-300 sm:text-[0.625rem]">
                          {viewedLabel}
                        </p>
                      </div>
                    </div>
                    <div className="p-2 sm:p-3">
                      <Link
                        to="/plus"
                        className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-neon/25 bg-neon/10 text-[0.625rem] font-bold text-neon transition hover:bg-neon/15 sm:h-12 sm:gap-2 sm:text-xs"
                      >
                        <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="sm:hidden">Reveal visitor</span>
                        <span className="hidden sm:inline">Reveal with HobyMine Plus</span>
                      </Link>
                    </div>
                  </article>
                ) : (
                  <article
                    key={person.id}
                    className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/70 shadow-float sm:rounded-3xl"
                  >
                    <div className="force-dark relative aspect-[4/5] overflow-hidden">
                      <PhotoCarousel photos={person.photos} name={person.name} id={person.id} />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-card-fade" />

                      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2 pt-5 sm:p-3 sm:pt-6">
                        <span className="inline-flex items-center gap-1 rounded-full border border-sky/30 bg-black/40 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-sky backdrop-blur-md sm:px-2 sm:py-1 sm:text-[0.5625rem]">
                          <Eye className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
                          Viewed you
                        </span>
                        {person.verified && (
                          <span className="rounded-full border border-sky/30 bg-black/40 px-1.5 py-0.5 text-sky backdrop-blur-md sm:px-2 sm:py-1">
                            <VerifiedBadge size="sm" />
                          </span>
                        )}
                      </div>

                      <div className="absolute inset-x-0 bottom-0 z-10 p-2.5 sm:p-4">
                        <div className="flex items-end gap-1.5 sm:gap-2">
                          <h2 className="truncate text-lg font-black leading-none tracking-[-0.03em] text-white sm:text-2xl">
                            {person.name.split(' ')[0]}
                          </h2>
                          <span className="pb-0.5 text-sm font-light text-white/85 sm:text-lg">
                            {person.age}
                          </span>
                          {person.plus && (
                            <span className="mb-0.5 hidden rounded bg-neon/15 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-neon sm:inline">
                              Plus
                            </span>
                          )}
                        </div>
                        <p className="mt-1 flex items-center gap-1.5 text-[0.5625rem] text-white/75 sm:mt-1.5 sm:gap-x-2 sm:text-[0.65625rem]">
                          <span className="hidden truncate sm:inline">
                            {person.job || 'Here for good conversation'}
                          </span>
                          <span className="hidden text-white/30 sm:inline">•</span>
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <Eye className="h-2.5 w-2.5 shrink-0 text-sky" />
                            <span className="truncate">{viewedLabel}</span>
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="p-2 sm:p-3">
                      <button
                        type="button"
                        onClick={() => viewProfile(person)}
                        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-sky/25 bg-sky/10 text-[0.625rem] font-bold text-sky transition hover:bg-sky/15 disabled:opacity-50 sm:h-12 sm:gap-2 sm:text-xs"
                      >
                        <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        View Full Profile
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )
      ) : isInitialLoading ? (
        <div className="card-grid mt-4 gap-3 sm:mt-6 sm:gap-5">
          {[0, 1, 2].map((index) => (
            <div key={index} className="space-y-2 sm:space-y-3">
              <Skeleton className="aspect-[4/5] w-full rounded-2xl sm:rounded-3xl" />
              <Skeleton className="h-3 w-2/3 sm:h-4" />
              <Skeleton className="h-9 w-full rounded-xl sm:h-10" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="mt-4">
          <EmptyState
            icon={RefreshCw}
            title="Couldn’t fetch your likes"
            description={error}
            action={
              <button type="button" className="btn-primary" onClick={() => void load()}>
                <RefreshCw className="h-4 w-4" />
                Try again
              </button>
            }
          />
        </div>
      ) : likes.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={Heart}
            title="No new likes right now"
            description="You’ve seen everyone who liked you. Keep swiping — your next admirer might be one card away."
            action={
              <Link to="/discover" className="btn-primary">
                <Heart className="h-4 w-4" />
                Back to discovery
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {likesLimited && (
            <section className="relative mt-4 overflow-hidden rounded-2xl border border-neon/20 bg-gradient-to-r from-neon/[0.11] via-ink-900 to-sky/[0.06] p-4 sm:mt-6 sm:rounded-[1.75rem] sm:p-6">
              <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-neon/15 blur-[5.625rem]" />
              <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-neon/30 bg-neon/10 text-neon sm:h-11 sm:w-11">
                    <Lock className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      {likesYouCount} {likesYouCount === 1 ? 'person is' : 'people are'} waiting
                      behind the blur.
                    </h2>
                    <p className="mt-1 max-w-lg text-[0.6875rem] leading-relaxed text-ink-300">
                      HobyMine Plus reveals every like, including Super Likes, with clear photos
                      and full profiles. Until then, free accounts see the teaser grid below.
                    </p>
                  </div>
                </div>
                <Link to="/plus" className="btn-primary w-full shrink-0 justify-center sm:w-auto">
                  <Zap className="h-4 w-4" />
                  Unlock with Plus
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </section>
          )}

          <div className="card-grid mt-4 gap-3 sm:mt-6 sm:gap-5">
            {likes.map((person) =>
              likesLimited ? (
                <article
                  key={person.id}
                  className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/70 shadow-float sm:rounded-3xl"
                >
                  <div className="force-dark relative aspect-[4/5] overflow-hidden">
                    {person.photos[0] ? (
                      <img
                        src={mediaUrl(person.photos[0]) ?? undefined}
                        alt=""
                        draggable={false}
                        className="h-full w-full scale-110 object-cover blur-[0.9375rem] saturate-[0.75]"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-ink-700 via-ink-800 to-ink-900" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-black/10" />
                    <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2 pt-5 sm:p-3 sm:pt-6">
                      <span className="inline-flex items-center gap-1 rounded-full border border-neon/30 bg-black/45 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-neon backdrop-blur-md sm:px-2 sm:py-1 sm:text-[0.5625rem]">
                        <Heart className="h-2 w-2 fill-neon sm:h-2.5 sm:w-2.5" />
                        Likes you
                      </span>
                      <span className="hidden rounded-full border border-neon/25 bg-black/45 px-2 py-1 text-[0.5rem] font-bold uppercase tracking-wider text-neon backdrop-blur-md sm:inline">
                        Plus
                      </span>
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 sm:gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-neon/30 bg-ink-950/65 text-neon backdrop-blur sm:h-16 sm:w-16 sm:rounded-2xl">
                        <Lock className="h-5 w-5 sm:h-7 sm:w-7" />
                      </span>
                      <span className="text-[0.5rem] font-bold uppercase tracking-[0.2em] text-neon-soft sm:text-[0.625rem] sm:tracking-[0.24em]">
                        Hidden admirer
                      </span>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 z-10 p-2.5 text-center sm:p-4">
                      <p className="text-xs font-semibold text-white sm:text-sm">
                        {person.age} · Someone nearby
                      </p>
                      <p className="mt-1 text-[0.5625rem] text-ink-300 sm:text-[0.625rem]">
                        {person.sharedInterests.length > 0
                          ? `${person.sharedInterests.length} shared ${person.sharedInterests.length === 1 ? 'interest' : 'interests'}`
                          : 'Unlock to see their full profile'}
                      </p>
                    </div>
                  </div>
                  <div className="p-2 sm:p-3">
                    <Link
                      to="/plus"
                      className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-neon/25 bg-neon/10 text-[0.625rem] font-bold text-neon transition hover:bg-neon/15 sm:h-12 sm:gap-2 sm:text-xs"
                    >
                      <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span className="sm:hidden">Reveal likes</span>
                      <span className="hidden sm:inline">Reveal with HobyMine Plus</span>
                    </Link>
                  </div>
                </article>
              ) : (
                <article
                  key={person.id}
                  className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/70 shadow-float sm:rounded-3xl"
                >
                  <div className="force-dark relative aspect-[4/5] overflow-hidden">
                    <PhotoCarousel photos={person.photos} name={person.name} id={person.id} />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-card-fade" />

                    <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2 pt-5 sm:p-3 sm:pt-6">
                      <span className="inline-flex items-center gap-1 rounded-full border border-neon/30 bg-black/40 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-neon backdrop-blur-md sm:px-2 sm:py-1 sm:text-[0.5625rem]">
                        <Heart className="h-2 w-2 fill-neon sm:h-2.5 sm:w-2.5" />
                        Likes you
                      </span>
                      <div className="flex items-center gap-1.5">
                        {person.verified && (
                          <span className="rounded-full border border-sky/30 bg-black/40 px-1.5 py-0.5 text-sky backdrop-blur-md sm:px-2 sm:py-1">
                            <VerifiedBadge size="sm" />
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => viewProfile(person)}
                          disabled={busyId === person.id}
                          className="relative z-30 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-ink-950/55 text-white/80 shadow-float backdrop-blur transition hover:border-neon/40 hover:text-white active:scale-95 disabled:opacity-40 sm:h-9 sm:w-9"
                          aria-label={`View ${person.name}'s full profile`}
                          title="View Full Profile"
                        >
                          <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 z-10 p-2.5 sm:p-4">
                      <div className="flex items-end gap-1.5 sm:gap-2">
                        <h2 className="truncate text-lg font-black leading-none tracking-[-0.03em] text-white sm:text-2xl">
                          {person.name.split(' ')[0]}
                        </h2>
                        <span className="pb-0.5 text-sm font-light text-white/85 sm:text-lg">
                          {person.age}
                        </span>
                        {person.plus && (
                          <span className="mb-0.5 hidden rounded bg-neon/15 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-neon sm:inline">
                            Plus
                          </span>
                        )}
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-[0.5625rem] text-white/75 sm:mt-1.5 sm:gap-x-2 sm:text-[0.65625rem]">
                        <span className="hidden truncate sm:inline">
                          {person.job || 'Here for good conversation'}
                        </span>
                        <span className="hidden text-white/30 sm:inline">•</span>
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <MapPin className="h-2.5 w-2.5 shrink-0 text-neon-soft" />
                          <span className="truncate">{distanceLabel(person.distanceKm)}</span>
                        </span>
                      </p>
                      {person.sharedInterests.length > 0 && (
                        <p className="mt-1.5 flex flex-wrap gap-1 sm:mt-2">
                          {person.sharedInterests.slice(0, 3).map((interest, index) => (
                            <span
                              key={interest}
                              className={cn(
                                'rounded-full border border-neon/25 bg-black/35 px-1.5 py-0.5 text-[0.5rem] font-medium text-neon-soft backdrop-blur sm:px-2 sm:text-[0.5625rem]',
                                index > 0 && 'hidden sm:inline',
                              )}
                            >
                              {interestEmoji(interest)} {interest}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-1.5 p-2 sm:grid-cols-[52px_minmax(0,1fr)] sm:gap-2 sm:p-3">
                    <button
                      type="button"
                      onClick={() => void act(person, 'pass')}
                      disabled={busyId === person.id}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-ink-300 transition hover:border-rose/40 hover:bg-rose/10 hover:text-rose active:scale-95 disabled:opacity-40 sm:h-12 sm:w-12"
                      aria-label={`Pass on ${person.name}`}
                    >
                      <X className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void act(person, 'like')}
                      disabled={busyId === person.id}
                      className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-neon-gradient text-[0.625rem] font-bold text-ink-950 shadow-glow-sm transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50 sm:h-12 sm:gap-2 sm:text-xs"
                    >
                      <Heart className="h-3.5 w-3.5 fill-ink-950 sm:h-4 sm:w-4" />
                      {busyId === person.id ? 'Sending…' : 'Like back'}
                    </button>
                  </div>
                </article>
              ),
            )}
          </div>
        </>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[0.625rem] text-ink-500 sm:mt-7">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3 text-sky" />
          Only visible to you
        </span>
        <span className="flex items-center gap-1.5">
          <Star className="h-3 w-3 text-neon" />
          Super Likes are included
        </span>
        <Link to="/plus" className="flex items-center gap-1.5 transition hover:text-neon">
          <Sparkles className="h-3 w-3 text-neon" />
          {likesLimited ? 'Unlock Plus' : 'Manage Plus'}
        </Link>
      </div>

      <ProfileSheet
        user={profileViewer.profile}
        onClose={profileViewer.closeProfile}
        photoClassName="h-[min(45dvh,22.5rem)] min-h-[12rem] w-full"
        afterInterests={
          profileViewer.profile ? (
            <div className="border-t border-white/[0.06] pt-4">
              <p className="mb-2 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-ink-500">
                Safety
              </p>
              <SafetyActions
                target={{
                  id: profileViewer.profile.id,
                  name: profileViewer.profile.name,
                }}
                onAct={profileViewer.closeProfile}
              />
            </div>
          ) : null
        }
      />
    </div>
  );
}

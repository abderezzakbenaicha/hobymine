import {
  ArrowRight,
  Lock,
  MapPin,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState } from '../components/EmptyState';
import { FilterSheet } from '../components/FilterSheet';
import { LocationModeToggle, type LocationMode } from '../components/LocationModeToggle';
import { Skeleton } from '../components/Spinner';
import { StoriesRail } from '../components/StoriesRail';
import { SwipeDeck } from '../components/SwipeDeck';
import { api, ApiClientError } from '../lib/api';
import { detectLocation } from '../lib/location';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import type {
  DiscoveryResponse,
  LikeAllowance,
  MeUser,
  PublicUser,
  SwipeAction,
  SwipeResponse,
} from '../types';

function mergeUnique(current: PublicUser[], incoming: PublicUser[]): PublicUser[] {
  const seen = new Set(current.map((user) => user.id));
  return [...current, ...incoming.filter((user) => !seen.has(user.id))];
}

export function DiscoverPage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const bumpLikes = useChatStore((state) => state.bumpLikes);
  const applySwipeResult = useChatStore((state) => state.applySwipeResult);
  const showMatch = useUiStore((state) => state.showMatch);
  const openPaywall = useUiStore((state) => state.openPaywall);

  const [candidates, setCandidates] = useState<PublicUser[]>([]);
  const [likeAllowance, setLikeAllowance] = useState<LikeAllowance | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [history, setHistory] = useState<{ user: PublicUser; action: SwipeAction }[]>([]);
  const locationMode: LocationMode = user?.preferences.locationMode ?? 'global';
  const verified = Boolean(user?.verified);

  const load = useCallback(
    async (replace = false) => {
      // Discovery is a verified-only surface. Skip the request entirely while
      // the profile is unverified; the API would reject it with a 403 anyway.
      if (!verified) {
        setLoading(false);
        return;
      }
      if (replace) setLoading(true);
      setError(null);
      try {
        const data = await api.get<DiscoveryResponse>('/api/discovery');
        setCandidates((current) =>
          replace ? data.candidates : mergeUnique(current, data.candidates),
        );
        setLikeAllowance(data.likeAllowance);
        bumpLikes(data.likesYouCount);
      } catch (loadError) {
        setError(
          loadError instanceof ApiClientError
            ? loadError.message
            : 'Could not load your discovery deck.',
        );
      } finally {
        if (replace) setLoading(false);
      }
    },
    [bumpLikes, verified],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  const handleSwipe = (target: PublicUser, action: SwipeAction): void => {
    if (busy) return;

    // Stop before the optimistic card exit when the daily free budget is
    // already spent. Passing still works, so the deck never gets stuck.
    if (
      action !== 'pass' &&
      user &&
      !user.plus &&
      likeAllowance &&
      !likeAllowance.unlimited &&
      likeAllowance.remaining <= 0
    ) {
      openPaywall({
        reason: 'like_limit',
        limit: likeAllowance.limit,
        used: likeAllowance.used,
        resetsAt: likeAllowance.resetsAt,
      });
      return;
    }

    setBusy(true);
    setCandidates((current) => current.filter((candidate) => candidate.id !== target.id));
    setHistory((current) => [...current.slice(-9), { user: target, action }]);

    void api
      .post<SwipeResponse>('/api/swipes', { targetId: target.id, action })
      .then((result) => {
        applySwipeResult(result);
        if (result.likeAllowance) setLikeAllowance(result.likeAllowance);
        if (result.match) {
          showMatch(result.match);
          setHistory([]);
        }
        void load(false);
      })
      .catch((swipeError) => {
        setCandidates((current) => [target, ...current]);
        setHistory((current) => current.filter((entry) => entry.user.id !== target.id));
        if (swipeError instanceof ApiClientError && swipeError.code === 'like_limit') {
          const details = (swipeError.details ?? {}) as Partial<LikeAllowance>;
          setLikeAllowance((current) =>
            current
              ? {
                  ...current,
                  ...details,
                  remaining: 0,
                }
              : current,
          );
          openPaywall({
            reason: 'like_limit',
            limit: details.limit ?? 30,
            used: details.used ?? 30,
            resetsAt: details.resetsAt,
          });
          return;
        }
        toast.error(
          swipeError instanceof ApiClientError
            ? swipeError.message
            : 'That swipe did not go through. Try again.',
        );
      })
      .finally(() => setBusy(false));
  };

  const rewind = async (): Promise<void> => {
    if (!user?.plus) {
      openPaywall({ reason: 'rewind' });
      return;
    }
    const last = history[history.length - 1];
    if (!last || busy) return;
    setBusy(true);
    setHistory((current) => current.slice(0, -1));
    setCandidates((current) => [last.user, ...current]);
    try {
      await api.delete(`/api/swipes/${last.user.id}`);
      toast.success('Rewound your last swipe');
    } catch (rewindError) {
      setCandidates((current) => current.filter((candidate) => candidate.id !== last.user.id));
      if (rewindError instanceof ApiClientError && rewindError.code === 'plus_required') {
        openPaywall({ reason: 'rewind' });
        return;
      }
      toast.error(
        rewindError instanceof ApiClientError
          ? rewindError.message
          : 'You can’t rewind this swipe.',
      );
    } finally {
      setBusy(false);
    }
  };

  const setLocationMode = async (mode: LocationMode): Promise<void> => {
    if (mode === locationMode) return;
    try {
      const data = await api.patch<{ user: MeUser }>('/api/me/preferences', {
        locationMode: mode,
      });
      setUser(data.user);
      setCandidates([]);
      void load(true);
      toast.success(
        mode === 'nearby' ? 'Showing people near you' : 'Showing people around the world',
      );
    } catch (modeError) {
      toast.error(
        modeError instanceof ApiClientError
          ? modeError.message
          : 'Could not change the location mode',
      );
    }
  };

  const useMyLocation = async (): Promise<void> => {
    if (locating) return;
    setLocating(true);
    try {
      const detected = await detectLocation();
      if (!detected) {
        toast.error('Could not read your location', {
          description: 'Allow location access, or pick a country in the filters.',
        });
        return;
      }
      const data = await api.put<{ user: MeUser }>('/api/me/location', {
        latitude: detected.latitude,
        longitude: detected.longitude,
        city: detected.city ?? undefined,
        countryCode: detected.countryCode ?? undefined,
      });
      setUser(data.user);
      setCandidates([]);
      void load(true);
      toast.success('Location updated', {
        description: detected.city
          ? `Showing people near ${detected.city}.`
          : 'Showing people near you.',
      });
    } catch (locationError) {
      toast.error(
        locationError instanceof ApiClientError
          ? locationError.message
          : 'Could not save your location',
      );
    } finally {
      setLocating(false);
    }
  };

  if (!verified) {
    return (
      <div className="animate-slide-up mx-auto flex min-h-full w-full max-w-lg flex-col items-center justify-center px-2 py-10 text-center lg:py-16">
        <div className="relative">
          <span className="absolute inset-0 animate-pulse-ring rounded-full border border-neon/25" />
          <span className="relative grid h-20 w-20 place-items-center rounded-[1.75rem] border border-neon/25 bg-neon/[0.08] text-neon">
            <ShieldCheck className="h-9 w-9" />
          </span>
        </div>
        <p className="mt-6 text-[0.625rem] font-bold uppercase tracking-[0.28em] text-neon">
          Verified members only
        </p>
        <h1 className="mt-2 max-w-sm text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
          Verify your profile to start discovering
        </h1>
        <p className="mt-3 max-w-sm text-xs leading-relaxed text-ink-400">
          HobyMine is a verified-only community. A quick selfie check keeps bots and fake
          profiles out of your deck — and unlocks messaging too.
        </p>

        <Link to="/verify" className="btn-primary mt-6 w-full max-w-xs">
          <ShieldCheck className="h-4 w-4" />
          Verify my profile
        </Link>
        <p className="mt-3 text-[0.625rem] text-ink-500">
          Free, instant in this demo, and never shown to other members.
        </p>

        <div className="mt-8 grid w-full max-w-sm gap-2 text-left">
          {[
            'Real people only in your deck',
            'Unlock messaging and calls',
            'A verified badge on your profile',
          ].map((benefit) => (
            <div
              key={benefit}
              className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5"
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-neon" />
              <span className="text-[0.6875rem] text-ink-300">{benefit}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-slide-up max-lg:flex max-lg:min-h-full max-lg:flex-1 max-lg:flex-col">
      <div className="flex items-center justify-between gap-1.5 sm:items-end sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="hidden items-center gap-2 text-[0.625rem] font-bold uppercase tracking-[0.28em] text-neon-soft sm:flex">
            <span className="h-1 w-1 rounded-full bg-neon shadow-glow-sm" aria-hidden="true" />
            Discover
          </p>
          <h1 className="truncate text-lg font-black tracking-[-0.045em] sm:mt-2 sm:text-[2rem] sm:leading-tight">
            <span className="sm:hidden text-white">Discover</span>
            <span className="hidden bg-gradient-to-r from-white via-white to-white/55 bg-clip-text text-transparent sm:inline">
              Find your frequency.
            </span>
          </h1>
          {(loading || locationMode === 'nearby') && (
            <p className="mt-0.5 flex min-w-0 items-center gap-x-2 text-[0.625rem] text-ink-400 sm:mt-2 sm:text-xs">
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full bg-neon shadow-glow-sm',
                  loading && 'animate-pulse',
                )}
              />
              <span className="truncate">
                {loading
                  ? 'Finding people nearby…'
                  : `Near ${user?.locationCity || user?.countryName || 'you'}`}
              </span>
            </p>
          )}
        </div>
        <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
          <LocationModeToggle
            mode={locationMode}
            onChange={(mode) => void setLocationMode(mode)}
            className="min-w-0 shrink"
            compact
          />
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="group flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.09] bg-gradient-to-b from-white/[0.07] to-white/[0.01] text-ink-200 shadow-float backdrop-blur-md transition hover:border-neon/30 hover:text-white sm:h-auto sm:w-auto sm:gap-2 sm:px-4 sm:py-2.5 sm:text-xs"
            aria-label="Open discovery filters"
          >
            <SlidersHorizontal className="h-4 w-4 text-ink-300 transition group-hover:text-neon" />
            <span className="hidden text-[0.6875rem] font-semibold tracking-[-0.01em] sm:inline sm:text-xs">
              Filters
            </span>
          </button>
        </div>
      </div>

      {(Boolean(!user?.plus && likeAllowance && likeAllowance.remaining === 0) ||
        locationMode === 'nearby') && (
        <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5 sm:mt-3 sm:flex-wrap sm:overflow-visible">
          {!user?.plus && likeAllowance && likeAllowance.remaining === 0 && (
            <button
              type="button"
              onClick={() =>
                openPaywall({
                  reason: 'like_limit',
                  limit: likeAllowance.limit,
                  used: likeAllowance.used,
                  resetsAt: likeAllowance.resetsAt,
                })
              }
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neon/25 bg-neon/[0.09] px-3 py-1 text-[0.625rem] font-semibold text-neon-soft backdrop-blur-md transition hover:border-neon/45 hover:bg-neon/[0.16]"
            >
              <Lock className="h-3 w-3 shrink-0" />
              Daily limit reached
              <span className="text-ink-300">· Get Plus</span>
            </button>
          )}

          {locationMode === 'nearby' && (
            <button
              type="button"
              onClick={() => void useMyLocation()}
              disabled={locating}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sky/20 bg-sky/[0.06] px-3 py-1 text-[0.625rem] font-semibold text-ink-200 backdrop-blur-md transition hover:border-sky/40 hover:text-white disabled:opacity-50"
              title={
                user?.locationCity
                  ? `People within ${user.preferences.maxDistance} km of ${user.locationCity}`
                  : 'Nearby mode is on. Tap to share your location.'
              }
            >
              <MapPin className="h-3 w-3 shrink-0 text-sky" />
              {locating
                ? 'Locating…'
                : user?.locationCity
                  ? `Near ${user.locationCity}`
                  : 'Nearby'}
              <span className="text-sky">· Use location</span>
            </button>
          )}
        </div>
      )}

      {/* Private stories rail, directly under the Discover header. */}
      <StoriesRail />

      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2 sm:mt-3 sm:gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-6">
        <div className="relative mx-auto flex w-full max-w-[26.875rem] flex-col max-lg:min-h-0 max-lg:flex-1">
          <div
            className="pointer-events-none absolute inset-x-0 top-6 bottom-24 rounded-[3.5rem] bg-[radial-gradient(65%_55%_at_50%_45%,rgba(236,19,80,0.16),rgba(167,139,250,0.08)_55%,transparent_78%)] blur-2xl"
            aria-hidden="true"
          />
          {loading ? (
            <div className="flex h-full min-h-0 flex-col">
              <Skeleton className="swipe-stage w-full flex-1 rounded-[1.75rem] sm:rounded-[2.25rem] lg:h-[min(72vh,700px)] lg:flex-none" />
              <div className="mt-5 flex shrink-0 items-center justify-center gap-3 pb-1 sm:mt-6 sm:gap-5 sm:pb-2">
                <Skeleton className="h-12 w-12 rounded-full sm:h-14 sm:w-14" />
                <Skeleton className="h-16 w-16 rounded-full sm:h-[4.25rem] sm:w-[4.25rem]" />
                <Skeleton className="h-10 w-10 rounded-full sm:h-11 sm:w-11" />
              </div>
            </div>
          ) : error ? (
            <EmptyState
              icon={RefreshCw}
              title="The deck didn’t load"
              description={error}
              action={
                <button type="button" className="btn-primary" onClick={() => void load(true)}>
                  <RefreshCw className="h-4 w-4" />
                  Try again
                </button>
              }
            />
          ) : (
            <>
              <SwipeDeck
                candidates={candidates}
                onSwipe={handleSwipe}
                onRewind={() => void rewind()}
                canRewind={history.length > 0}
                rewindLocked={!user?.plus}
                busy={busy}
              />

              {candidates.length === 0 && (
                <>
                  <p className="mt-4 text-center text-[0.6875rem] leading-relaxed text-ink-500">
                    HobyMine only shows real people — no bots, no filler. Widen your
                    filters or check back when more people join.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2.5 pb-2 sm:gap-3 sm:pb-3">
                    <button
                      type="button"
                      className="btn-ghost min-h-[2.625rem] px-3 py-2.5 text-xs"
                      onClick={() => setFilterOpen(true)}
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      Widen filters
                    </button>
                    <button
                      type="button"
                      className="btn-primary min-h-[2.625rem] px-3 py-2.5 text-xs"
                      onClick={() => void load(true)}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Refresh deck
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          <p className="mt-5 hidden text-center text-[0.625rem] text-ink-600 lg:block">
            Swipe right to like · left to pass · up to Super Like
          </p>
        </div>

        <aside className="hidden space-y-4 xl:block">
          <Link
            to="/profile"
            className="group relative block overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-ink-850/90 via-ink-900/85 to-ink-900/90 p-5 shadow-float backdrop-blur-sm transition hover:border-neon/25"
          >
            <span
              className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-neon/15 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-[-0.01em] text-white">Your activity</h2>
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.05]">
                <ArrowRight className="h-3.5 w-3.5 text-neon transition group-hover:translate-x-0.5" />
              </span>
            </div>
            <p className="relative mt-2 text-[0.6875rem] leading-relaxed text-ink-400">
              Likes, matches and unread chats now live on your Profile.
            </p>
            <span className="relative mt-3 inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-neon-soft">
              Open your activity
            </span>
          </Link>

          <div className="rounded-3xl border border-white/[0.07] bg-gradient-to-b from-ink-850/70 to-ink-900/80 p-5 shadow-float backdrop-blur-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-[-0.01em] text-white">
              <Sparkles className="h-4 w-4 text-sky" />
              Make your first move
            </h3>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-400">
              Matches with a first message get 3× more replies. Keep it specific — mention
              something from their profile.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['Their last photo', 'A shared interest', 'A tiny dare'].map((tip) => (
                <span
                  key={tip}
                  className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[0.625rem] text-ink-300 backdrop-blur-md"
                >
                  {tip}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-3xl border border-sky/15 bg-gradient-to-br from-sky/[0.08] to-sky/[0.02] p-4 backdrop-blur-sm">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky/20 bg-sky/10">
              <ShieldCheck className="h-4 w-4 text-sky" />
            </span>
            <div>
              <p className="text-xs font-semibold text-white">Your safety comes first</p>
              <Link
                to="/safety"
                className="mt-0.5 inline-flex items-center gap-1 text-[0.6875rem] text-sky hover:underline"
              >
                Review safety tools <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </aside>
      </div>

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        onSaved={() => void load(true)}
      />
    </div>
  );
}

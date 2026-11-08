import {
  ArrowRight,
  BadgeCheck,
  Check,
  Crown,
  Eye,
  Heart,
  Loader2,
  Lock,
  MailCheck,
  Rocket,
  Sparkles,
  Star,
  Video,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Modal } from '../components/Modal';
import { Switch } from '../components/Switch';
import { api, ApiClientError } from '../lib/api';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import type { MeUser } from '../types';

type Plan = 'weekly' | 'monthly' | 'yearly';

interface PlanOption {
  label: string;
  price: string;
  cadence: string;
  note: string;
  badge?: string;
}

const FALLBACK_PLANS: Record<Plan, PlanOption> = {
  weekly: {
    label: 'Weekly',
    price: '$1.99',
    cadence: 'per week',
    note: 'Billed weekly · Cancel anytime',
  },
  monthly: {
    label: 'Monthly',
    price: '$6.99',
    cadence: 'per month',
    note: 'Cancel anytime',
  },
  yearly: {
    label: 'Yearly',
    price: '$39.99',
    cadence: 'per year',
    note: 'Save 52% · $3.33/mo',
    badge: 'Save 52%',
  },
};

const formatPrice = (amount: number, currency: string): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount / 100);

const BENEFITS = [
  {
    icon: Heart,
    title: 'See who likes you',
    text: 'Open your likes grid and decide who gets a yes — no more guessing from a blurred count.',
  },
  {
    icon: Eye,
    title: 'See who viewed you',
    text: 'Unblur every profile visitor and open their full profile straight from the profile views tab.',
  },
  {
    icon: Zap,
    title: 'Unlimited likes',
    text: 'Free members get 15 likes a day. Plus members can keep swiping and rewind any accidental pass.',
  },
  {
    icon: Video,
    title: 'Unlimited video calls',
    text: 'Free members get a one-time 60-second video trial. Plus members can video call for as long as they like.',
  },
  {
    icon: Rocket,
    title: '30-minute profile boost',
    text: 'Jump to the front of discovery whenever you want a little more attention.',
  },
  {
    icon: MailCheck,
    title: 'Read receipts',
    text: 'Know the moment someone opens your message — and turn the feature off whenever you like.',
  },
  {
    icon: Star,
    title: 'Plus profile badge',
    text: 'A subtle status signal on your profile and in every deck you appear in.',
  },
];

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function PlusPage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const likesYouCount = useChatStore((state) => state.likesYouCount);
  const loadLikes = useChatStore((state) => state.loadLikes);

  const [plan, setPlan] = useState<Plan>('yearly');
  const [plans, setPlans] = useState<Record<Plan, PlanOption>>(FALLBACK_PLANS);
  const [subscribing, setSubscribing] = useState(false);
  const [updating, setUpdating] = useState<'receipts' | 'boost' | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<{ plans: { id: Plan; label: string; amount: number; currency: string; cadence: string; note: string; savingPercent: number }[] }>(
        '/api/plus/plans',
      )
      .then((data) => {
        if (cancelled) return;
        setPlans((current) => {
          const next = { ...current };
          for (const option of data.plans) {
            if (option.id !== 'weekly' && option.id !== 'monthly' && option.id !== 'yearly') continue;
            next[option.id] = {
              label: option.label,
              price: formatPrice(option.amount, option.currency),
              cadence: option.cadence,
              note: option.note,
              badge: option.savingPercent > 0 ? `Save ${option.savingPercent}%` : undefined,
            };
          }
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const boostRemaining = useMemo(() => {
    if (!user?.boostActive || !user.boostUntil) return null;
    const minutes = Math.max(
      0,
      Math.round((new Date(user.boostUntil).getTime() - Date.now()) / 60_000),
    );
    return minutes;
  }, [user?.boostActive, user?.boostUntil]);

  if (!user) return null;

  const subscribe = async (): Promise<void> => {
    if (subscribing) return;
    setSubscribing(true);
    try {
      const data = await api.post<{ user: MeUser }>('/api/plus/subscribe', { plan });
      setUser(data.user);
      void loadLikes(true).catch(() => undefined);
      setSuccessOpen(true);
      toast.success('Welcome to HobyMine Plus');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not start membership');
    } finally {
      setSubscribing(false);
    }
  };

  const toggleReceipts = async (enabled: boolean): Promise<void> => {
    setUpdating('receipts');
    try {
      const data = await api.patch<{ user: MeUser }>('/api/plus/read-receipts', { enabled });
      setUser(data.user);
      toast.success(enabled ? 'Read receipts on' : 'Read receipts off');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not update receipts');
    } finally {
      setUpdating(null);
    }
  };

  const toggleBoost = async (): Promise<void> => {
    setUpdating('boost');
    try {
      const data = await api.post<{ user: MeUser }>('/api/plus/boost', {
        enabled: !user.boostActive,
      });
      setUser(data.user);
      toast.success(
        user.boostActive
          ? 'Boost paused'
          : 'Boost is live for 30 minutes — you’re at the front of the deck.',
      );
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not update boost');
    } finally {
      setUpdating(null);
    }
  };

  const cancel = async (): Promise<void> => {
    setCancelling(true);
    try {
      const data = await api.post<{ user: MeUser }>('/api/plus/cancel');
      setUser(data.user);
      void loadLikes(true).catch(() => undefined);
      setCancelOpen(false);
      toast.success('Membership cancelled', {
        description: 'Read receipts and boost are now locked again.',
      });
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not cancel membership');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="animate-slide-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[0.625rem] font-bold uppercase tracking-[0.28em] text-neon">
            <Sparkles className="h-3 w-3" />
            HobyMine Plus
          </p>
          <h1 className="mt-2 text-[1.75rem] font-black tracking-[-0.04em] text-white sm:text-3xl">
            {user.plus ? 'You’re in the inner circle.' : 'A little more signal. A lot more matches.'}
          </h1>
          <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-ink-400">
            {user.plus
              ? 'Your Plus tools are live. Manage receipts, run a boost, or browse everyone who already likes you.'
              : 'Unlock the parts of HobyMine that move things along: see your admirers, jump the queue, and know when you’ve been read.'}
          </p>
        </div>
        {user.plus && (
          <span className="inline-flex items-center gap-2 rounded-full border border-neon/30 bg-neon/10 px-3 py-1.5 text-[0.625rem] font-bold uppercase tracking-wider text-neon">
            <Crown className="h-3.5 w-3.5" />
            Active until {formatDate(user.plusUntil)}
          </span>
        )}
      </div>

      {user.plus ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <section className="relative overflow-hidden rounded-[1.75rem] border border-neon/25 bg-gradient-to-br from-neon/[0.14] via-ink-900 to-sky/[0.08] p-6 shadow-glow-sm sm:p-8">
              <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-neon/15 blur-[5rem]" />
              <div className="relative flex flex-wrap items-start justify-between gap-5">
                <div>
                  <div className="flex items-center gap-2 text-[0.625rem] font-bold uppercase tracking-[0.2em] text-neon">
                    <Crown className="h-4 w-4" />
                    Plus member
                  </div>
                  <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">
                    {user.name.split(' ')[0]}, you have the edge.
                  </h2>
                  <p className="mt-2 max-w-md text-xs leading-relaxed text-ink-300">
                    Your membership renews on {formatDate(user.plusUntil)}. Demo billing — no card
                    is ever charged.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.625rem] font-semibold text-ink-200">
                      See likes
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.625rem] font-semibold text-ink-200">
                      Read receipts
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.625rem] font-semibold text-ink-200">
                      Profile boost
                    </span>
                  </div>
                </div>
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-neon/30 bg-white/[0.06] text-neon shadow-glow-sm backdrop-blur">
                  <Zap className="h-9 w-9 fill-neon/20" />
                </div>
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <Link
                to="/likes"
                className="group relative overflow-hidden rounded-3xl border border-neon/20 bg-gradient-to-br from-neon/[0.09] to-ink-900 p-5 transition hover:border-neon/40"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neon/15 text-neon">
                    <Heart className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-neon transition group-hover:translate-x-0.5" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-white">People who like you</h3>
                <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-400">
                  {likesYouCount > 0
                    ? `${likesYouCount} ${likesYouCount === 1 ? 'person is' : 'people are'} already interested.`
                    : 'Your admirers will show up here.'}
                </p>
              </Link>

              <div className="rounded-3xl border border-white/[0.06] bg-ink-900/70 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky/10 text-sky">
                    <Eye className="h-5 w-5" />
                  </div>
                  <Switch
                    checked={user.readReceipts}
                    onChange={(value) => void toggleReceipts(value)}
                    disabled={updating === 'receipts'}
                    label="Read receipts"
                  />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-white">Read receipts</h3>
                <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-400">
                  {user.readReceipts
                    ? 'On — blue double checks tell you when your message lands.'
                    : 'Off — your messages show a single check even after they’re read.'}
                </p>
              </div>
            </div>

            <section className="panel p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition',
                      user.boostActive ? 'bg-neon/15 text-neon shadow-glow-sm' : 'bg-white/[0.04] text-ink-300',
                    )}
                  >
                    <Rocket className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {user.boostActive ? 'Boost is running' : 'Profile boost'}
                    </h3>
                    <p className="mt-1 max-w-md text-[0.6875rem] leading-relaxed text-ink-400">
                      {user.boostActive
                        ? `You’re at the front of the deck${boostRemaining !== null ? ` for about ${boostRemaining} more minutes` : ''}.`
                        : 'Put yourself at the front of discovery for 30 minutes. Great for a Friday night.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleBoost()}
                  disabled={updating === 'boost'}
                  className={cn('min-w-[8.25rem]', user.boostActive ? 'btn-ghost' : 'btn-primary')}
                >
                  {updating === 'boost' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  {user.boostActive ? 'Pause boost' : 'Boost me'}
                </button>
              </div>
            </section>

            <section className="panel p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-white">Everything in Plus</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {BENEFITS.map((benefit) => (
                  <div key={benefit.title} className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neon/10 text-neon">
                      <benefit.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-white">{benefit.title}</p>
                      <p className="mt-0.5 text-[0.65625rem] leading-relaxed text-ink-400">
                        {benefit.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <div className="panel p-5">
              <h2 className="text-sm font-semibold text-white">Membership</h2>
              <dl className="mt-4 space-y-3 text-[0.6875rem]">
                <div className="flex items-center justify-between">
                  <dt className="text-ink-400">Status</dt>
                  <dd className="font-semibold text-neon">Active</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-ink-400">Renews</dt>
                  <dd className="font-semibold text-white">{formatDate(user.plusUntil)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-ink-400">Read receipts</dt>
                  <dd className="font-semibold text-white">{user.readReceipts ? 'On' : 'Off'}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-ink-400">Boost</dt>
                  <dd className="font-semibold text-white">{user.boostActive ? 'Live' : 'Ready'}</dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                className="mt-5 w-full rounded-xl border border-white/[0.06] px-4 py-2.5 text-[0.6875rem] font-semibold text-ink-400 transition hover:border-rose/25 hover:text-rose"
              >
                Cancel membership
              </button>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-white">
                <BadgeCheck className="h-3.5 w-3.5 text-sky" />
                Demo billing
              </h3>
              <p className="mt-1.5 text-[0.65625rem] leading-relaxed text-ink-400">
                This project simulates checkout. No payment details are requested, stored, or
                charged. Swap the demo handler for Stripe or RevenueCat in production.
              </p>
            </div>

            <Link
              to="/discover"
              className="btn-ghost w-full text-xs"
            >
              <Sparkles className="h-4 w-4 text-neon" />
              Back to discovery
            </Link>
          </aside>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <section className="relative overflow-hidden rounded-[1.75rem] border border-neon/25 bg-gradient-to-br from-neon/[0.12] via-ink-900 to-sky/[0.07] p-6 sm:p-8">
              <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-neon/15 blur-[5.625rem]" />
              <div className="relative">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-neon/30 bg-white/[0.06] px-2.5 py-1 text-[0.5625rem] font-bold uppercase tracking-[0.18em] text-neon">
                  <Crown className="h-3 w-3" />
                  Most popular
                </span>
                <h2 className="mt-4 max-w-lg text-4xl font-black leading-[0.95] tracking-[-0.05em] text-white sm:text-5xl">
                  Make the
                  <span className="bg-neon-gradient bg-clip-text text-transparent"> first move </span>
                  easier.
                </h2>
                <p className="mt-4 max-w-lg text-xs leading-relaxed text-ink-300">
                  {likesYouCount > 0
                    ? `${likesYouCount} ${likesYouCount === 1 ? 'person has' : 'people have'} already liked you. Plus lets you see exactly who — and do something about it.`
                    : 'Plus reveals the people who already like you, boosts your profile to the front of the deck, and unlocks read receipts.'}
                </p>

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {(Object.keys(plans) as Plan[]).map((key) => {
                    const option = plans[key];
                    const active = plan === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPlan(key)}
                        className={cn(
                          'relative rounded-2xl border p-4 text-left transition',
                          active
                            ? 'border-neon/50 bg-neon/[0.08] shadow-glow-sm'
                            : 'border-white/10 bg-white/[0.02] hover:border-white/20',
                        )}
                      >
                        {option.badge && (
                          <span className="absolute right-3 top-3 rounded-full bg-neon px-2 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-ink-950">
                            {option.badge}
                          </span>
                        )}
                        <p className="text-[0.625rem] font-bold uppercase tracking-wider text-ink-400">
                          {option.label}
                        </p>
                        <p className="mt-2 text-2xl font-black text-white">{option.price}</p>
                        <p className="text-[0.625rem] text-ink-400">{option.cadence}</p>
                        <p className={cn('mt-1 text-[0.625rem]', active ? 'text-neon' : 'text-ink-500')}>
                          {option.note}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => void subscribe()}
                  disabled={subscribing}
                  className="btn-primary mt-4 w-full sm:w-auto sm:min-w-[17.5rem]"
                >
                  {subscribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Crown className="h-4 w-4" />
                  )}
                  {subscribing ? 'Activating…' : `Get Plus — ${plans[plan].price}`}
                </button>
                <p className="mt-3 flex items-center gap-1.5 text-[0.625rem] text-ink-500">
                  <Lock className="h-3 w-3" />
                  Demo checkout · no card required · cancel anytime
                </p>
              </div>
            </section>

            <section className="panel p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-white">What you unlock</h2>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {BENEFITS.map((benefit) => (
                  <div key={benefit.title} className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neon/10 text-neon">
                      <benefit.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-white">{benefit.title}</p>
                      <p className="mt-1 text-[0.65625rem] leading-relaxed text-ink-400">
                        {benefit.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-xs font-semibold text-white">Still deciding?</h3>
              <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-400">
                Your free account keeps working exactly as it does now. Plus is for people who
                want a shorter path from &ldquo;maybe&rdquo; to &ldquo;tonight&rdquo;.
              </p>
              <Link
                to="/discover"
                className="mt-3 inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-neon hover:underline"
              >
                Keep swiping free <ArrowRight className="h-3 w-3" />
              </Link>
            </section>
          </div>

          <aside className="space-y-4">
            <div className="panel p-5">
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-neon" />
                <h2 className="text-sm font-semibold text-white">Your selection</h2>
              </div>
              <div className="mt-4 space-y-3 text-[0.6875rem]">
                <div className="flex items-center justify-between">
                  <span className="text-ink-400">Plan</span>
                  <span className="font-semibold text-white">{plans[plan].label}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-400">Price</span>
                  <span className="font-semibold text-white">
                    {plans[plan].price}{' '}
                    <span className="text-[0.625rem] font-normal text-ink-500">
                      {plans[plan].cadence}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-400">Billing</span>
                  <span className="font-semibold text-white">Demo</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void subscribe()}
                disabled={subscribing}
                className="btn-primary mt-5 w-full"
              >
                {subscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Activate Plus
              </button>
            </div>

            <div className="rounded-2xl border border-neon/15 bg-neon/[0.04] p-4">
              <div className="flex items-start gap-2">
                <Heart className="mt-0.5 h-4 w-4 shrink-0 text-neon" />
                <div>
                  <p className="text-[0.6875rem] font-semibold text-white">
                    {likesYouCount > 0
                      ? `${likesYouCount} ${likesYouCount === 1 ? 'like is' : 'likes are'} waiting`
                      : 'Someone is waiting'}
                  </p>
                  <p className="mt-0.5 text-[0.625rem] leading-relaxed text-ink-400">
                    Plus members see every person who liked them, including Super Likes.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <h3 className="text-xs font-semibold text-white">Fine print, honestly</h3>
              <ul className="mt-2 space-y-2">
                {[
                  'Demo billing — nothing is charged.',
                  'Cancel turns tools off immediately.',
                  'No ads, no data sold, ever.',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-1.5 text-[0.65625rem] text-ink-400">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-neon" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <Link
              to="/profile"
              className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition hover:border-white/15"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.04]">
                <Star className="h-4 w-4 text-ink-400" />
              </div>
              <div>
                <p className="text-[0.6875rem] font-semibold text-white">Back to profile</p>
                <p className="text-[0.625rem] text-ink-400">Adjust your photos and details.</p>
              </div>
            </Link>
          </aside>
        </div>
      )}

      <Modal
        open={successOpen}
        onClose={() => setSuccessOpen(false)}
        title="You’re HobyMine Plus"
        description="Everything is unlocked. Here’s where to start."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center py-4">
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-neon/30 bg-neon/10 text-neon shadow-glow">
              <span className="absolute inset-0 animate-pulse-ring rounded-full border border-neon/40" />
              <Crown className="h-10 w-10" />
            </div>
          </div>
          <div className="space-y-2">
            {BENEFITS.map((benefit) => (
              <div key={benefit.title} className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3.5 py-2.5">
                <Check className="h-4 w-4 shrink-0 text-neon" />
                <span className="text-xs text-ink-200">{benefit.title}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setSuccessOpen(false)}
              className="btn-ghost flex-1"
            >
              <X className="h-4 w-4" />
              Later
            </button>
            <Link to="/likes" className="btn-primary flex-1" onClick={() => setSuccessOpen(false)}>
              <Heart className="h-4 w-4" />
              See my likes
            </Link>
          </div>
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel HobyMine Plus?"
        description="Your likes grid, read receipts and boost will lock immediately."
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-rose/20 bg-rose/[0.05] p-4 text-xs leading-relaxed text-ink-300">
            This demo does not charge you, so cancelling is instant and penalty-free. You can
            subscribe again at any time.
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCancelOpen(false)}
              className="btn-ghost flex-1"
            >
              Keep Plus
            </button>
            <button
              type="button"
              onClick={() => void cancel()}
              disabled={cancelling}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
              {cancelling ? 'Cancelling…' : 'Cancel membership'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

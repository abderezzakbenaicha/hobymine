import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Ban,
  Check,
  ChevronRight,
  Flag,
  HeartHandshake,
  Loader2,
  Lock,
  MapPin,
  MessageSquareWarning,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Spinner';
import { api, ApiClientError } from '../lib/api';
import { useAuthStore } from '../store/auth';
import type { PublicUser } from '../types';

const TIPS = [
  {
    icon: Users,
    title: 'Meet in public, first',
    text: 'Coffee, a gallery, a busy bar. Tell a friend where you’ll be and when you expect to be home.',
  },
  {
    icon: MessageSquareWarning,
    title: 'Keep the chat on HobyMine',
    text: 'Until you trust someone, don’t move to another app. Our reporting tools only work here.',
  },
  {
    icon: Lock,
    title: 'Protect the personal stuff',
    text: 'Never send money, share your address, or hand over identity documents — no matter the story.',
  },
  {
    icon: Phone,
    title: 'Have an exit plan',
    text: 'Arrange your own transport and keep your phone charged. Leaving early is always allowed.',
  },
];

const GUIDELINES = [
  {
    title: 'Be a person, not a pitch',
    text: 'No spam, crypto schemes, or unsolicited links. Selling anything is off the table.',
  },
  {
    title: 'Photos must be yours',
    text: 'Recent, unedited photos of you. No celebrity shots, no AI faces, no one else’s selfies.',
  },
  {
    title: 'Consent is the whole point',
    text: 'No unsolicited explicit photos, no pressure, no “just one drink” persistence.',
  },
  {
    title: 'Adults only',
    text: 'HobyMine is strictly 18+. If you believe an account belongs to a minor, report it immediately.',
  },
];

export function SafetyPage() {
  const user = useAuthStore((state) => state.user);
  const [blocked, setBlocked] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<{ blocked: PublicUser[] }>('/api/blocks')
      .then((data) => {
        if (!cancelled) setBlocked(data.blocked);
      })
      .catch(() => {
        if (!cancelled) setBlocked([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unblock = async (target: PublicUser): Promise<void> => {
    setUnblocking(target.id);
    try {
      await api.delete(`/api/blocks/${target.id}`);
      setBlocked((current) => current.filter((entry) => entry.id !== target.id));
      toast.success(`${target.name.split(' ')[0]} unblocked`);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not unblock');
    } finally {
      setUnblocking(null);
    }
  };

  return (
    <div className="animate-slide-up">
      <div className="flex items-center gap-3">
        <Link
          to="/profile"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-ink-300 transition hover:text-white"
          aria-label="Back to profile"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.28em] text-sky">Safety</p>
          <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
            Good dates start here.
          </h1>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="relative overflow-hidden rounded-[1.75rem] border border-sky/20 bg-gradient-to-br from-sky/[0.1] via-ink-900 to-ink-900 p-6 sm:p-7">
            <div className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full bg-sky/10 blur-3xl" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-lg">
                <p className="flex items-center gap-2 text-[0.625rem] font-bold uppercase tracking-[0.2em] text-sky">
                  <ShieldCheck className="h-4 w-4" />
                  Your safety toolkit
                </p>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">
                  Trust your gut. Use the tools.
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-ink-300">
                  Report or block anyone from a chat menu or their profile. Blocks are mutual and
                  instant — they disappear from your deck and matches.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link to="/discover" className="btn-primary px-4 py-2.5 text-xs">
                    <HeartHandshake className="h-4 w-4" />
                    Back to discovery
                  </Link>
                  <Link to="/verify" className="btn-ghost px-4 py-2.5 text-xs">
                    <BadgeCheck className="h-4 w-4" />
                    {user?.verified ? 'Verified' : 'Get verified'}
                  </Link>
                </div>
              </div>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-sky/25 bg-sky/10 text-sky">
                <ShieldCheck className="h-8 w-8" />
              </div>
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-white">The four rules</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {TIPS.map((tip) => (
                <div
                  key={tip.title}
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <tip.icon className="h-4 w-4 text-neon" />
                  <p className="mt-3 text-xs font-semibold text-white">{tip.title}</p>
                  <p className="mt-1 text-[0.65625rem] leading-relaxed text-ink-400">{tip.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Blocked accounts</h2>
                <p className="mt-0.5 text-[0.625rem] text-ink-500">
                  They can’t find you, message you, or appear in your deck.
                </p>
              </div>
              <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[0.625rem] font-bold text-ink-300">
                {blocked.length}
              </span>
            </div>

            {loading ? (
              <div className="space-y-2 p-4">
                {[0, 1].map((index) => (
                  <div key={index} className="flex items-center gap-3 p-2">
                    <Skeleton className="h-11 w-11 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-2.5 w-40" />
                    </div>
                  </div>
                ))}
              </div>
            ) : blocked.length === 0 ? (
              <EmptyState
                icon={Ban}
                title="No one is blocked"
                description="If someone crosses a line, report or block them from the chat menu. We’ll take it from there."
                className="rounded-none border-0 bg-transparent py-10"
              />
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {blocked.map((person) => (
                  <div key={person.id} className="flex items-center gap-3 px-5 py-3.5">
                    <Avatar
                      name={person.name}
                      photos={person.photos}
                      id={person.id}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white">{person.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[0.625rem] text-ink-500">
                        <MapPin className="h-2.5 w-2.5" />
                        {person.countryName || person.city || 'Unknown country'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void unblock(person)}
                      disabled={unblocking === person.id}
                      className="btn-subtle px-3 py-2 text-[0.625rem]"
                    >
                      {unblocking === person.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <UserRoundCheck className="h-3 w-3" />
                      )}
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-white">Community guidelines</h2>
            <div className="mt-4 divide-y divide-white/[0.05]">
              {GUIDELINES.map((rule) => (
                <div key={rule.title} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon" />
                  <div>
                    <p className="text-xs font-semibold text-white">{rule.title}</p>
                    <p className="mt-0.5 text-[0.65625rem] leading-relaxed text-ink-400">{rule.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-rose/20 bg-rose/[0.05] p-5">
            <div className="flex items-center gap-2 text-rose">
              <AlertTriangle className="h-4 w-4" />
              <h2 className="text-sm font-semibold">In an emergency</h2>
            </div>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-300">
              If you are in immediate danger, call your local emergency number first. HobyMine is an
              independent demo and does not provide emergency response.
            </p>
            <a
              href="tel:112"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-rose/25 bg-rose/10 px-3 py-1.5 text-[0.625rem] font-semibold text-rose transition hover:bg-rose/15"
            >
              <Phone className="h-3 w-3" />
              Emergency services
            </a>
          </div>

          <div className="panel p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Flag className="h-4 w-4 text-neon" />
              How to report
            </h2>
            <ol className="mt-4 space-y-3">
              {[
                'Open the chat or profile of the person.',
                'Tap the menu, then “Report or block”.',
                'Choose a reason and add any details.',
                'We review every report confidentially.',
              ].map((step, index) => (
                <li key={step} className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-[0.5625rem] font-bold text-ink-300">
                    {index + 1}
                  </span>
                  <span className="text-[0.65625rem] leading-relaxed text-ink-400">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-white">
              <Sparkles className="h-3.5 w-3.5 text-neon" />
              Consent, every time
            </h3>
            <p className="mt-1.5 text-[0.65625rem] leading-relaxed text-ink-400">
              A match is an invitation to talk, not a promise of anything else. Anyone can change
              their mind at any point — including halfway through a date.
            </p>
          </div>

          <Link
            to="/profile"
            className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-[0.6875rem] font-semibold text-ink-300 transition hover:text-white"
          >
            Back to your profile
            <ChevronRight className="h-4 w-4" />
          </Link>
        </aside>
      </div>
    </div>
  );
}

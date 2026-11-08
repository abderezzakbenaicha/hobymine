import {
  ArrowRight,
  Heart,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Spinner';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { cn, formatRelativeShort } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import type { MatchSummary } from '../types';

type Tab = 'all' | 'unread' | 'new';

function previewFor(match: MatchSummary, meId: string): string {
  const message = match.lastMessage;
  if (!message) return 'You matched — say something good.';
  const prefix = message.senderId === meId ? 'You: ' : '';
  if (message.kind === 'image') return `${prefix}📷 Photo`;
  if (message.kind === 'voice') return `${prefix}🎙️ Voice note`;
  if (message.kind === 'file') return `${prefix}📄 ${message.fileName ?? 'Document'}`;
  if (message.kind === 'call') {
    return `${prefix}${message.body === 'video' ? '📹 Video call' : '📞 Voice call'}`;
  }
  if (message.kind === 'system') return message.body;
  return `${prefix}${message.body}`;
}

export function MatchesPage() {
  const user = useAuthStore((state) => state.user);
  const conversations = useChatStore((state) => state.conversations);
  const loading = useChatStore((state) => state.loadingConversations);
  const loadConversations = useChatStore((state) => state.loadConversations);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const newMatches = useMemo(
    () => conversations.filter((match) => match.isNew),
    [conversations],
  );

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return conversations.filter((match) => {
      if (tab === 'unread' && match.unreadCount === 0) return false;
      if (tab === 'new' && !match.isNew) return false;
      if (search && !match.user.name.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [conversations, query, tab]);

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await loadConversations();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="animate-slide-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.28em] text-neon">
            Connections
          </p>
          <h1 className="mt-1.5 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
            Matches
          </h1>
          <p className="mt-1.5 text-xs text-ink-400">
            {conversations.length} {conversations.length === 1 ? 'connection' : 'connections'} ·{' '}
            {newMatches.length} new
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-ink-300 transition hover:text-white"
            aria-label="Refresh matches"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </button>
          <Link to="/plus" className="btn-ghost px-3.5 py-2.5 text-xs">
            <Sparkles className="h-4 w-4 text-neon" />
            {user?.plus ? 'Plus active' : 'Get Plus'}
          </Link>
        </div>
      </div>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">New matches</h2>
          {newMatches.length > 0 && (
            <span className="rounded-full bg-neon/10 px-2 py-0.5 text-[0.625rem] font-semibold text-neon">
              {newMatches.length}
            </span>
          )}
        </div>

        {newMatches.length === 0 ? (
          <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04]">
                <Star className="h-4 w-4 text-ink-500" />
              </div>
              <div>
                <p className="text-xs font-medium text-ink-200">No brand-new matches yet</p>
                <p className="text-[0.6875rem] text-ink-500">Your next one is one swipe away.</p>
              </div>
            </div>
            <Link to="/discover" className="text-xs font-semibold text-neon hover:underline">
              Discover
            </Link>
          </div>
        ) : (
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {newMatches.map((match) => (
              <button
                key={match.id}
                type="button"
                onClick={() => navigate(`/chat/${match.id}`)}
                className="group flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5"
              >
                <div className="relative rounded-full p-[0.125rem] transition group-hover:bg-neon-gradient">
                  <Avatar
                    name={match.user.name}
                    photos={match.user.photos}
                    id={match.user.id}
                    size="lg"
                    online={match.user.online}
                    className="border-2 border-canvas"
                  />
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-full bg-neon px-2 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-ink-950">
                    New
                  </span>
                </div>
                <span className="max-w-full truncate text-[0.6875rem] font-medium text-ink-200">
                  {match.user.name.split(' ')[0]}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1 rounded-full border border-white/8 bg-ink-900 p-1">
            {(
              [
                { value: 'all', label: 'All' },
                { value: 'unread', label: 'Unread' },
                { value: 'new', label: 'New' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTab(option.value)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[0.6875rem] font-semibold transition',
                  tab === option.value
                    ? 'bg-white text-canvas'
                    : 'text-ink-400 hover:text-white',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search matches"
              className="h-10 w-full rounded-full border border-white/8 bg-white/[0.03] pl-9 pr-4 text-xs text-white placeholder:text-ink-500 focus:border-neon/40 focus:outline-none"
              aria-label="Search matches"
            />
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-3xl border border-white/[0.06] bg-ink-900/60">
          {loading ? (
            <div className="space-y-1 p-3">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="flex items-center gap-3 p-3">
                  <Skeleton className="h-14 w-14 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={MessageCircle}
                title={query ? 'No matches found' : 'No conversations here yet'}
                description={
                  query
                    ? 'Try a different name, or clear your search.'
                    : 'When you and someone both swipe right, the conversation starts here.'
                }
                action={
                  !query ? (
                    <Link to="/discover" className="btn-primary">
                      <Heart className="h-4 w-4" />
                      Start discovering
                    </Link>
                  ) : undefined
                }
                className="border-0 bg-transparent py-10"
              />
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {filtered.map((match) => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => navigate(`/chat/${match.id}`)}
                  className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-white/[0.03] sm:px-5"
                >
                  <Avatar
                    name={match.user.name}
                    photos={match.user.photos}
                    id={match.user.id}
                    size="lg"
                    online={match.user.online}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-white">
                        {match.user.name}
                      </p>
                      {match.user.verified && <VerifiedBadge size="sm" />}
                      {match.user.plus && (
                        <span className="rounded bg-neon/10 px-1 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-neon">
                          Plus
                        </span>
                      )}
                      {match.isNew && (
                        <span className="rounded bg-sky/10 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-sky">
                          New
                        </span>
                      )}
                    </div>
                    <p
                      className={cn(
                        'mt-1 truncate text-xs',
                        match.unreadCount > 0 ? 'font-medium text-ink-100' : 'text-ink-500',
                      )}
                    >
                      {previewFor(match, user?.id ?? '')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-[0.625rem] text-ink-500">
                      {formatRelativeShort(match.lastMessage?.createdAt ?? match.matchedAt)}
                    </span>
                    {match.unreadCount > 0 ? (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-neon px-1.5 text-[0.625rem] font-bold text-ink-950">
                        {match.unreadCount}
                      </span>
                    ) : (
                      <span className="h-5" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="relative mt-6 overflow-hidden rounded-3xl border border-neon/20 bg-gradient-to-br from-neon/[0.1] via-ink-900 to-sky/[0.05] p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-neon/10 blur-[5.625rem]" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-xl">
            <p className="flex items-center gap-1.5 text-[0.625rem] font-bold uppercase tracking-[0.22em] text-neon">
              <Sparkles className="h-3 w-3" />
              HobyMine Plus
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
              {user?.plus ? 'Your Plus tools are live.' : 'See every like. Be seen first.'}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-ink-300">
              {user?.plus
                ? 'Manage your boost, receipts, and clear likes from one place.'
                : 'Unlock clear likes, a 30-minute profile boost, and read receipts.'}
            </p>
            <Link
              to="/plus"
              className="mt-4 inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold text-neon hover:underline"
            >
              {user?.plus ? 'Manage membership' : 'Explore HobyMine Plus'}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { icon: Heart, label: 'Clear likes' },
              { icon: Star, label: 'Boost' },
              { icon: Sparkles, label: 'Receipts' },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 backdrop-blur"
              >
                <item.icon className="mx-auto h-4 w-4 text-neon" />
                <p className="mt-1.5 text-[0.5625rem] font-semibold text-ink-300">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={() => {
          void refresh().then(() => toast.success('Matches refreshed'));
        }}
        className="mx-auto mt-6 flex items-center gap-2 text-[0.6875rem] text-ink-500 transition hover:text-white"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh connections
      </button>

      <Link
        to="/discover"
        className="mx-auto mt-5 flex w-fit items-center gap-1.5 text-[0.6875rem] font-semibold text-neon hover:underline"
      >
        <Plus className="h-3.5 w-3.5" />
        Find more people
      </Link>
    </div>
  );
}

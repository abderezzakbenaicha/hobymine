import {
  ArrowRight,
  BadgeCheck,
  Camera,
  ChevronRight,
  Compass,
  Eye,
  FileText,
  Heart,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Mic,
  Monitor,
  Moon,
  Pencil,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Avatar } from '../components/Avatar';
import { InterestPill } from '../components/InterestPill';
import { PhotoCarousel } from '../components/PhotoCarousel';
import { ProfileHighlights } from '../components/ProfileHighlights';
import { ProfileSheet, useProfileViewer } from '../components/ProfileSheet';
import { ServerSettingsModal } from '../components/ServerSettingsModal';
import { Switch } from '../components/Switch';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { VoiceIntroPlayer } from '../components/VoiceIntro';
import { apiBaseLabel, getApiBase, useApiBase } from '../lib/apiConfig';
import { api, ApiClientError, useConnectionState } from '../lib/api';
import {
  backgroundAlertsEnabled,
  updateBackgroundAlerts,
} from '../lib/notifications';
import { profileChecklist, profileCompletion } from '../lib/profile';
import { cn, distanceLabel } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { useThemeStore, type ThemeMode } from '../store/theme';
import type { MeUser, PublicUser } from '../types';

/** Light (the default) / dark / follow the device. */
const THEME_OPTIONS: { value: ThemeMode; label: string; hint?: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', hint: 'Default', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', hint: 'Device', icon: Monitor },
];

function ActivityTile({
  to,
  icon: Icon,
  value,
  label,
  tone,
}: {
  to: string;
  icon: typeof Heart;
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <Link
      to={to}
      className="flex min-w-0 flex-col items-center gap-1 rounded-xl border border-white/[0.05] bg-white/[0.02] px-2 py-3 text-center transition hover:border-neon/20 hover:bg-white/[0.04]"
      aria-label={`${value} ${label}`}
    >
      <Icon className={cn('h-4 w-4', tone)} />
      <span className="text-lg font-black leading-none text-white">{value}</span>
      <span className="text-[0.5625rem] uppercase tracking-[0.12em] text-ink-500">{label}</span>
    </Link>
  );
}

export function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const conversations = useChatStore((state) => state.conversations);
  const likesYouCount = useChatStore((state) => state.likesYouCount);
  const navigate = useNavigate();
  const [toolBusy, setToolBusy] = useState<'boost' | 'receipts' | null>(null);
  const [backgroundAlerts, setBackgroundAlertsOn] = useState(backgroundAlertsEnabled());
  const [incognito, setIncognito] = useState(user?.incognito ?? false);
  const [views, setViews] = useState<PublicUser[]>([]);
  const themeMode = useThemeStore((state) => state.mode);
  const setThemeMode = useThemeStore((state) => state.setMode);
  const apiBase = useApiBase();
  const connection = useConnectionState();
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const profileViewer = useProfileViewer();

  const loadViews = useCallback(async (): Promise<void> => {
    try {
      const data = await api.get<{ views: PublicUser[] }>('/api/me/views');
      setViews(data.views);
    } catch {
      setViews([]);
    }
  }, []);

  useEffect(() => {
    void loadViews();
  }, [loadViews]);

  const toggleIncognito = async (enabled: boolean): Promise<void> => {
    const previous = incognito;
    setIncognito(enabled);
    try {
      const data = await api.patch<{ user: MeUser }>('/api/me', { incognito: enabled });
      setUser(data.user);
      toast.success(
        enabled ? 'Incognito mode on' : 'Incognito mode off',
        enabled
          ? { description: 'Your browsing leaves no trace.' }
          : undefined,
      );
      if (enabled) setViews([]);
    } catch (error) {
      setIncognito(previous);
      if (error instanceof ApiClientError && error.code === 'plus_required') {
        toast.error('Incognito mode is a HobyMine Plus feature', {
          description: 'Upgrade to browse without leaving a trace.',
          action: { label: 'See plans', onClick: () => navigate('/plus') },
        });
        return;
      }
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not change the mode',
      );
    }
  };

  const clearViews = async (): Promise<void> => {
    try {
      await api.delete('/api/me/views');
      setViews([]);
      toast.success('View history cleared');
    } catch {
      toast.error('Could not clear the history');
    }
  };

  const toggleBackgroundAlerts = async (enabled: boolean): Promise<void> => {
    setBackgroundAlertsOn(enabled);
    await updateBackgroundAlerts(enabled, {
      token: useAuthStore.getState().token ?? '',
      apiBase: getApiBase(),
    });
    toast.success(
      enabled ? 'Background alerts on' : 'Background alerts off',
      enabled
        ? { description: 'HobyMine will let you know about new messages and likes.' }
        : undefined,
    );
  };

  if (!user) return null;

  const items = profileChecklist(user);
  const completion = profileCompletion(user).percent;
  const firstName = user.name.split(' ')[0];
  const unread = conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);
  const hasRichProfile = Boolean(
    user.relationshipGoal ||
      user.heightCm ||
      user.languages.length > 0 ||
      user.lifestyle.length > 0,
  );

  const signOut = (): void => {
    logout();
    navigate('/welcome', { replace: true });
  };

  const toggleBoost = async (): Promise<void> => {
    if (!user.plus) {
      navigate('/plus');
      return;
    }
    setToolBusy('boost');
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
      setToolBusy(null);
    }
  };

  const toggleReceipts = async (): Promise<void> => {
    if (!user.plus) {
      navigate('/plus');
      return;
    }
    setToolBusy('receipts');
    try {
      const data = await api.patch<{ user: MeUser }>('/api/plus/read-receipts', {
        enabled: !user.readReceipts,
      });
      setUser(data.user);
      toast.success(data.user.readReceipts ? 'Read receipts on' : 'Read receipts off');
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not update read receipts',
      );
    } finally {
      setToolBusy(null);
    }
  };

  return (
    <div className="animate-slide-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.28em] text-neon">Your space</p>
          <h1 className="mt-1.5 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
            Profile
          </h1>
          <p className="mt-1.5 text-xs text-ink-400">
            This is how {firstName} shows up in someone&rsquo;s deck.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => profileViewer.openProfile(user)}
            className="btn-ghost px-3 py-2.5 text-xs"
            title="Preview your public profile"
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Preview</span>
          </button>
          <Link to="/profile/edit" className="btn-primary px-4 py-2.5 text-xs">
            <Pencil className="h-4 w-4" />
            Edit profile
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
        <section className="mx-auto w-full max-w-[26.875rem]">
          <div className="force-dark group relative aspect-[2/3] overflow-hidden rounded-[1.875rem] border border-white/[0.1] bg-ink-850 shadow-card-warm">
            {/*
              The portrait is the card. Copy sits on a soft bottom gradient so
              the name and bio stay legible without ever washing over the face.
            */}
            <PhotoCarousel
              photos={user.photos}
              name={user.name}
              id={user.id}
              showArrows={false}
              barsRightInset
              className="absolute inset-0"
            />

            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_75%_at_50%_-8%,rgba(255,255,255,0.07),transparent_46%)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-ink-950/40 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[64%] bg-card-fade" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-[radial-gradient(90%_120%_at_50%_100%,rgba(255,138,162,0.13),transparent_68%)] mix-blend-soft-light" />

            <span className="absolute left-3 top-3 z-20 rounded-full border border-white/15 bg-ink-950/30 px-2.5 py-1 text-[0.5rem] font-bold uppercase tracking-[0.2em] text-white/70 backdrop-blur-md">
              Public view
            </span>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col px-5 pb-5 pt-10">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <h2 className="text-[2rem] font-black leading-[0.95] tracking-[-0.045em] text-photo [text-shadow:0_2px_18px_rgba(0,0,0,0.35)]">
                  {firstName}
                  <span className="ml-1.5 font-light tracking-[-0.02em] text-photo/60">
                    {user.age}
                  </span>
                </h2>
                {user.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-sky/25 bg-sky/10 px-2 py-0.5 text-[0.625rem] font-semibold text-sky backdrop-blur-md">
                    <VerifiedBadge size="sm" />
                    Verified
                  </span>
                )}
                {user.plus && (
                  <span className="rounded-full border border-neon/30 bg-neon/10 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-[0.16em] text-neon-soft backdrop-blur-md">
                    HobyMine Plus
                  </span>
                )}
              </div>

              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.75rem] font-medium text-photo/75 [text-shadow:0_1px_12px_rgba(0,0,0,0.3)]">
                <span className="truncate">{user.job || 'Add what you do'}</span>
                <span className="text-photo/25">·</span>
                <span className="inline-flex min-w-0 items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0 text-photo/50" />
                  <span className="truncate">
                    {user.countryFlag} {user.countryName || user.city || 'Add your country'}
                  </span>
                </span>
              </p>

              {user.bio && (
                <p className="mt-2.5 line-clamp-2 max-w-[96%] text-[0.8125rem] leading-relaxed text-photo/80">
                  {user.bio}
                </p>
              )}

              <div className="pointer-events-auto mt-3 flex flex-wrap gap-1.5">
                {user.interests.slice(0, 4).map((interest) => (
                  <InterestPill
                    key={interest}
                    label={interest}
                    className="border-white/15 bg-ink-950/25 text-photo/85 backdrop-blur-md"
                  />
                ))}
                {user.interests.length === 0 && (
                  <Link
                    to="/profile/edit"
                    className="rounded-full border border-white/15 bg-ink-950/25 px-2.5 py-1 text-[0.6875rem] font-medium text-photo/80 backdrop-blur-md"
                  >
                    + Add interests
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Link
              to="/profile/edit"
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-2 py-3 text-[0.625rem] font-medium text-ink-300 transition hover:border-neon/25 hover:text-white"
            >
              <Camera className="h-4 w-4 text-neon" />
              Photos
            </Link>
            <Link
              to="/preferences"
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-2 py-3 text-[0.625rem] font-medium text-ink-300 transition hover:border-neon/25 hover:text-white"
            >
              <Settings2 className="h-4 w-4 text-sky" />
              Preferences
            </Link>
            <Link
              to="/verify"
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-2 py-3 text-[0.625rem] font-medium text-ink-300 transition hover:border-neon/25 hover:text-white"
            >
              <BadgeCheck className="h-4 w-4 text-violet" />
              {user.verified ? 'Verified' : 'Verify'}
            </Link>
          </div>
        </section>

        <div className="space-y-5">
          <section className="panel p-4 sm:p-5" aria-labelledby="profile-activity-heading">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="profile-activity-heading" className="text-sm font-semibold text-white">
                  Your activity
                </h2>
                <p className="mt-1 text-[0.6875rem] text-ink-400">
                  Likes, matches and unread chats in one place.
                </p>
              </div>
              <Link
                to="/likes"
                className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] font-semibold text-neon hover:underline"
              >
                View likes <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <ActivityTile
                to="/likes"
                icon={Heart}
                value={likesYouCount}
                label="Likes"
                tone="text-neon"
              />
              <ActivityTile
                to="/matches"
                icon={MessageCircle}
                value={conversations.length}
                label="Matches"
                tone="text-sky"
              />
              <ActivityTile
                to="/matches"
                icon={Mail}
                value={unread}
                label="Unread"
                tone="text-violet"
              />
            </div>
          </section>

          <section className="panel p-5 sm:p-6" aria-labelledby="profile-about-heading">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="profile-about-heading" className="text-sm font-semibold text-white">
                  About you
                </h2>
                <p className="mt-1 text-[0.6875rem] text-ink-400">
                  The details people see beyond your photos.
                </p>
              </div>
              <Link
                to="/profile/edit"
                className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] font-semibold text-neon hover:underline"
              >
                Edit <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {hasRichProfile ? (
              <ProfileHighlights user={user} variant="full" className="mt-4" />
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3.5 py-3">
                <p className="text-[0.6875rem] leading-relaxed text-ink-400">
                  Add your relationship goal, height, languages and lifestyle tags so people
                  know what you are about before they swipe.
                </p>
                <Link
                  to="/profile/edit"
                  className="mt-2 inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-neon hover:underline"
                >
                  Fill in the details <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </section>

          <section className="panel p-5 sm:p-6" aria-labelledby="profile-voice-heading">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="profile-voice-heading"
                  className="flex items-center gap-2 text-sm font-semibold text-white"
                >
                  <Mic className="h-4 w-4 text-neon" />
                  Your voice intro
                </h2>
                <p className="mt-1 text-[0.6875rem] text-ink-400">
                  A 20-second hello that plays at the top of your full profile.
                </p>
              </div>
              <Link
                to="/profile/edit#voice"
                className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] font-semibold text-neon hover:underline"
              >
                {user.voiceIntro ? 'Update' : 'Record'}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {user.voiceIntro ? (
              <VoiceIntroPlayer intro={user.voiceIntro} name="You" className="mt-4" />
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3.5 py-3">
                <p className="text-[0.6875rem] leading-relaxed text-ink-400">
                  No voice intro yet. People are far more likely to reply after hearing your
                  voice — record one in under 20 seconds.
                </p>
                <Link
                  to="/profile/edit#voice"
                  className="btn-primary mt-3 w-full py-2.5 text-xs"
                >
                  <Mic className="h-3.5 w-3.5" />
                  Record your intro
                </Link>
              </div>
            )}
          </section>

          <section className="panel p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Profile strength</h2>
                <p className="mt-1 text-[0.6875rem] text-ink-400">
                  Complete profiles get more than twice the matches.
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-neon">{completion}%</span>
              </div>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full bg-neon-gradient shadow-glow-sm transition-all duration-700"
                style={{ width: `${completion}%` }}
              />
            </div>

            <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {items.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-[0.6875rem]">
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full border',
                      item.done
                        ? 'border-neon/40 bg-neon/15 text-neon'
                        : 'border-white/15 text-transparent',
                    )}
                  >
                    <BadgeCheck className="h-3 w-3" />
                  </span>
                  <span className={item.done ? 'text-ink-300' : 'text-ink-500'}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>

            {completion < 100 && (
              <Link
                to="/profile/edit"
                className="mt-5 inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-neon hover:underline"
              >
                Finish your profile <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </section>

          <section className="panel p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Power tools</h2>
                <p className="mt-1 text-[0.6875rem] text-ink-400">
                  Boost, receipts, Super Likes and Plus now live here.
                </p>
              </div>
              <Link
                to="/plus"
                className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-neon hover:underline"
              >
                {user.plus ? 'Manage Plus' : 'Go Plus'}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ToolTile
                icon={Zap}
                title={user.boostActive ? 'Boost is running' : 'Boost profile'}
                subtitle={
                  user.boostActive
                    ? 'You’re at the front of discovery.'
                    : 'Be seen first for 30 minutes.'
                }
                badge={user.boostActive ? 'Live' : user.plus ? 'Ready' : 'Plus'}
                active={user.boostActive}
                busy={toolBusy === 'boost'}
                onClick={() => void toggleBoost()}
              />
              <ToolTile
                icon={Eye}
                title="Read receipts"
                subtitle={
                  user.plus
                    ? user.readReceipts
                      ? 'Know when your message is opened.'
                      : 'Receipts are currently hidden.'
                    : 'Unlock read receipts with HobyMine Plus.'
                }
                badge={user.plus ? (user.readReceipts ? 'On' : 'Off') : 'Plus'}
                active={user.plus && user.readReceipts}
                busy={toolBusy === 'receipts'}
                onClick={() => void toggleReceipts()}
              />
              <ToolTile
                icon={Star}
                title="Super Likes"
                subtitle="Open Discover, then swipe up on a card."
                badge="Included"
                onClick={() => {
                  navigate('/discover');
                  toast('Swipe up on a card to send a Super Like');
                }}
              />
              <ToolTile
                icon={Sparkles}
                title="HobyMine Plus"
                subtitle={
                  user.plus
                    ? 'Your membership is active.'
                    : 'Unlock clear likes, boosts, and receipts.'
                }
                badge={user.plus ? 'Active' : 'Free'}
                active={user.plus}
                to="/plus"
              />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Link
              to="/plus"
              className="group relative overflow-hidden rounded-3xl border border-neon/20 bg-gradient-to-br from-neon/[0.12] via-ink-900 to-sky/[0.05] p-5 transition hover:border-neon/40"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neon/15 text-neon">
                  <Sparkles className="h-5 w-5" />
                </div>
                {user.plus && (
                  <span className="rounded-full border border-neon/30 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wider text-neon">
                    Active
                  </span>
                )}
              </div>
              <h3 className="mt-4 text-sm font-semibold text-white">
                {user.plus ? 'HobyMine Plus is active' : 'Try HobyMine Plus'}
              </h3>
              <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-400">
                {user.plus
                  ? 'Boost, read receipts and your likes are unlocked.'
                  : 'See who likes you, boost your profile, unlock read receipts.'}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-neon">
                {user.plus ? 'Manage membership' : 'Explore plans'}
                <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
              </span>
            </Link>

            <Link
              to="/safety"
              className="group rounded-3xl border border-sky/15 bg-sky/[0.04] p-5 transition hover:border-sky/30"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky/10 text-sky">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-white">Safety centre</h3>
              <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-400">
                Blocked accounts, reporting, and the ground rules for good dates.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-sky">
                Open safety tools
                <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-sm font-semibold text-white">Account</h2>
            </div>
            <div className="divide-y divide-white/[0.05]">
              <Row
                to="/preferences"
                icon={Compass}
                title="Discovery preferences"
                subtitle={`${user.preferences.ageMin}–${user.preferences.ageMax} years · ${user.preferences.maxDistance >= 1000 ? `${Math.round(user.preferences.maxDistance / 1000)}k` : user.preferences.maxDistance} km`}
              />
              <Row
                to="/profile/edit"
                icon={Pencil}
                title="Edit profile"
                subtitle="Name, photos, bio and interests"
              />
              <Row
                to="/verify"
                icon={BadgeCheck}
                title={user.verified ? 'Verification complete' : 'Get verified'}
                subtitle={
                  user.verified
                    ? 'Your verified check is visible to everyone'
                    : 'A quick selfie earns trust'
                }
              />
              <Row
                to="/likes"
                icon={Heart}
                title="People who like you"
                subtitle={user.plus ? 'Included with HobyMine Plus' : 'Unlock with HobyMine Plus'}
              />
              <Row
                to="/settings"
                icon={Settings2}
                title="Settings & account"
                subtitle="Change password, pause or delete your account"
              />
              <Row
                to="/legal/terms"
                icon={FileText}
                title="Terms of Service"
                subtitle={
                  user.termsAcceptedAt
                    ? `Accepted ${new Date(user.termsAcceptedAt).toLocaleDateString()}${user.termsVersion ? ` · v${user.termsVersion}` : ''}`
                    : 'The rules for using HobyMine'
                }
              />
              <Row
                to="/legal/privacy"
                icon={ShieldCheck}
                title="Privacy Policy"
                subtitle="What we collect and how your data is used"
              />
            </div>
          </section>

          <section className="panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-white">Server connection</h2>
                <p className="mt-1 truncate text-[0.6875rem] text-ink-300">
                  {apiBaseLabel(apiBase)}
                </p>
                <p className="mt-1 text-[0.625rem] text-ink-500">
                  {connection.status === 'online'
                    ? 'Connected'
                    : connection.status === 'offline'
                      ? 'Not reachable — retrying automatically'
                      : 'Not checked yet'}
                </p>
              </div>
              <span
                className={cn(
                  'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
                  connection.status === 'online'
                    ? 'bg-neon shadow-[0_0_10px_rgb(var(--neon)/0.7)]'
                    : connection.status === 'offline'
                      ? 'bg-rose'
                      : 'bg-ink-500',
                )}
                aria-hidden
              />
            </div>
            <button
              type="button"
              onClick={() => setServerSettingsOpen(true)}
              className="btn-subtle mt-3 w-full"
            >
              <Server className="h-3.5 w-3.5" />
              Change server address
            </button>
            <p className="mt-2 text-[0.625rem] leading-relaxed text-ink-500">
              If the backend moved to a new Wi-Fi address, update it here — no reinstall needed.
            </p>
          </section>

          <section className="panel p-5">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white">Appearance</h2>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-400">
                Light Mode is the default. Pick Dark Mode for the neon night palette, or System
                Default to follow your device. Your choice is remembered on this device.
              </p>
            </div>
            <div
              role="radiogroup"
              aria-label="Colour theme"
              className="mt-4 grid grid-cols-3 gap-1 rounded-2xl border border-white/8 bg-white/[0.03] p-1.5"
            >
              {THEME_OPTIONS.map((option) => {
                const active = themeMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setThemeMode(option.value)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[0.6875rem] font-semibold transition',
                      active
                        ? 'bg-white/[0.1] text-white shadow-sm'
                        : 'text-ink-400 hover:bg-white/[0.04] hover:text-white',
                    )}
                  >
                    <option.icon className={cn('h-4 w-4', active && 'text-neon')} />
                    <span>{option.label}</span>
                    {option.hint && (
                      <span className="text-[0.5625rem] font-medium uppercase tracking-[0.1em] text-ink-500">
                        {option.hint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-white">Background alerts</h2>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-400">
                  Keep HobyMine connected so messages, likes and matches still notify you
                  when the app is closed.
                </p>
              </div>
              <Switch
                checked={backgroundAlerts}
                onChange={(value) => void toggleBackgroundAlerts(value)}
                label="Background alerts"
              />
            </div>
            {backgroundAlerts && (
              <p className="mt-3 rounded-xl border border-neon/15 bg-neon/[0.05] px-3 py-2 text-[0.625rem] leading-relaxed text-ink-300">
                HobyMine is watching for new activity in the background. Android shows a small
                “HobyMine is active” notification while it does.
              </p>
            )}
          </section>

          <section className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-white">Incognito mode</h2>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-400">
                  Browse profiles and discover people without leaving a view history behind.
                </p>
              </div>
              <Switch
                checked={incognito}
                onChange={(value) => void toggleIncognito(value)}
                label="Incognito mode"
              />
            </div>
            {incognito && (
              <p className="mt-3 rounded-xl border border-neon/15 bg-neon/[0.05] px-3 py-2 text-[0.625rem] leading-relaxed text-ink-300">
                You are browsing privately. Nobody sees which profiles you look at, and your
                view history stays empty.
              </p>
            )}
            {!user.plus && (
              <p className="mt-3 text-[0.625rem] text-ink-500">
                Incognito mode is a HobyMine Plus feature.{' '}
                <Link to="/plus" className="font-semibold text-neon hover:underline">
                  See plans
                </Link>
              </p>
            )}
          </section>

          <section className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">Recently viewed</h2>
              {views.length > 0 && (
                <button
                  type="button"
                  onClick={() => void clearViews()}
                  className="text-[0.6875rem] font-semibold text-ink-400 transition hover:text-white"
                >
                  Clear history
                </button>
              )}
            </div>
            {views.length === 0 ? (
              <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
                {user.incognito
                  ? 'Incognito mode is on, so nothing is recorded.'
                  : 'Profiles you look at show up here so you can find them again.'}
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {views.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => profileViewer.openProfile(person)}
                    className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-1.5 transition hover:border-neon/25"
                  >
                    <Avatar
                      name={person.name}
                      photos={person.photos}
                      id={person.id}
                      size="xs"
                    />
                    <span className="text-[0.6875rem] font-medium text-ink-200">
                      {person.name.split(' ')[0]}, {person.age}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-white">The details</h2>
            <dl className="mt-4 grid gap-3 text-[0.6875rem] sm:grid-cols-2">
              <div>
                <dt className="text-ink-500">Email</dt>
                <dd className="mt-0.5 truncate text-ink-200">{user.email}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Location</dt>
                <dd className="mt-0.5 flex items-center gap-1 text-ink-200">
                  <MapPin className="h-3 w-3 text-neon" />
                  {user.countryName || user.city || 'Not set'}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Distance from you</dt>
                <dd className="mt-0.5 text-ink-200">{distanceLabel(user.distanceKm)}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Membership</dt>
                <dd className="mt-0.5 flex items-center gap-1 text-ink-200">
                  {user.plus ? (
                    <>
                      <Zap className="h-3 w-3 text-neon" />
                      HobyMine Plus
                    </>
                  ) : (
                    <>
                      <Star className="h-3 w-3 text-ink-500" />
                      Free account
                    </>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 text-left transition hover:border-rose/25 hover:bg-rose/[0.04]"
          >
            <span className="flex items-center gap-3">
              <LogOut className="h-4 w-4 text-rose" />
              <span>
                <span className="block text-xs font-semibold text-white">Sign out</span>
                <span className="block text-[0.625rem] text-ink-500">See you soon, {firstName}</span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-ink-600" />
          </button>

          <p className="prose-disclaimer text-center">
            HobyMine is an independent portfolio demo. Not affiliated with any dating brand. All
            profiles and photos are generated for demonstration.
          </p>

          <ServerSettingsModal
            open={serverSettingsOpen}
            onClose={() => setServerSettingsOpen(false)}
          />
        </div>
      </div>

      <ProfileSheet
        user={profileViewer.profile}
        onClose={profileViewer.closeProfile}
        showPresence={profileViewer.profile?.id === user.id}
        title={profileViewer.profile?.id === user.id ? 'Your public profile' : 'Full profile'}
        footer={
          profileViewer.profile?.id === user.id ? (
            <Link
              to="/profile/edit"
              className="btn-primary w-full"
              onClick={profileViewer.closeProfile}
            >
              <Pencil className="h-4 w-4" />
              Edit profile
            </Link>
          ) : (
            <button type="button" className="btn-ghost w-full" onClick={profileViewer.closeProfile}>
              Close
            </button>
          )
        }
      />
    </div>
  );
}

function Row({
  to,
  icon: Icon,
  title,
  subtitle,
}: {
  to: string;
  icon: typeof Compass;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3.5 px-5 py-4 transition hover:bg-white/[0.03]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-ink-300">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-white">{title}</span>
        <span className="mt-0.5 block truncate text-[0.625rem] text-ink-500">{subtitle}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-600" />
    </Link>
  );
}

function ToolTile({
  icon: Icon,
  title,
  subtitle,
  badge,
  active = false,
  busy = false,
  onClick,
  to,
}: {
  icon: typeof Compass;
  title: string;
  subtitle: string;
  badge: string;
  active?: boolean;
  busy?: boolean;
  onClick?: () => void;
  to?: string;
}) {
  const body = (
    <>
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition',
          active ? 'bg-neon/15 text-neon' : 'bg-white/[0.04] text-ink-300',
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2">
          <span className="truncate text-xs font-semibold text-white">{title}</span>
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider',
              active ? 'bg-neon/10 text-neon' : 'bg-white/[0.05] text-ink-400',
            )}
          >
            {badge}
          </span>
        </span>
        <span className="mt-0.5 block text-[0.625rem] leading-relaxed text-ink-500">{subtitle}</span>
      </span>
      {to && <ChevronRight className="h-4 w-4 shrink-0 text-ink-600" />}
    </>
  );

  const className =
    'flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 transition hover:border-neon/25 hover:bg-white/[0.04] disabled:cursor-wait disabled:opacity-70';

  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={busy} className={className}>
      {body}
    </button>
  );
}


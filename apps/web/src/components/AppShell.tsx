import {
  Compass,
  Eye,
  Heart,
  LogOut,
  MessageCircle,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { callManager } from '../lib/callManager';
import { useApiBase } from '../lib/apiConfig';
import { mediaUrl } from '../lib/media';
import {
  backgroundAlertsEnabled,
  clearBackgroundSession,
  clearLaunchPayload,
  getLaunchPayload,
  isAppVisible,
  requestNotificationPermission,
  setAppVisible,
  updateBackgroundAlerts,
  showNotification,
} from '../lib/notifications';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import { useCallStore } from '../store/call';
import { useChatStore } from '../store/chat';
import { useStoriesStore } from '../store/stories';
import { useUiStore } from '../store/ui';
import type {
  CaptureAttemptAlert,
  ChatMessage,
  MatchSummary,
  ProfileViewEvent,
  PublicUser,
  ReactionSummary,
  Story,
} from '../types';
import { Avatar } from './Avatar';
import { VoiceCallOverlay } from './call/VoiceCallOverlay';
import { Logo, LogoMark } from './Logo';
import { NewMatchModal } from './NewMatchModal';
import { PaywallModal } from './PaywallModal';
import { ReportDialog } from './ReportDialog';
import { BlockDialog } from './BlockDialog';
import { SuperLikeAlert, type SuperLikeAlertData } from './SuperLikeAlert';

const NAV_ITEMS = [
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/matches', label: 'Matches', icon: MessageCircle },
  { to: '/likes', label: 'Likes', icon: Heart },
  { to: '/profile', label: 'Profile', icon: User },
] as const;

export function AppShell() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const refreshAccount = useAuthStore((state) => state.refresh);
  const conversations = useChatStore((state) => state.conversations);
  const likesYouCount = useChatStore((state) => state.likesYouCount);
  const loadConversations = useChatStore((state) => state.loadConversations);
  const addIncoming = useChatStore((state) => state.addIncoming);
  const applyRead = useChatStore((state) => state.applyRead);
  const applyReactions = useChatStore((state) => state.applyReactions);
  const setTyping = useChatStore((state) => state.setTyping);
  const removeMatch = useChatStore((state) => state.removeMatch);
  const loadLikes = useChatStore((state) => state.loadLikes);
  const receiveStory = useStoriesStore((state) => state.receive);
  const applyStoryActivity = useStoriesStore((state) => state.applyActivity);
  const showMatch = useUiStore((state) => state.showMatch);
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement | null>(null);
  const apiBase = useApiBase();
  // Super Likes get their own animated alert instead of a regular toast.
  const [superLikeAlert, setSuperLikeAlert] = useState<SuperLikeAlertData | null>(null);
  const dismissSuperLike = useCallback(() => setSuperLikeAlert(null), []);
  const openSuperLike = useCallback(
    (sender: PublicUser) => {
      setSuperLikeAlert(null);
      void sender;
      navigate('/likes');
    },
    [navigate],
  );
  // The socket handlers are installed once per session. Keep the current route
  // in a ref so they can tell whether the open chat is already on screen.
  const pathnameRef = useRef(location.pathname);
  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  const isChat = location.pathname.startsWith('/chat/');
  const isDiscover = location.pathname === '/discover';
  const unreadTotal = conversations.reduce(
    (total, conversation) => total + conversation.unreadCount,
    0,
  );

  // The mobile shell scrolls inside <main>, so reset that container when the
  // route changes (window scrolling still covers the desktop layout).
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);
    callManager.bindSocket(socket);

    // Ask once for notification permission so messages, likes and matches can
    // reach the user while the app is in the background.
    void requestNotificationPermission();

    // Hand the session to the native background service so alerts keep
    // arriving when the app is closed.
    void updateBackgroundAlerts(backgroundAlertsEnabled(), { token, apiBase });
    void setAppVisible(true);

    // A notification tap reopens the app on the right conversation.
    const openFromNotification = async (): Promise<void> => {
      const payload = await getLaunchPayload();
      if (!payload?.matchId) return;
      await clearLaunchPayload();
      navigate(`/chat/${payload.matchId}`);
    };
    void openFromNotification();
    const onVisibility = (): void => {
      const visible = document.visibilityState === 'visible';
      void setAppVisible(visible);
      if (visible) void openFromNotification();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onConnect = (): void => {
      socket.emit('presence:ping');
      callManager.bindSocket(socket);
      toast.dismiss('hobymine-connection');
      // Re-sync the account and the conversation list after every (re)connect
      // so a second device picks up changes made elsewhere: new matches,
      // premium status and unread counts.
      void refreshAccount();
      void loadConversations();
    };

    // A chat capture attempt reaches us twice: once as the persisted system
    // message (inline + after reload) and once as the dedicated security
    // event (instant, even while the chat is open). Collapse the pair so the
    // recipient sees exactly one alert per attempt.
    const captureSeen = new Map<string, number>();
    // The server already throttles repeats (4s); this only needs to collapse
    // the near-simultaneous message/security pair, not distinct attempts.
    const CAPTURE_DEDUPE_MS = 3_000;
    const markCapture = (matchId: string, kind: string): boolean => {
      const key = `${matchId}:${kind}`;
      const now = Date.now();
      if (now - (captureSeen.get(key) ?? 0) < CAPTURE_DEDUPE_MS) return false;
      captureSeen.set(key, now);
      return true;
    };
    const captureKindForBody = (body: string): 'screenshot' | 'screen-recording' =>
      body === 'Screen recording blocked' ? 'screen-recording' : 'screenshot';
    const captureAction = (kind: 'screenshot' | 'screen-recording'): string =>
      kind === 'screenshot' ? 'take a screenshot' : 'record the screen';
    const conversationName = (matchId: string): string =>
      useChatStore
        .getState()
        .conversations.find((entry) => entry.id === matchId)?.user.name ?? 'Someone';

    /** Short, human preview shared by the toast and the system notification. */
    const messagePreview = (message: ChatMessage): string =>
      message.kind === 'image'
        ? '📷 Photo'
        : message.kind === 'voice'
          ? '🎙️ Voice note'
          : message.kind === 'file'
            ? `📄 File${message.fileName ? `: ${message.fileName}` : ''}`
            : message.body.slice(0, 140) || 'New message';

    const onMessage = (message: ChatMessage): void => {
      addIncoming(message);
      // A message sent from one of our own devices may also have changed the
      // account state, so keep the local copy fresh.
      if (message.senderId === user?.id) {
        void refreshAccount();
        return;
      }
      if (message.kind === 'call') return;

      const chatOnScreen = pathnameRef.current === `/chat/${message.matchId}`;
      const visible = isAppVisible();
      const name = message.senderName?.trim() || conversationName(message.matchId);

      // Security notices are worth surfacing even while the chat is open: the
      // persisted system bubble alone is easy to miss mid-conversation.
      if (message.kind === 'system') {
        const kind = captureKindForBody(message.body);
        if (!markCapture(message.matchId, kind)) return;
        const action = captureAction(kind);
        toast.error('Capture blocked', {
          description: `${name} tried to ${action}. HobyMine blocked it.`,
          icon: '🛡️',
          duration: 6_000,
        });
        if (!visible || !chatOnScreen) {
          void showNotification({
            channel: 'messages',
            matchId: message.matchId,
            title: 'Capture blocked',
            body: `${name} tried to ${action}. HobyMine blocked it.`,
          });
        }
        return;
      }

      // Story likes and comments are delivered as chat messages too, but their
      // dedicated events already raise a richer alert with the story preview.
      if (message.story) return;

      // Everything else stays quiet while its conversation is on screen.
      if (visible && chatOnScreen) return;

      const preview = messagePreview(message);
      const firstName = name.split(' ')[0] || 'Someone';
      toast(`${firstName} sent you a message`, {
        description: preview,
        icon: '💬',
        duration: 5_200,
        action: {
          label: 'Open',
          onClick: () => navigate(`/chat/${message.matchId}`),
        },
      });
      if (!visible) {
        void showNotification({
          channel: 'messages',
          matchId: message.matchId,
          title: name,
          body: preview,
        });
      }
    };
    const onRead = (payload: { matchId: string; readerId: string; readAt: string }): void =>
      applyRead(payload.matchId, payload.readerId, payload.readAt);
    const onReaction = (payload: {
      matchId: string;
      messageId: string;
      reactions: ReactionSummary[];
    }): void => {
      if (!payload?.matchId || !payload?.messageId) return;
      applyReactions(payload.matchId, payload.messageId, payload.reactions ?? []);
    };
    const onReactionReceived = (payload: {
      matchId: string;
      messageId: string;
      emoji: string;
      fromUserId?: string;
      fromName?: string;
      preview?: string;
    }): void => {
      if (!payload?.matchId || !payload?.messageId || !payload?.emoji) return;
      // Never alert the person who reacted, even if an event is echoed back.
      if (payload.fromUserId === user?.id) return;

      const name = payload.fromName || 'Someone';
      const firstName = name.split(' ')[0] || 'Someone';
      const chatOnScreen = pathnameRef.current === `/chat/${payload.matchId}`;
      toast(`${firstName} reacted ${payload.emoji} to your message`, {
        description: payload.preview ? `“${payload.preview}”` : 'Open the chat to see it.',
        duration: 5_200,
        action: {
          label: 'Open',
          onClick: () => navigate(`/chat/${payload.matchId}`),
        },
      });
      if (!isAppVisible() || !chatOnScreen) {
        void showNotification({
          channel: 'messages',
          matchId: payload.matchId,
          title: `${name} reacted ${payload.emoji}`,
          body: payload.preview ? `To your message: ${payload.preview}` : 'To your message.',
        });
      }
    };
    const onTypingStart = (payload: { matchId: string; userId: string }): void => {
      if (payload.userId !== user?.id) setTyping(payload.matchId, true);
    };
    const onTypingStop = (payload: { matchId: string; userId: string }): void => {
      if (payload.userId !== user?.id) setTyping(payload.matchId, false);
    };
    const onSecurityAlert = (payload: CaptureAttemptAlert): void => {
      if (!payload?.matchId || !payload?.kind) return;
      // The server targets the other participant, but never alert somebody
      // about their own capture attempt if an event is ever echoed back.
      if (payload.fromUserId === user?.id) return;

      const call = useCallStore.getState();
      const inSameCall =
        call.matchId === payload.matchId &&
        call.status !== 'idle' &&
        call.status !== 'ended';

      // A video attempt is ephemeral and is handled by the in-call banner.
      if (payload.context === 'video' && inSameCall) {
        call.setCall({
          securityAlert: {
            kind: payload.kind,
            fromName: payload.fromName || 'The other person',
            at: Date.now(),
          },
        });
        return;
      }

      // Chat attempts also arrive as a persisted system message; only alert once.
      if (payload.context === 'chat' && !markCapture(payload.matchId, payload.kind)) return;

      const action = captureAction(payload.kind);
      const name = payload.fromName || 'The other person';
      toast.error('Capture blocked', {
        description: `${name} tried to ${action}. HobyMine blocked it.`,
        icon: '🛡️',
        duration: 6_000,
      });
      const chatOnScreen = pathnameRef.current === `/chat/${payload.matchId}`;
      if (!isAppVisible() || !chatOnScreen) {
        void showNotification({
          channel: payload.context === 'chat' ? 'messages' : 'activity',
          matchId: payload.matchId,
          title: 'Capture blocked',
          body: `${name} tried to ${action}. HobyMine blocked it.`,
        });
      }
    };
    const onMatch = (match: MatchSummary): void => {
      showMatch(match);
      void loadConversations();
      void showNotification({
        channel: 'activity',
        matchId: match.id,
        title: 'It’s a match 🎉',
        body: `You and ${match.user.name} liked each other. Say something!`,
      });
    };
    const onMatchRemoved = (payload: { matchId: string }): void => {
      removeMatch(payload.matchId);
      if (pathnameRef.current === `/chat/${payload.matchId}`) navigate('/matches');
    };
    const onSuperLike = (payload: { user: PublicUser }): void => {
      if (!payload?.user?.name) return;
      void loadLikes();
      // A Super Like gets the dedicated animated alert, not a plain toast.
      setSuperLikeAlert({
        id: `${payload.user.id}-${Date.now()}`,
        user: payload.user,
      });
      if (!isAppVisible()) {
        void showNotification({
          channel: 'activity',
          title: `${payload.user.name} super liked you ⭐`,
          body: 'They are serious about you. Open HobyMine to see who they are.',
        });
      }
    };
    /**
     * Somebody liked us. The like used to be invisible until the Likes screen
     * was reopened, so refresh the list and the badge straight away and alert
     * the member even when they are looking at another screen.
     */
    const onLikeReceived = (payload: { user: PublicUser }): void => {
      void loadLikes();
      if (!payload?.user?.name) return;
      const firstName = payload.user.name.split(' ')[0];
      // Plus members see who liked them, so the alert carries the full name and
      // the liker's photo. Free members keep the anonymous teaser.
      const isPlusMember = Boolean(user?.plus);
      const photo = payload.user.photos?.[0];
      const photoSrc = photo ? mediaUrl(photo) : null;
      const displayName = isPlusMember ? payload.user.name : firstName;
      toast(`${displayName} liked you`, {
        description: isPlusMember
          ? 'Open Likes to see their profile and like back.'
          : 'Open Likes to see them and like back.',
        icon:
          isPlusMember && photoSrc ? (
            <img
              src={photoSrc}
              alt=""
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            '💗'
          ),
        duration: 5_200,
        action: { label: 'View', onClick: () => navigate('/likes') },
      });
      if (!isAppVisible()) {
        void showNotification({
          channel: 'activity',
          title: `${displayName} liked you ❤️`,
          body: isPlusMember
            ? 'Open HobyMine to see their profile and like back.'
            : 'They are one like away from a match. Open HobyMine to see them.',
        });
      }
    };
    /**
     * A match posted a story. The rail updates instantly; nothing is shown
     * when the poster is not a match, because the server never sends it.
     */
    const onStoryNew = (payload: {
      userId: string;
      story: Story;
      author: PublicUser;
    }): void => {
      if (!payload?.story || !payload?.author) return;
      receiveStory(payload);
    };
    /** The author's like tally changed. View counts are never sent. */
    const onStoryActivity = (payload: { storyId: string; likes: number }): void => {
      if (!payload?.storyId) return;
      applyStoryActivity(payload);
    };
    /**
     * Someone liked our story. The like also lands in the conversation as a
     * message with the story preview; this event adds the instant alert.
     */
    const onStoryLike = (payload: {
      storyId: string;
      matchId: string;
      fromName?: string;
      body?: string;
    }): void => {
      if (!payload?.storyId) return;
      const name = payload.fromName?.split(' ')[0] || 'Someone';
      toast(`${name} liked your story`, {
        description: 'Open the chat to reply.',
        icon: '❤️',
        duration: 5_200,
        action: {
          label: 'Open',
          onClick: () => navigate(`/chat/${payload.matchId}`),
        },
      });
      if (!isAppVisible()) {
        void showNotification({
          channel: 'activity',
          matchId: payload.matchId,
          title: `${name} liked your story ❤️`,
          body: 'Tap to see it and keep the conversation going.',
        });
      }
    };
    /**
     * Someone commented on our story. The comment also lands in the chat as a
     * message; this event gives the author the same instant alert as a like,
     * with a thumbnail of the story and the comment text.
     */
    const onStoryComment = (payload: {
      storyId: string;
      matchId: string;
      fromName?: string;
      body?: string;
      story?: { mediaUrl: string | null; caption: string } | null;
    }): void => {
      if (!payload?.storyId) return;
      const name = payload.fromName?.split(' ')[0] || 'Someone';
      const preview = payload.story?.mediaUrl ? mediaUrl(payload.story.mediaUrl) : null;
      toast(`${name} commented on your story`, {
        description: payload.body || 'Open the chat to read it.',
        icon: preview ? (
          <img src={preview} alt="" className="h-9 w-9 rounded-lg object-cover" />
        ) : (
          '💬'
        ),
        duration: 5_200,
        action: {
          label: 'Open',
          onClick: () => navigate(`/chat/${payload.matchId}`),
        },
      });
      if (!isAppVisible()) {
        void showNotification({
          channel: 'activity',
          matchId: payload.matchId,
          title: `${name} commented on your story`,
          body: payload.body || 'Tap to read the comment and reply.',
        });
      }
    };
    const onProfileView = (payload: ProfileViewEvent): void => {
      // Plus members see the visitor's identity; free members keep the blurred
      // "someone viewed you" alert.
      const isPlusMember = Boolean(user?.plus);
      const viewer = isPlusMember ? payload.viewer : null;
      const name = viewer?.name;
      const photo = viewer?.photos?.[0];
      const photoSrc = photo ? mediaUrl(photo) : null;
      const title = name ? `${name} viewed your profile` : 'Someone viewed your profile';
      toast(title, {
        description: name
          ? 'Open Profile views to see their profile.'
          : 'Upgrade to Plus to reveal every visitor.',
        icon: photoSrc ? (
          <img src={photoSrc} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <Eye className="h-4 w-4" />
        ),
        duration: 5200,
        action: {
          label: 'View',
          onClick: () => navigate('/likes?tab=views'),
        },
      });
      if (!isAppVisible()) {
        void showNotification({
          channel: 'activity',
          title: name ? `${name} viewed your profile` : 'Someone viewed your profile',
          body: name
            ? 'Open HobyMine to see their profile.'
            : 'Open HobyMine to see your visitors. Plus reveals every identity.',
        });
      }
    };
    const onConnectError = (): void => {
      // The socket client reconnects automatically; avoid noisy toasts.
    };
    const onDisconnect = (): void => {
      toast('Connection lost — reconnecting…', { id: 'hobymine-connection' });
    };

    socket.on('connect', onConnect);
    socket.on('message:new', onMessage);
    socket.on('message:read', onRead);
    socket.on('message:reaction', onReaction);
    socket.on('message:reaction:received', onReactionReceived);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('security:capture-attempt', onSecurityAlert);
    socket.on('match:new', onMatch);
    socket.on('match:removed', onMatchRemoved);
    socket.on('superlike:received', onSuperLike);
    socket.on('like:received', onLikeReceived);
    socket.on('story:new', onStoryNew);
    socket.on('story:activity', onStoryActivity);
    socket.on('story:like', onStoryLike);
    socket.on('story:comment', onStoryComment);
    socket.on('profile:viewed', onProfileView);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) onConnect();

    void loadConversations();
    const presence = window.setInterval(() => {
      if (socket.connected) socket.emit('presence:ping');
    }, 60_000);

    return () => {
      window.clearInterval(presence);
      document.removeEventListener('visibilitychange', onVisibility);
      socket.off('connect', onConnect);
      socket.off('message:new', onMessage);
      socket.off('message:read', onRead);
      socket.off('message:reaction', onReaction);
      socket.off('message:reaction:received', onReactionReceived);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('security:capture-attempt', onSecurityAlert);
      socket.off('match:new', onMatch);
      socket.off('match:removed', onMatchRemoved);
      socket.off('superlike:received', onSuperLike);
      socket.off('like:received', onLikeReceived);
      socket.off('story:new', onStoryNew);
      socket.off('story:activity', onStoryActivity);
      socket.off('story:like', onStoryLike);
      socket.off('story:comment', onStoryComment);
      socket.off('profile:viewed', onProfileView);
      socket.off('connect_error', onConnectError);
      socket.off('disconnect', onDisconnect);
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.id, apiBase]);

  if (!user) return null;

  // Chat is an immersive, full-bleed screen: no app sidebar, no top bar and no
  // bottom navigation competing with the conversation (WhatsApp-style).
  if (isChat) {
    return (
      <div className="relative h-dvh w-full overflow-hidden bg-canvas text-white">
        <div className="app-ambient" aria-hidden="true" />
        <div className="relative flex h-full w-full flex-col">
          <Outlet />
        </div>
        <VoiceCallOverlay />
        <NewMatchModal />
        <ReportDialog />
        <BlockDialog />
        <PaywallModal />
        <SuperLikeAlert
          alert={superLikeAlert}
          onDismiss={dismissSuperLike}
          onOpen={openSuperLike}
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-canvas text-white lg:block lg:h-auto lg:min-h-dvh lg:overflow-visible">
      <div className="app-ambient" aria-hidden="true" />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[14.75rem] flex-col border-r border-white/[0.06] bg-ink-900/80 backdrop-blur-2xl lg:flex">
        <div className="flex h-[4.75rem] items-center border-b border-white/[0.05] px-6">
          <Link
            to="/discover"
            aria-label="HobyMine home"
            className="rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-neon/40"
          >
            <Logo />
          </Link>
        </div>

        <nav className="flex-1 space-y-1 px-3 pt-5">
          {NAV_ITEMS.map((item) => {
            const active =
              item.to === '/matches'
                ? location.pathname.startsWith('/matches') ||
                  location.pathname.startsWith('/chat')
                : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition',
                  active
                    ? 'bg-white/[0.06] text-white'
                    : 'text-ink-400 hover:bg-white/[0.03] hover:text-white',
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-neon shadow-glow-sm" />
                )}
                <item.icon
                  className={cn(
                    'h-[1.125rem] w-[1.125rem]',
                    active ? 'text-neon' : 'text-ink-500 group-hover:text-ink-300',
                  )}
                />
                {item.label}
                {item.to === '/matches' && unreadTotal > 0 && (
                  <span className="ml-auto rounded-full bg-neon px-2 py-0.5 text-[0.625rem] font-bold text-ink-950">
                    {unreadTotal}
                  </span>
                )}
                {item.to === '/likes' && likesYouCount > 0 && (
                  <span className="ml-auto rounded-full border border-neon/25 bg-neon/10 px-2 py-0.5 text-[0.625rem] font-bold text-neon">
                    {likesYouCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="space-y-4 p-4">
          {user.plus ? (
            <Link
              to="/plus"
              className="block overflow-hidden rounded-2xl border border-neon/20 bg-gradient-to-br from-neon/10 via-transparent to-sky/5 p-4 transition hover:border-neon/40"
            >
              <div className="flex items-center gap-2 text-neon">
                <Zap className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-[0.14em]">
                  Plus active
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-300">
                Boost, unlimited likes and read receipts are unlocked.
              </p>
            </Link>
          ) : (
            <Link
              to="/plus"
              className="group relative block overflow-hidden rounded-2xl border border-neon/25 bg-gradient-to-br from-neon/[0.13] via-ink-850 to-sky/[0.06] p-4 transition hover:border-neon/50"
            >
              <Sparkles className="mb-2 h-5 w-5 text-neon" />
              <p className="text-sm font-bold text-white">HobyMine Plus</p>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-300">
                See who likes you. Boost. Read receipts.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-neon">
                Explore plans <span aria-hidden="true">→</span>
              </span>
              <span className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-neon/10 blur-2xl transition group-hover:bg-neon/20" />
            </Link>
          )}

          <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
            <Link to="/profile" className="flex min-w-0 flex-1 items-center gap-2.5">
              <Avatar
                name={user.name}
                photos={user.photos}
                id={user.id}
                size="sm"
                online
              />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">{user.name}</p>
                <p className="truncate text-[0.625rem] text-ink-500">
                  {user.plus ? 'HobyMine Plus member' : 'Free account'}
                </p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => {
                void clearBackgroundSession();
                logout();
              }}
              className="rounded-lg p-2 text-ink-500 transition hover:bg-white/5 hover:text-white"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <header className="relative z-30 shrink-0 border-b border-white/[0.07] bg-canvas/80 shadow-float backdrop-blur-2xl backdrop-saturate-150 safe-left safe-right safe-top lg:hidden">
        <div className="mx-auto flex h-[3.25rem] w-full max-w-[73.75rem] items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            to="/discover"
            aria-label="HobyMine home"
            className="flex min-w-0 items-center rounded-lg py-2 outline-none focus-visible:ring-2 focus-visible:ring-neon/40"
          >
            <Logo compact />
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {likesYouCount > 0 && (
              <Link
                to="/likes"
                aria-label={`${likesYouCount} ${likesYouCount === 1 ? 'person likes' : 'people like'} you`}
                className="flex h-8 items-center gap-1.5 rounded-full border border-neon/20 bg-neon/[0.08] px-3 text-[0.6875rem] font-semibold text-neon transition hover:bg-neon/[0.14]"
              >
                <Heart className="h-3.5 w-3.5 fill-neon" />
                {likesYouCount}
              </Link>
            )}
            <Link
              to="/plus"
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.6875rem] font-semibold transition',
                user.plus
                  ? 'border-neon/30 bg-neon/10 text-neon'
                  : 'border-white/[0.08] bg-white/[0.04] text-ink-200 hover:border-white/15 hover:bg-white/[0.07]',
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {user.plus ? 'Plus' : 'Get Plus'}
            </Link>
          </div>
        </div>
      </header>

      <main
        ref={mainRef}
        className={cn(
          'relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain lg:min-h-0 lg:overflow-visible lg:pl-[14.75rem]',
          isDiscover && 'max-lg:overflow-y-auto',
        )}
      >
        <div
          className={cn(
            'mx-auto w-full max-w-[73.75rem] px-4 pb-5 pt-3 sm:px-6 sm:pb-6 sm:pt-4 lg:px-8 lg:py-8',
            isDiscover &&
              'max-lg:flex max-lg:min-h-full max-lg:flex-col max-lg:pb-2 max-lg:pt-2',
          )}
        >
          <Outlet />
        </div>
      </main>

      <nav className="bottom-nav relative z-40 shrink-0 border-t border-white/[0.07] bg-canvas/90 safe-bottom-nav safe-left safe-right backdrop-blur-2xl lg:hidden">
        <div className="mx-auto grid min-h-[3.25rem] max-w-md grid-cols-4 px-1.5 pb-1 pt-1">
          {NAV_ITEMS.map((item) => {
            const active =
              item.to === '/matches'
                ? location.pathname.startsWith('/matches') ||
                  location.pathname.startsWith('/chat')
                : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className="relative flex flex-col items-center gap-1 rounded-xl px-0.5 py-1.5"
              >
                <span className="relative">
                  <item.icon
                    className={cn(
                      'h-5 w-5 transition',
                      active ? 'text-neon' : 'text-ink-500',
                    )}
                    strokeWidth={active ? 2.2 : 1.8}
                  />
                  {item.to === '/matches' && unreadTotal > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neon px-1 text-[0.5625rem] font-bold text-ink-950">
                      {unreadTotal}
                    </span>
                  )}
                  {item.to === '/likes' && likesYouCount > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neon px-1 text-[0.5625rem] font-bold text-ink-950">
                      {likesYouCount}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'bottom-nav-label text-[0.625rem] font-medium',
                    active ? 'text-neon' : 'text-ink-500',
                  )}
                >
                  {item.label}
                </span>
                {active && (
                  <span className="absolute -top-1.5 h-0.5 w-5 rounded-full bg-neon" />
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      <div className="pointer-events-none fixed bottom-24 right-4 z-30 hidden lg:bottom-6 lg:block">
        <div className="glass flex items-center gap-2 rounded-full px-3 py-2 text-[0.6875rem] text-ink-300">
          <MessageCircle className="h-3.5 w-3.5 text-neon" />
          Real-time chat connected
        </div>
      </div>

      <VoiceCallOverlay />
      <NewMatchModal />
      <ReportDialog />
      <BlockDialog />
      <PaywallModal />
      <SuperLikeAlert
        alert={superLikeAlert}
        onDismiss={dismissSuperLike}
        onOpen={openSuperLike}
      />
    </div>
  );
}

export function AppSplash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas safe-bottom safe-top">
      <div className="relative">
        <span className="absolute inset-0 animate-pulse-ring rounded-full border border-neon/40" />
        <LogoMark className="h-14 w-14" />
      </div>
      <p className="mt-6 text-[0.6875rem] font-semibold uppercase tracking-[0.32em] text-ink-500">
        Find your frequency
      </p>
    </div>
  );
}

import {
  ArrowLeft,
  Ban,
  Check,
  FileText,
  Flag,
  ImagePlus,
  Info,
  Loader2,
  Lock,
  MessageCircle,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  Send,
  ShieldCheck,
  Smile,
  UserX,
  Video,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { format } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { FullProfile } from '../components/FullProfile';
import { Modal } from '../components/Modal';
import { ProfileSheet, useProfileViewer } from '../components/ProfileSheet';
import { SafetyActions } from '../components/SafetyActions';
import { Skeleton } from '../components/Spinner';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { EmojiPicker } from '../components/chat/EmojiPicker';
import { MessageBubble } from '../components/chat/MessageBubble';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import { api, ApiClientError } from '../lib/api';
import { acquireCaptureGuard, isAndroidNative } from '../lib/captureGuard';
import { callManager } from '../lib/callManager';
import { mediaUrl } from '../lib/media';
import { prepareImageForUpload } from '../lib/image';
import { ensureMicrophone, ensurePhotoAccess } from '../lib/permissions';
import { registerOverlay } from '../lib/native';
import {
  isRecordingSupported,
  normalizeRecordingType,
  pickRecorderMimeType,
  recordingFile,
} from '../lib/recorder';
import { formatDuration, formatDayLabel, lastActiveLabel } from '../lib/utils';
import { getSocket, onSocketReady } from '../lib/socket';
import { useCallAllowance } from '../hooks/useCallAllowance';
import { useAuthStore } from '../store/auth';
import { useCallStore } from '../store/call';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import type { ChatMessage, MatchSummary } from '../types';

const EMPTY_MESSAGES: ChatMessage[] = [];

interface MessageGroup {
  key: string;
  label: string;
  messages: ChatMessage[];
}

const ICEBREAKERS = [
  'Important question: coffee, cocktails, or chaos?',
  'What does your ideal Saturday look like?',
];

/** Documents the chat composer offers; the API validates the real MIME type. */
const DOCUMENT_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,.rtf,.json,.zip,.rar,.7z';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function ChatPage() {
  const { matchId = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const conversation = useChatStore((state) =>
    state.conversations.find((entry) => entry.id === matchId),
  );
  const messages = useChatStore((state) => state.messages[matchId]) ?? EMPTY_MESSAGES;
  const typing = useChatStore((state) => Boolean(state.typing[matchId]));
  const loadingMessages = useChatStore((state) => Boolean(state.loadingMessages[matchId]));
  const loadMatch = useChatStore((state) => state.loadMatch);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const reactToMessage = useChatStore((state) => state.reactToMessage);
  const setActive = useChatStore((state) => state.setActive);
  const removeMatch = useChatStore((state) => state.removeMatch);
  const openReport = useUiStore((state) => state.openReport);
  const openBlock = useUiStore((state) => state.openBlock);
  const openPaywall = useUiStore((state) => state.openPaywall);
  const { allowance, videoAllowance, refresh: refreshAllowance } = useCallAllowance();
  const callStatus = useCallStore((state) => state.status);
  // The daily call budget changes after a call, so refresh it when the call ends.
  useEffect(() => {
    if (callStatus === 'idle') void refreshAllowance();
  }, [callStatus, refreshAllowance]);

  const [fetchedMatch, setFetchedMatch] = useState<MatchSummary | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [confirmUnmatch, setConfirmUnmatch] = useState(false);
  const [asideOpen, setAsideOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const profileViewer = useProfileViewer();

  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimer = useRef<number | undefined>(undefined);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelRef = useRef(false);
  const recordSecondsRef = useRef(0);
  const recordTimer = useRef<number | undefined>(undefined);

  const match = conversation ?? fetchedMatch;
  const verified = Boolean(user?.verified);
  const readReceiptsUnlocked = Boolean(user?.plus && user.readReceipts);

  // While this conversation is on screen, Android excludes it from
  // screenshots and screen recordings, and reports any blocked attempt.
  useEffect(() => {
    if (!matchId) return;
    return acquireCaptureGuard('chat', {
      matchId,
      peerName: match?.user.name,
    });
  }, [matchId, match?.user.name]);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    setLoadingMatch(true);
    setFetchedMatch(null);
    setActive(matchId);
    void loadMessages(matchId);
    void loadMatch(matchId).then((result) => {
      if (cancelled) return;
      setFetchedMatch(result);
      setLoadingMatch(false);
    });
    const socket = getSocket();
    socket?.emit('match:join', { matchId });

    // Re-join the room and catch up on anything sent while this device was
    // offline — the same conversation stays in sync across devices.
    const onReconnect = (): void => {
      socket?.emit('match:join', { matchId });
      void loadMessages(matchId);
      void loadMatch(matchId);
    };
    const unsubscribe = onSocketReady((ready) => {
      ready.emit('match:join', { matchId });
      ready.on('connect', onReconnect);
    });

    return () => {
      cancelled = true;
      setActive(null);
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      socket?.emit('typing:stop', { matchId });
      socket?.off('connect', onReconnect);
      unsubscribe();
    };
  }, [matchId, loadMatch, loadMessages, setActive]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, typing]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(120, element.scrollHeight)}px`;
  }, [draft]);

  useEffect(() => {
    return () => {
      if (recordTimer.current) window.clearInterval(recordTimer.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // The hardware back button closes the match-details drawer first.
  useEffect(() => {
    if (!asideOpen) return;
    return registerOverlay(() => setAsideOpen(false));
  }, [asideOpen]);

  const groups = useMemo<MessageGroup[]>(() => {
    const result: MessageGroup[] = [];
    for (const message of messages) {
      const key = format(new Date(message.createdAt), 'yyyy-MM-dd');
      const last = result[result.length - 1];
      if (last && last.key === key) {
        last.messages.push(message);
      } else {
        result.push({
          key,
          label: formatDayLabel(message.createdAt),
          messages: [message],
        });
      }
    }
    return result;
  }, [messages]);

  const notifyTyping = (): void => {
    const socket = getSocket();
    if (!socket || !matchId) return;
    socket.emit('typing:start', { matchId });
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      socket.emit('typing:stop', { matchId });
    }, 1400);
  };

  const stopTyping = (): void => {
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    getSocket()?.emit('typing:stop', { matchId });
  };

  const submitText = async (): Promise<void> => {
    const body = draft.trim();
    if (!body || !matchId || sending) return;
    setDraft('');
    setSending(true);
    stopTyping();
    try {
      await sendMessage(matchId, { kind: 'text', body });
    } catch (error) {
      setDraft(body);
      toast.error(error instanceof ApiClientError ? error.message : 'Message failed to send');
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const uploadImage = async (file: File): Promise<void> => {
    if (!matchId) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Images must be under 10 MB');
      return;
    }
    const access = await ensurePhotoAccess();
    if (!access.granted && access.reason === 'denied') {
      toast.error('Photo access is needed to send pictures', {
        description: 'Allow photo access in Android settings and try again.',
      });
      return;
    }
    setUploading(true);
    try {
      // Re-encode to JPEG first so every device can show the picture.
      const prepared = await prepareImageForUpload(file);
      const form = new FormData();
      form.append('file', prepared.file);
      const data = await api.upload<{ url: string; kind: string }>('/api/uploads', form);
      if (prepared.previewUrl) URL.revokeObjectURL(prepared.previewUrl);
      await sendMessage(matchId, { kind: 'image', mediaUrl: data.url });
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not upload image');
    } finally {
      setUploading(false);
    }
  };

  const uploadDocument = async (file: File): Promise<void> => {
    if (!matchId) return;
    if (file.type.startsWith('image/')) {
      await uploadImage(file);
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error('Files must be under 10 MB');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const data = await api.upload<{
        url: string;
        kind: string;
        name?: string;
        size?: number;
      }>('/api/uploads', form);
      if (data.kind === 'image') {
        await sendMessage(matchId, { kind: 'image', mediaUrl: data.url });
        return;
      }
      if (data.kind !== 'file') {
        toast.error('Choose a document to send');
        return;
      }
      await sendMessage(matchId, {
        kind: 'file',
        mediaUrl: data.url,
        fileName: data.name ?? file.name,
        fileSize: data.size ?? file.size,
      });
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not upload the document',
      );
    } finally {
      setUploading(false);
    }
  };

  const insertEmoji = (emoji: string): void => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? draft.length;
    const end = textarea?.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    setDraft(next);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      const caret = start + emoji.length;
      textarea?.setSelectionRange(caret, caret);
    });
    if (next.trim()) notifyTyping();
  };

  const startRecording = async (): Promise<void> => {
    if (!isRecordingSupported()) {
      toast.error('Voice recording is not supported on this device');
      return;
    }
    const permission = await ensureMicrophone();
    if (!permission.granted) {
      if (permission.reason === 'unavailable') {
        toast.error('No microphone available on this device');
      } else {
        toast.error('Microphone access is needed for voice notes', {
          description: 'Enable the microphone permission in Android settings and try again.',
        });
      }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Pick a container the device actually supports, then upload the plain
      // base type (no codec parameters) so the server stores it correctly.
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        if (recordTimer.current) window.clearInterval(recordTimer.current);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
        const recorded = (recorder.mimeType || mimeType || '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        // MediaRecorder falls back to "video/webm" when no audio container is
        // supported — the server only accepts audio, so keep it an audio type.
        const baseType = normalizeRecordingType(recorded);
        const blob = new Blob(chunksRef.current, { type: baseType });
        const duration = recordSecondsRef.current;
        setRecordSeconds(0);
        recordSecondsRef.current = 0;
        if (cancelRef.current || blob.size === 0) return;
        void (async () => {
          setUploading(true);
          try {
            const file = recordingFile(blob, baseType);
            const form = new FormData();
            form.append('file', file);
            const data = await api.upload<{ url: string }>('/api/uploads', form);
            await sendMessage(matchId, {
              kind: 'voice',
              mediaUrl: data.url,
              duration: Math.max(1, duration),
            });
          } catch (error) {
            toast.error(
              error instanceof ApiClientError ? error.message : 'Could not send voice note',
            );
          } finally {
            setUploading(false);
          }
        })();
      };

      recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      recordSecondsRef.current = 0;
      recordTimer.current = window.setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
        if (recordSecondsRef.current >= 120) recorder.stop();
      }, 1000);
    } catch {
      toast.error('Microphone permission was denied');
    }
  };

  const stopRecording = (cancel: boolean): void => {
    cancelRef.current = cancel;
    recorderRef.current?.stop();
  };

  const unmatch = async (): Promise<void> => {
    try {
      await api.delete(`/api/matches/${matchId}`);
      removeMatch(matchId);
      toast.success('Match removed');
      navigate('/matches');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not unmatch');
    }
  };

  if (!match) {
    if (loadingMatch) {
      return (
        <div className="flex h-full w-full flex-col safe-top">
          <div className="flex h-[3.25rem] shrink-0 items-center gap-3 border-b border-white/[0.06] px-4">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-4 w-40 rounded-full" />
          </div>
          <div className="flex-1 space-y-3 p-4">
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            <Skeleton className="h-10 w-3/5 rounded-2xl" />
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <EmptyState
          icon={MessageCircle}
          title="Conversation not found"
          description="This match may have been removed, or you blocked each other."
          action={
            <Link to="/matches" className="btn-primary">
              Back to matches
            </Link>
          }
        />
      </div>
    );
  }

  const requireVerification = (): boolean => {
    if (verified) return true;
    toast.error('Verify your profile first', {
      description: 'Discovery, messaging and calls unlock after a quick selfie check.',
      action: { label: 'Verify now', onClick: () => navigate('/verify') },
    });
    return false;
  };

  const startVoiceCall = (): void => {
    if (!requireVerification()) return;
    if (allowance && !allowance.canCall) {
      toast.error('Daily free call limit reached', {
        description:
          'Free members get a few calls a day. HobyMine Plus members can call without limits.',
        action: { label: 'See plans', onClick: () => navigate('/plus') },
      });
      return;
    }
    void callManager.startCall(match.id, match.user);
  };

  const startVideoCall = (): void => {
    if (!requireVerification()) return;
    if (videoAllowance && !videoAllowance.canVideo) {
      openPaywall({ reason: 'video_limit' });
      return;
    }
    void callManager.startCall(match.id, match.user, {
      mode: 'video',
      videoSecondsLeft:
        videoAllowance?.plan === 'plus' || user?.plus
          ? null
          : (videoAllowance?.remainingSeconds ?? 60),
    });
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-canvas">
      <header className="shrink-0 border-b border-white/[0.06] bg-canvas/85 backdrop-blur-2xl safe-top">
        <div className="flex min-h-[3.25rem] items-center gap-1 py-1.5 px-2 sm:gap-3 sm:px-4">
          <Link
            to="/matches"
            className="shrink-0 rounded-full p-2 text-ink-300 transition hover:bg-white/5 hover:text-white"
            aria-label="Back to matches"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <button
            type="button"
            onClick={() => profileViewer.openProfile(match.user)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-label={`Open ${match.user.name}'s profile`}
          >
            <Avatar
              name={match.user.name}
              photos={match.user.photos}
              id={match.user.id}
              size="md"
              online={match.user.online}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <p
                  className="min-w-0 break-words text-sm font-semibold leading-tight text-white"
                  title={match.user.name}
                >
                  {match.user.name}
                </p>
                {match.user.verified && <VerifiedBadge size="sm" />}
                {match.user.plus && (
                  <span className="rounded bg-neon/10 px-1 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-neon">
                    Plus
                  </span>
                )}
                {isAndroidNative() && (
                  <span
                    className="inline-flex items-center gap-1 rounded bg-white/[0.06] px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-ink-300"
                    title="Screenshots and screen recording are blocked in this chat"
                  >
                    <ShieldCheck className="h-2.5 w-2.5 text-neon" aria-hidden="true" />
                    <span className="hidden sm:inline">Protected</span>
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[0.6875rem] text-ink-400">
                {typing ? (
                  <span className="text-neon">typing…</span>
                ) : match.user.online ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-neon" />
                    Active now
                  </span>
                ) : (
                  <span>Last seen {lastActiveLabel(match.user.lastActiveAt)}</span>
                )}
              </p>
            </div>
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {!readReceiptsUnlocked && (
              <Link
                to="/plus"
                className="hidden items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[0.625rem] font-medium text-ink-300 transition hover:border-neon/30 hover:text-white sm:flex"
                title="Read receipts are a HobyMine Plus feature"
              >
                <Lock className="h-3 w-3 text-neon" />
                Read receipts
              </Link>
            )}
            <button
              type="button"
              onClick={() => setAsideOpen(true)}
              className="rounded-full p-2 text-ink-300 transition hover:bg-white/5 hover:text-white sm:p-2.5"
              aria-label="Match details"
              title="Match details"
            >
              <Info className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(true);
                setConfirmUnmatch(false);
              }}
              className="rounded-full p-2 text-ink-300 transition hover:bg-white/5 hover:text-white sm:p-2.5"
              aria-label="Conversation options"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={startVoiceCall}
              className="rounded-full p-2 text-ink-300 transition hover:bg-neon/20 hover:text-neon sm:p-2.5"
              aria-label={`Call ${match.user.name.split(' ')[0]}`}
              title="Start a 1-on-1 voice call"
            >
              <Phone className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={startVideoCall}
              className="rounded-full p-2 text-ink-300 transition hover:bg-neon/20 hover:text-neon sm:p-2.5"
              aria-label={`Video call ${match.user.name.split(' ')[0]}`}
              title={
                videoAllowance?.plan === 'plus' || user?.plus
                  ? 'Start an unlimited video call'
                  : videoAllowance?.canVideo
                    ? `Start a video call (${formatDuration(videoAllowance.remainingSeconds)} free left)`
                    : 'Video calling is a HobyMine Plus feature'
              }
            >
              <Video className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {allowance?.plan === 'free' && (
        <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.05] bg-canvas/60 px-3 py-1.5 text-[0.625rem] text-ink-400 sm:px-4">
          <Phone className="h-3 w-3 shrink-0 text-neon/80" />
          <span className="min-w-0 truncate">
            {allowance.canCall
              ? `Free plan: ${allowance.remainingCalls} of ${allowance.callsLimit} calls left today. You can always receive calls.`
              : 'Daily free call limit reached. You can still receive calls.'}
          </span>
        </div>
      )}

      {videoAllowance?.plan === 'free' && (
        <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.05] bg-canvas/60 px-3 py-1.5 text-[0.625rem] text-ink-400 sm:px-4">
          <Video className="h-3 w-3 shrink-0 text-neon/80" />
          <span className="min-w-0 flex-1 truncate">
            {videoAllowance.canVideo
              ? `Free video trial: ${formatDuration(videoAllowance.remainingSeconds)} left. Plus members call without limits.`
              : 'Free video minute used. Video calling is a HobyMine Plus feature.'}
          </span>
          {!videoAllowance.canVideo ? (
            <button
              type="button"
              onClick={() => openPaywall({ reason: 'video_limit' })}
              className="shrink-0 rounded-full border border-neon/30 bg-neon/10 px-2 py-0.5 text-[0.5625rem] font-semibold text-neon transition hover:bg-neon/20"
            >
              Get Plus
            </button>
          ) : (
            <span className="shrink-0 font-semibold text-neon">1 min free</span>
          )}
        </div>
      )}

      <div className="chat-canvas min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-3 pb-4 pt-3 sm:px-5 sm:pb-5">
          {loadingMessages && messages.length === 0 ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-2/3 rounded-2xl" />
              <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
              <Skeleton className="h-10 w-3/5 rounded-2xl" />
            </div>
          ) : messages.length === 0 ? (
            <motion.div
              className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="relative">
                <span className="absolute inset-0 animate-pulse-ring rounded-full border border-neon/30" />
                <Avatar
                  name={match.user.name}
                  photos={match.user.photos}
                  id={match.user.id}
                  size="2xl"
                  online={match.user.online}
                />
              </div>
              <h2 className="mt-5 text-xl font-bold text-white">
                You matched with {match.user.name.split(' ')[0]}
              </h2>
              <p className="mt-2 max-w-xs text-xs leading-relaxed text-ink-400">
                You both swiped right. Break the ice with something more interesting than
                “hey”.
              </p>
              <div className="mt-6 w-full max-w-sm space-y-2">
                {ICEBREAKERS.map((line) => (
                  <button
                    key={line}
                    type="button"
                    onClick={() => {
                      setDraft(line);
                      textareaRef.current?.focus();
                    }}
                    className="w-full rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-left text-xs text-ink-200 transition hover:border-neon/30 hover:bg-neon/[0.05] hover:text-white"
                  >
                    {line}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.key} className="space-y-2.5">
                  <div className="flex items-center gap-3 py-1">
                    <span className="h-px flex-1 bg-white/[0.05]" />
                    <span className="text-[0.5625rem] font-medium uppercase tracking-wider text-ink-500">
                      {group.label}
                    </span>
                    <span className="h-px flex-1 bg-white/[0.05]" />
                  </div>
                  {group.messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isMine={message.senderId === user?.id}
                      peerName={match.user.name}
                      readReceiptsUnlocked={readReceiptsUnlocked}
                      onImageClick={setLightbox}
                      onReact={(messageId, emoji) =>
                        void reactToMessage(matchId, messageId, emoji)
                      }
                    />
                  ))}
                </div>
              ))}
              <AnimatePresence>
                {typing && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <TypingIndicator />
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/[0.06] bg-canvas/90 px-3 pt-2.5 safe-bottom-composer sm:px-4">
        <div className="mx-auto w-full max-w-3xl">
          {verified ? (
            <>
              {uploading && (
                <div className="mb-2 flex items-center gap-2 text-[0.6875rem] text-ink-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-neon" />
                  Uploading attachment…
                </div>
              )}

              {recording ? (
                <div className="flex items-center gap-3 rounded-2xl border border-rose/25 bg-rose/[0.06] px-3 py-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose opacity-70" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose" />
                  </span>
                  <span className="text-xs font-semibold text-white">
                    {formatDuration(recordSeconds)}
                  </span>
                  <div className="flex flex-1 items-center gap-[0.1875rem] overflow-hidden">
                    {Array.from({ length: 22 }, (_, index) => (
                      <span
                        key={index}
                        className="w-[0.1875rem] animate-pulse rounded-full bg-rose/60"
                        style={{
                          height: `${5 + ((index * 7) % 18)}px`,
                          animationDelay: `${index * 0.05}s`,
                        }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => stopRecording(true)}
                    className="rounded-full p-2 text-ink-300 transition hover:bg-white/5 hover:text-white"
                    aria-label="Cancel recording"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => stopRecording(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-neon text-ink-950 shadow-glow-sm"
                    aria-label="Send voice note"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="relative flex items-end gap-2">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void uploadImage(file);
                    }}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={DOCUMENT_ACCEPT}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void uploadDocument(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEmojiOpen(false);
                      setAttachOpen(true);
                    }}
                    disabled={uploading}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-ink-300 transition hover:border-neon/30 hover:text-neon disabled:opacity-40"
                    aria-label="Add an attachment"
                    title="Send a photo or document"
                  >
                    <Paperclip className="h-[1.125rem] w-[1.125rem]" />
                  </button>

                  <div className="relative flex min-w-0 flex-1 items-end rounded-2xl border border-white/8 bg-white/[0.03] py-2 pl-3 pr-1 transition focus-within:border-neon/30">
                    <EmojiPicker
                      open={emojiOpen}
                      onClose={() => setEmojiOpen(false)}
                      onSelect={insertEmoji}
                    />
                    <textarea
                      ref={textareaRef}
                      value={draft}
                      rows={1}
                      maxLength={2000}
                      onChange={(event) => {
                        setDraft(event.target.value);
                        if (event.target.value.trim()) notifyTyping();
                        else stopTyping();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void submitText();
                        }
                      }}
                      placeholder={`Message ${match.user.name.split(' ')[0]}…`}
                      className="max-h-[7.5rem] w-full resize-none bg-transparent text-[0.8125rem] leading-relaxed text-white placeholder:text-ink-500 focus:outline-none"
                      aria-label="Message"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAttachOpen(false);
                        setEmojiOpen((open) => !open);
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center self-end rounded-full text-ink-400 transition hover:bg-white/5 hover:text-neon"
                      aria-label="Open emoji picker"
                      aria-expanded={emojiOpen}
                    >
                      <Smile className="h-[1.125rem] w-[1.125rem]" />
                    </button>
                  </div>

                  {draft.trim() ? (
                    <button
                      type="button"
                      onClick={() => void submitText()}
                      disabled={sending}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neon-gradient text-ink-950 shadow-glow-sm transition active:scale-95 disabled:opacity-50"
                      aria-label="Send message"
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startRecording()}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neon-gradient text-ink-950 shadow-glow-sm transition active:scale-95 disabled:opacity-50"
                      aria-label="Record voice note"
                      title="Record a voice note"
                    >
                      <Mic className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
              <p className="mt-2 hidden px-1 text-[0.5625rem] text-ink-600 sm:block">
                Enter to send · Shift + Enter for a new line · Photos, documents and voice notes
                up to 10 MB
              </p>
            </>
          ) : (
            <Link
              to="/verify"
              className="flex items-center gap-3 rounded-2xl border border-neon/25 bg-neon/[0.06] px-3.5 py-3 transition hover:border-neon/40 hover:bg-neon/10"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neon/15 text-neon">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-white">
                  Verify to send messages
                </span>
                <span className="mt-0.5 block text-[0.625rem] leading-relaxed text-ink-400">
                  A quick selfie unlocks chatting, calling and Discovery.
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-neon px-3 py-1.5 text-[0.625rem] font-bold text-ink-950">
                Verify
              </span>
            </Link>
          )}
        </div>
      </div>

      <AnimatePresence>
        {asideOpen && (
          <>
            <motion.div
              key="chat-details-backdrop"
              className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAsideOpen(false)}
            />
            <motion.aside
              key="chat-details"
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[22.5rem] flex-col overflow-y-auto border-l border-white/[0.07] bg-canvas/95 backdrop-blur-2xl safe-bottom safe-top"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-canvas/95 px-4 py-3 backdrop-blur-2xl">
                <p className="text-xs font-semibold text-white">Match details</p>
                <button
                  type="button"
                  onClick={() => setAsideOpen(false)}
                  className="rounded-full p-2 text-ink-400 transition hover:bg-white/5 hover:text-white"
                  aria-label="Close match details"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4 p-4">
                <div className="rounded-3xl border border-white/[0.07] bg-ink-900/70 p-4">
                  <FullProfile
                    user={match.user}
                    photoClassName="aspect-[4/5]"
                    showPresence
                    footer={
                      <button
                        type="button"
                        onClick={() => profileViewer.openProfile(match.user)}
                        className="btn-ghost w-full py-2.5 text-xs"
                      >
                        <Info className="h-3.5 w-3.5" />
                        View Full Profile
                      </button>
                    }
                  />
                </div>

                <div className="panel p-4">
                  <h3 className="flex items-center gap-2 text-xs font-semibold text-white">
                    <ShieldCheck className="h-3.5 w-3.5 text-sky" />
                    Keep it safe
                  </h3>
                  <p className="mt-2 text-[0.65625rem] leading-relaxed text-ink-400">
                    Meet in public, tell a friend, and never send money. You can report or block
                    anyone from the menu at any time.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() =>
                        openReport({ id: match.user.id, name: match.user.name, matchId: match.id })
                      }
                      className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-rose hover:underline"
                    >
                      <Flag className="h-3 w-3" />
                      Report {match.user.name.split(' ')[0]}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openBlock({ id: match.user.id, name: match.user.name, matchId: match.id })
                      }
                      className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-rose hover:underline"
                    >
                      <Ban className="h-3 w-3" />
                      Block {match.user.name.split(' ')[0]}
                    </button>
                  </div>
                </div>

                {!readReceiptsUnlocked && (
                  <Link
                    to="/plus"
                    className="flex items-center gap-3 rounded-2xl border border-neon/20 bg-gradient-to-r from-neon/[0.08] to-ink-900 p-4 transition hover:border-neon/40"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neon/15">
                      <Lock className="h-4 w-4 text-neon" />
                    </div>
                    <div>
                      <p className="text-[0.6875rem] font-semibold text-white">Unlock read receipts</p>
                      <p className="text-[0.625rem] text-ink-400">Know the moment they read you.</p>
                    </div>
                  </Link>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <Modal
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Conversation options"
        description={
          confirmUnmatch
            ? 'This removes the match and deletes the chat for both of you.'
            : `Manage your chat with ${match.user.name}.`
        }
      >
        {confirmUnmatch ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-rose/20 bg-rose/[0.06] p-4 text-xs leading-relaxed text-ink-300">
              Unmatching is permanent. You won’t be able to message each other again.
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                className="btn-ghost flex-1"
                onClick={() => setConfirmUnmatch(false)}
              >
                Keep match
              </button>
              <button
                type="button"
                onClick={() => void unmatch()}
                className="flex-1 rounded-xl bg-rose px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Unmatch
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                profileViewer.openProfile(match.user);
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-left text-sm text-ink-200 transition hover:bg-white/5 hover:text-white"
            >
              <Info className="h-4 w-4 text-neon" />
              View Full Profile
            </button>
            {!readReceiptsUnlocked && (
              <Link
                to="/plus"
                className="flex w-full items-center gap-3 rounded-xl border border-neon/20 bg-neon/[0.06] px-4 py-3 text-left text-sm text-white transition hover:bg-neon/10"
              >
                <Lock className="h-4 w-4 text-neon" />
                Unlock read receipts
                <span className="ml-auto rounded-full bg-neon px-2 py-0.5 text-[0.5625rem] font-bold text-ink-950">
                  PLUS
                </span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                openReport({ id: match.user.id, name: match.user.name, matchId: match.id });
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-rose/15 bg-rose/[0.04] px-4 py-3 text-left text-sm text-rose transition hover:bg-rose/10"
            >
              <Flag className="h-4 w-4" />
              Report {match.user.name.split(' ')[0]}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                openBlock({ id: match.user.id, name: match.user.name, matchId: match.id });
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-rose/15 bg-rose/[0.04] px-4 py-3 text-left text-sm text-rose transition hover:bg-rose/10"
            >
              <Ban className="h-4 w-4" />
              Block {match.user.name.split(' ')[0]}
            </button>
            <button
              type="button"
              onClick={() => setConfirmUnmatch(true)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-ink-400 transition hover:bg-white/5 hover:text-white"
            >
              <UserX className="h-4 w-4" />
              Unmatch
            </button>
          </div>
        )}
      </Modal>

      <ProfileSheet
        user={profileViewer.profile}
        onClose={profileViewer.closeProfile}
        showPresence
        afterInterests={
          <SafetyActions
            target={{
              id: profileViewer.profile?.id ?? match.user.id,
              name: profileViewer.profile?.name ?? match.user.name,
              matchId: match.id,
            }}
            onAct={profileViewer.closeProfile}
          />
        }
        footer={
          <button
            type="button"
            className="btn-primary w-full"
            onClick={profileViewer.closeProfile}
          >
            <Check className="h-4 w-4" />
            Back to chat
          </button>
        }
      />

      <Modal
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        title="Send an attachment"
        description="Share a photo or a document up to 10 MB."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setAttachOpen(false);
              imageInputRef.current?.click();
            }}
            className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-left transition hover:border-neon/30 hover:bg-neon/[0.05]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neon/15 text-neon">
              <ImagePlus className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-white">Photo</span>
              <span className="mt-0.5 block text-[0.625rem] text-ink-400">
                JPG, PNG, GIF or WebP
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAttachOpen(false);
              fileInputRef.current?.click();
            }}
            className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-left transition hover:border-neon/30 hover:bg-neon/[0.05]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky/15 text-sky">
              <FileText className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-white">Document</span>
              <span className="mt-0.5 block text-[0.625rem] text-ink-400">
                PDF, Word, Excel, text, ZIP
              </span>
            </span>
          </button>
        </div>
      </Modal>

      <Modal
        open={Boolean(lightbox)}
        onClose={() => setLightbox(null)}
        title="Shared photo"
        className="max-w-2xl"
      >
        {lightbox && (
          <img
            src={mediaUrl(lightbox) ?? undefined}
            alt="Shared"
            className="max-h-[70vh] w-full rounded-2xl object-contain"
          />
        )}
      </Modal>
    </div>
  );
}

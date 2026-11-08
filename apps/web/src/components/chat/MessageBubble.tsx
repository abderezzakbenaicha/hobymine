import {
  Check,
  CheckCheck,
  CornerUpLeft,
  Download,
  FileText,
  Heart,
  ImageIcon,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { mediaUrl } from '../../lib/media';
import { containsPhoneNumber } from '../../lib/phoneSafety';
import { cn, formatBytes, formatClock } from '../../lib/utils';
import type { ChatMessage } from '../../types';
import { CallMessage } from './CallMessage';
import { ReactionPicker } from './ReactionPicker';
import { VoiceMessage } from './VoiceMessage';

const LONG_PRESS_MS = 450;

export function MessageBubble({
  message,
  isMine,
  peerName,
  readReceiptsUnlocked,
  onImageClick,
  onReact,
}: {
  message: ChatMessage;
  isMine: boolean;
  peerName?: string;
  readReceiptsUnlocked: boolean;
  onImageClick: (url: string) => void;
  onReact: (messageId: string, emoji: string | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pressTimer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);

  const read = Boolean(message.readAt);
  const showRead = read && readReceiptsUnlocked;
  // Uploaded media lives on the API host, not in the app bundle.
  const attachment = mediaUrl(message.mediaUrl);
  /** Snapshot of the story a reply or like refers to, shown as a preview. */
  const storyThumb = mediaUrl(message.story?.mediaUrl);
  const phoneWarning = containsPhoneNumber(message.body);

  const startPress = useCallback((): void => {
    longPressed.current = false;
    window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setPickerOpen(true);
    }, LONG_PRESS_MS);
  }, []);

  const endPress = useCallback((): void => {
    window.clearTimeout(pressTimer.current);
  }, []);

  const reactions = message.reactions ?? [];

  // Call history entries are self-contained cards: no reactions, no long press.
  if (message.kind === 'call') {
    return <CallMessage message={message} isMine={isMine} />;
  }

  // A blocked screenshot or screen recording reported by the server. The notice
  // is centred between the messages, like a WhatsApp system event.
  if (message.kind === 'system') {
    const recording = message.body === 'Screen recording blocked';
    return (
      <div className="flex w-full justify-center px-3 py-1.5">
        <div className="flex max-w-[92%] items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-3 py-2 text-left text-[0.6875rem] leading-relaxed text-amber-100/90 sm:max-w-[80%]">
          <ShieldAlert
            className="mt-px h-3.5 w-3.5 shrink-0 text-amber-300"
            aria-hidden="true"
          />
          <span>
            {isMine ? (
              <>
                Your {recording ? 'screen recording' : 'screenshot'} was blocked.{' '}
                {peerName ? `${peerName.split(' ')[0]} was` : 'The other person was'} notified.
              </>
            ) : (
              <>
                <span className="font-semibold text-amber-50">
                  {peerName ?? 'The other person'}
                </span>{' '}
                tried to {recording ? 'record the screen' : 'take a screenshot'}. It was
                blocked.
              </>
            )}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('flex w-full', isMine ? 'justify-end' : 'justify-start')}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onContextMenu={(event) => {
        event.preventDefault();
        setPickerOpen(true);
      }}
    >
      <div
        className={cn(
          'relative flex max-w-[82%] flex-col sm:max-w-[72%]',
          isMine ? 'items-end' : 'items-start',
        )}
      >
        <ReactionPicker
          open={pickerOpen}
          align={isMine ? 'end' : 'start'}
          onClose={() => setPickerOpen(false)}
          onSelect={(emoji) => {
            setPickerOpen(false);
            const already = reactions.find((reaction) => reaction.mine);
            onReact(message.id, already?.emoji === emoji ? null : emoji);
          }}
        />

        <div
          className={cn(
            'relative overflow-visible rounded-2xl shadow-sm',
            message.kind === 'image' ? 'p-1.5' : 'px-3.5 py-2.5',
            isMine
              ? 'rounded-br-md bg-neon text-ink-950'
              : 'rounded-bl-md border border-white/[0.06] bg-ink-750 text-white',
          )}
        >
          {message.kind === 'image' && attachment && (
            <button
              type="button"
              onClick={() => onImageClick(attachment)}
              className="block overflow-hidden rounded-xl"
              aria-label="Open photo"
            >
              <img
                src={attachment}
                alt="Shared photo"
                loading="lazy"
                onError={(event) => {
                  // Fall back to a neutral tile instead of a broken image icon.
                  const image = event.currentTarget;
                  image.style.display = 'none';
                  image.parentElement?.setAttribute('data-broken', 'true');
                }}
                className="max-h-[320px] w-[240px] max-w-full object-cover data-[broken]:hidden sm:w-[280px]"
              />
            </button>
          )}

          {message.kind === 'voice' && (
            <VoiceMessage src={attachment} duration={message.duration} isMine={isMine} />
          )}

          {message.kind === 'file' && (
            <a
              href={attachment ?? undefined}
              download={message.fileName ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-[12.5rem] max-w-full items-center gap-2.5 text-left"
              aria-label={`Download ${message.fileName ?? 'attachment'}`}
            >
              <span
                className={cn(
                  'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                  isMine ? 'bg-ink-950/10 text-ink-950' : 'bg-neon/10 text-neon',
                )}
              >
                <FileText className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block truncate text-[0.8125rem] font-semibold',
                    isMine ? 'text-ink-950' : 'text-white',
                  )}
                >
                  {message.fileName || 'Attachment'}
                </span>
                <span
                  className={cn(
                    'mt-0.5 block text-[0.625rem]',
                    isMine ? 'text-ink-950/65' : 'text-ink-400',
                  )}
                >
                  {formatBytes(message.fileSize)} · Tap to download
                </span>
              </span>
              <Download
                className={cn(
                  'h-4 w-4 shrink-0',
                  isMine ? 'text-ink-950/70' : 'text-ink-400',
                )}
                aria-hidden="true"
              />
            </a>
          )}

          {message.story && (
            /*
             * WhatsApp-style quoted story: the thumbnail sits above the text so
             * the recipient immediately knows which story the message is about.
             * The preview is a snapshot, so it still renders after the story
             * itself has expired.
             */
            <div
              className={cn(
                'mb-1.5 flex items-center gap-2 rounded-xl p-1.5',
                message.body ? '' : 'mb-0',
                isMine ? 'bg-ink-950/15' : 'bg-white/[0.07]',
              )}
            >
              <span className="h-11 w-9 shrink-0 overflow-hidden rounded-md bg-ink-900">
                {storyThumb ? (
                  <img src={storyThumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="grid h-full w-full place-items-center">
                    <ImageIcon
                      className={cn('h-3.5 w-3.5', isMine ? 'text-ink-950/50' : 'text-ink-400')}
                      aria-hidden="true"
                    />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'flex items-center gap-1 text-[0.59375rem] font-bold uppercase tracking-[0.1em]',
                    isMine ? 'text-ink-950/60' : 'text-ink-400',
                  )}
                >
                  {message.story.event === 'like' ? (
                    <>
                      <Heart className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                      Story liked
                    </>
                  ) : (
                    <>
                      <CornerUpLeft className="h-2.5 w-2.5" aria-hidden="true" />
                      Replied to story
                    </>
                  )}
                </span>
                <span
                  className={cn(
                    'mt-0.5 block truncate text-[0.6875rem]',
                    isMine ? 'text-ink-950/70' : 'text-ink-300',
                  )}
                >
                  {message.story.caption || 'Photo'}
                </span>
              </span>
            </div>
          )}

          {message.kind === 'text' && (
            <p className="whitespace-pre-wrap break-words text-[0.84375rem] leading-relaxed">
              {message.body}
            </p>
          )}

          {message.kind !== 'text' && message.body && (
            <p className={cn('px-2 pb-1 pt-2 text-[0.8125rem] leading-relaxed', isMine ? 'text-ink-950' : 'text-white/90')}>
              {message.body}
            </p>
          )}
        </div>

        {phoneWarning && (
          <div
            role="note"
            className="mt-1.5 flex w-full items-start gap-2 rounded-xl border border-amber-400/35 bg-amber-400/10 px-2.5 py-2 text-left text-[0.625rem] leading-relaxed text-ink-200"
          >
            <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
            <span>
              <span className="font-semibold text-white">Stay safe:</span> Never send money or
              share financial details. Be wary of spam, scams and unexpected cash requests.
            </span>
          </div>
        )}

        {reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => {
                  const already = reaction.mine;
                  onReact(message.id, already ? null : reaction.emoji);
                }}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.625rem] font-semibold transition',
                  reaction.mine
                    ? 'border-neon/50 bg-neon/15 text-neon'
                    : 'border-white/10 bg-white/[0.06] text-ink-300 hover:border-white/25',
                )}
                aria-label={`${reaction.emoji} ${reaction.count}. Tap to change your reaction`}
              >
                <span className="text-sm leading-none">{reaction.emoji}</span>
                <span>{reaction.count}</span>
              </button>
            ))}
          </div>
        )}

        <div
          className={cn(
            'mt-1 flex items-center gap-1 text-[0.59375rem] text-ink-500',
            isMine ? 'pr-1' : 'pl-1',
          )}
        >
          <span>{formatClock(message.createdAt)}</span>
          {isMine &&
            (showRead ? (
              <CheckCheck className="h-3.5 w-3.5 text-sky" aria-label="Read" />
            ) : read && !readReceiptsUnlocked ? (
              <span title="Read receipts are a HobyMine Plus feature" className="flex items-center gap-0.5">
                <Check className="h-3.5 w-3.5" aria-label="Delivered" />
                <Lock className="h-2.5 w-2.5 text-ink-600" />
              </span>
            ) : (
              <Check className="h-3.5 w-3.5" aria-label="Sent" />
            ))}
        </div>
      </div>
    </div>
  );
}

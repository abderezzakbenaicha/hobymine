import { ArrowDownLeft, ArrowUpRight, Phone, Video } from 'lucide-react';
import { cn, formatCallDuration, formatClock } from '../../lib/utils';
import type { ChatMessage } from '../../types';

/**
 * A finished voice or video call, rendered as a compact card inside the
 * conversation. The bubble is aligned to the caller, exactly like a normal chat
 * message.
 */
export function CallMessage({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  const duration = formatCallDuration(message.duration);
  const time = formatClock(message.createdAt);
  const DirectionIcon = isMine ? ArrowUpRight : ArrowDownLeft;
  const isVideo = message.body === 'video';
  const Icon = isVideo ? Video : Phone;
  const label = isVideo ? 'Video call' : 'Voice call';

  return (
    <div className={cn('flex w-full', isMine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'flex max-w-[85%] items-center gap-3 rounded-2xl border px-3.5 py-2.5 shadow-sm sm:max-w-[72%]',
          isMine
            ? 'rounded-br-md border-neon/25 bg-neon/[0.09]'
            : 'rounded-bl-md border-white/[0.06] bg-ink-750',
        )}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neon/15 text-neon">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="sr-only">{isMine ? 'Outgoing' : 'Incoming'}</span>
            <span className="truncate text-[0.8125rem] font-semibold text-white">{label}</span>
            <DirectionIcon
              className={cn('h-3.5 w-3.5 shrink-0', isMine ? 'text-neon/80' : 'text-ink-400')}
              aria-hidden="true"
            />
          </div>
          <span
            className={cn(
              'mt-0.5 block text-[0.6875rem] leading-relaxed',
              isMine ? 'text-ink-300' : 'text-ink-400',
            )}
          >
            {duration}
          </span>
        </div>

        <span
          className={cn(
            'self-start text-[0.59375rem] tabular-nums',
            isMine ? 'text-ink-300' : 'text-ink-500',
          )}
        >
          {time}
        </span>
      </div>
    </div>
  );
}

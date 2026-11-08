import { Heart, Send, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ApiClientError } from '../lib/api';
import { mediaUrl } from '../lib/media';
import { cn } from '../lib/utils';
import { useStoriesStore } from '../store/stories';
import type { StoryGroup } from '../types';
import { Avatar } from './Avatar';

/** Every story slide is shown for exactly five seconds, for viewers and owners. */
const STORY_DURATION_MS = 5_000;

function timeAgo(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

/**
 * Full-screen story player.
 *
 * The author only ever sees how many likes a story received — the viewer count
 * is never displayed anywhere. A comment is delivered as a normal direct
 * message, so the conversation continues in the inbox.
 */
export function StoryViewer({
  groups,
  initialGroup,
  onClose,
}: {
  groups: StoryGroup[];
  initialGroup: number;
  onClose: () => void;
}) {
  const toggleLike = useStoriesStore((state) => state.toggleLike);
  const reply = useStoriesStore((state) => state.reply);
  const markSeen = useStoriesStore((state) => state.markSeen);
  const remove = useStoriesStore((state) => state.remove);
  const navigate = useNavigate();

  const [groupId, setGroupId] = useState(initialGroup);
  const [storyIndex, setStoryIndex] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [liking, setLiking] = useState(false);
  const [paused, setPaused] = useState(false);
  /** True while a finger is held down on the story, which freezes the timer. */
  const [holdPaused, setHoldPaused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pressStartedAt = useRef(0);
  const heldRef = useRef(false);
  /** Time left on the current slide, so a pause can resume where it stopped. */
  const remainingRef = useRef(STORY_DURATION_MS);
  const deadlineRef = useRef<number | null>(null);

  // Always read the live group from the store so a like updates in place.
  const liveGroups = useStoriesStore((state) => state.groups);
  const source = liveGroups.length > 0 ? liveGroups : groups;
  const group = source[Math.min(groupId, source.length - 1)] ?? null;
  const stories = useMemo(() => group?.stories ?? [], [group]);
  const story = stories[Math.min(storyIndex, Math.max(0, stories.length - 1))] ?? null;

  const advance = useCallback(() => {
    setStoryIndex((index) => {
      if (index + 1 < stories.length) return index + 1;
      // Move on to the next person who has stories.
      if (groupId + 1 < source.length) {
        setGroupId(groupId + 1);
        return 0;
      }
      onClose();
      return index;
    });
  }, [stories.length, groupId, source.length, onClose]);

  const goBack = useCallback(() => {
    setStoryIndex((index) => {
      if (index > 0) return index - 1;
      if (groupId > 0) {
        setGroupId(groupId - 1);
        return 0;
      }
      return index;
    });
  }, [groupId]);

  // Mark the open story as watched, and keep the auto-advance timer running.
  useEffect(() => {
    if (!story) return;
    if (!story.mine && !story.seen) void markSeen(story.id);
  }, [story?.id, story?.mine, story?.seen, markSeen, story]);

  const isPaused = paused || holdPaused;

  // Every new slide starts with the full five seconds available.
  useEffect(() => {
    remainingRef.current = STORY_DURATION_MS;
    deadlineRef.current = null;
  }, [story?.id]);

  // The countdown runs against a deadline, so pausing keeps whatever time was
  // left and resuming picks up from exactly there instead of restarting.
  useEffect(() => {
    if (!story || sending) return;
    if (isPaused) {
      if (deadlineRef.current !== null) {
        remainingRef.current = Math.max(0, deadlineRef.current - Date.now());
        deadlineRef.current = null;
      }
      return;
    }
    const remaining = remainingRef.current;
    deadlineRef.current = Date.now() + remaining;
    const timer = window.setTimeout(advance, remaining);
    return () => {
      window.clearTimeout(timer);
      if (deadlineRef.current !== null) {
        remainingRef.current = Math.max(0, deadlineRef.current - Date.now());
        deadlineRef.current = null;
      }
    };
  }, [story?.id, isPaused, sending, advance, story]);

  const startHold = useCallback(() => {
    pressStartedAt.current = Date.now();
    heldRef.current = false;
    setHoldPaused(true);
  }, []);
  const endHold = useCallback(() => {
    heldRef.current = Date.now() - pressStartedAt.current > 250;
    setHoldPaused(false);
  }, []);
  /** A long press pauses the story; it must not also act as a tap to navigate. */
  const wasHold = (): boolean => {
    const held = heldRef.current;
    heldRef.current = false;
    return held;
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') advance();
      if (event.key === 'ArrowLeft') goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, goBack, onClose]);

  if (!group || !story) return null;

  const src = mediaUrl(story.mediaUrl);

  const like = async (): Promise<void> => {
    if (story.mine || liking) return;
    setLiking(true);
    try {
      await toggleLike(story.id);
    } catch {
      toast.error('Could not send your like');
    } finally {
      setLiking(false);
    }
  };

  const send = async (): Promise<void> => {
    const body = comment.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const result = await reply(story.id, body);
      setComment('');
      toast.success('Sent to their inbox', {
        description: 'Your comment arrived as a message. Carry on the chat there.',
        action: {
          label: 'Open chat',
          onClick: () => {
            onClose();
            navigate(`/chat/${result.matchId}`);
          },
        },
      });
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not send your comment');
    } finally {
      setSending(false);
    }
  };

  const destroy = async (): Promise<void> => {
    try {
      await remove(story.id);
      toast.success('Story deleted');
      if (stories.length <= 1) onClose();
      else setStoryIndex(0);
    } catch {
      toast.error('Could not delete the story');
    }
  };

  return createPortal(
    <div
      className="force-dark fixed inset-0 z-[80] flex flex-col bg-ink-950/95 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label={`${group.user.name}'s story`}
    >
      {/* Progress: one bar per story from this author. */}
      <div className="safe-top flex shrink-0 gap-1 px-3 pt-2">
        {stories.map((item, index) => (
          <span key={item.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/20">
            <span
              className={cn(
                'block h-full rounded-full bg-white',
                index > storyIndex ? 'w-0' : 'w-full',
              )}
              style={
                index === storyIndex
                  ? {
                      animation: `story-progress ${STORY_DURATION_MS}ms linear forwards`,
                      animationPlayState: isPaused || sending ? 'paused' : 'running',
                    }
                  : undefined
              }
            />
          </span>
        ))}
      </div>

      <header className="flex shrink-0 items-center gap-2.5 px-3 py-2.5">
        <Avatar name={group.user.name} photos={group.user.photos} id={group.user.id} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-white">
            {group.mine ? 'Your story' : group.user.name}
          </p>
          <p className="text-[0.625rem] text-ink-400">{timeAgo(story.createdAt)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          aria-label="Close stories"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div
        className="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center px-2 [-webkit-touch-callout:none]"
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerCancel={endHold}
        onPointerLeave={endHold}
        onContextMenu={(event) => event.preventDefault()}
      >
        {src ? (
          <img
            src={src}
            alt={story.caption || `${group.user.name}'s story`}
            className="max-h-full w-full max-w-md rounded-2xl object-contain"
            draggable={false}
          />
        ) : (
          <div className="grid h-64 w-full max-w-md place-items-center rounded-2xl bg-ink-900 text-xs text-ink-400">
            This photo is no longer available
          </div>
        )}

        {story.caption && (
          <p className="absolute inset-x-4 bottom-3 mx-auto max-w-md rounded-xl bg-ink-950/70 px-3 py-2 text-center text-xs font-medium leading-relaxed text-white backdrop-blur-sm">
            {story.caption}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            if (!wasHold()) goBack();
          }}
          className="absolute left-0 top-0 h-full w-1/4"
          aria-label="Previous story"
        />
        <button
          type="button"
          onClick={() => {
            if (!wasHold()) advance();
          }}
          className="absolute right-0 top-0 h-full w-1/4"
          aria-label="Next story"
        />
      </div>

      <footer className="safe-bottom shrink-0 px-3 pb-3 pt-2">
        {group.mine ? (
          /* The author sees the like tally only — never who watched. */
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-[0.6875rem] font-semibold text-white">
              <Heart className="h-3.5 w-3.5 fill-neon text-neon" aria-hidden="true" />
              {story.likes} {story.likes === 1 ? 'like' : 'likes'}
            </span>
            <button
              type="button"
              onClick={() => void destroy()}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-[0.6875rem] font-semibold text-ink-300 transition hover:bg-rose/15 hover:text-rose"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void send();
              }}
              placeholder={`Reply to ${group.user.name.split(' ')[0]}…`}
              maxLength={500}
              className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/[0.07] px-3.5 py-2 text-xs text-white placeholder:text-ink-500 focus:border-neon/50 focus:outline-none"
            />
            {comment.trim() ? (
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neon-gradient text-ink-950 transition disabled:opacity-60"
                aria-label="Send comment"
              >
                <Send className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void like()}
                disabled={liking}
                className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-full transition disabled:opacity-60',
                  story.liked ? 'bg-neon text-ink-950' : 'bg-white/10 text-white hover:bg-white/20',
                )}
                aria-label={story.liked ? 'Remove like' : 'Like this story'}
                aria-pressed={story.liked}
              >
                <Heart className={cn('h-4 w-4', story.liked && 'fill-current')} />
              </button>
            )}
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1.5 text-[0.625rem] font-semibold text-white">
              <Heart className="h-3 w-3 fill-neon text-neon" aria-hidden="true" />
              {story.likes}
            </span>
          </div>
        )}
      </footer>
    </div>,
    document.body,
  );
}
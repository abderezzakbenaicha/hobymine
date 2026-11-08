import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface EmojiGroup {
  label: string;
  emojis: string[];
}

/**
 * A small, dependency-free emoji picker. The full Unicode set is not bundled:
 * the composer only needs the reactions people actually use in a chat.
 */
const GROUPS: EmojiGroup[] = [
  {
    label: 'Smileys',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
      '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰',
      '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜',
      '🤪', '🤨', '🧐', '🤓', '😎', '🥳', '😏', '😒',
      '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫',
      '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬',
      '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥',
      '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐',
    ],
  },
  {
    label: 'Gestures',
    emojis: [
      '👋', '🤚', '✋', '🖖', '👌', '🤌', '🤏', '✌️',
      '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇',
      '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏',
      '🙌', '👐', '🤲', '🤝', '🙏', '💅', '💪', '🦾',
    ],
  },
  {
    label: 'Hearts',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
      '💘', '💝', '💟', '♥️', '💋', '💌', '🫶', '💐',
    ],
  },
  {
    label: 'Fun',
    emojis: [
      '🔥', '✨', '🌟', '⭐', '🌈', '☀️', '🌙', '⚡',
      '🎉', '🎊', '🎁', '🎈', '💯', '💥', '💫', '💦',
      '🎶', '🎵', '🎧', '🎸', '🎮', '🕹️', '🎬', '📸',
      '☕', '🍕', '🍜', '🍻', '🥂', '🍰', '🍫', '🍿',
      '✈️', '🌍', '🏖️', '🚀', '🐶', '🐱', '🦋', '🌸',
    ],
  },
];

export function EmojiPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Close when tapping anywhere outside the panel — including the button that
    // opened it, which would otherwise immediately reopen the picker.
    const onPointerDown = (event: PointerEvent): void => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Emoji picker"
      className="absolute bottom-full left-0 z-30 mb-2 w-[19rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-white/10 bg-ink-900/95 shadow-2xl backdrop-blur-2xl"
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <p className="text-[0.625rem] font-bold uppercase tracking-[0.2em] text-ink-400">
          Emoji
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-ink-400 transition hover:bg-white/5 hover:text-white"
          aria-label="Close emoji picker"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto p-2">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-1 pb-1 text-[0.5625rem] font-semibold uppercase tracking-wider text-ink-500">
              {group.label}
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              {group.emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onSelect(emoji)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-lg leading-none transition hover:bg-white/10 active:scale-90"
                  aria-label={`Insert ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

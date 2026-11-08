import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

export const REACTIONS = [
  { emoji: '❤️', label: 'Heart' },
  { emoji: '👍', label: 'Like' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '🔥', label: 'Fire' },
] as const;

/**
 * The reaction bar that opens when a message is long-pressed. It is anchored
 * above the message and closes on the next tap elsewhere.
 */
export function ReactionPicker({
  open,
  onSelect,
  onClose,
  align = 'center',
}: {
  open: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  align?: 'start' | 'center' | 'end';
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="menu"
          aria-label="Pick a reaction"
          initial={{ opacity: 0, y: 6, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          className={[
            'absolute bottom-full z-50 mb-2 flex items-center gap-0.5 rounded-2xl border border-white/10 bg-ink-850/95 p-1.5 shadow-float backdrop-blur-xl',
            align === 'start' ? 'left-0' : align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2',
          ].join(' ')}
        >
          {REACTIONS.map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              role="menuitem"
              title={reaction.label}
              aria-label={`React with ${reaction.label}`}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(reaction.emoji);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-lg transition hover:scale-110 hover:bg-white/10 active:scale-95"
            >
              {reaction.emoji}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { mediaUrl } from '../lib/media';
import { cn, gradientForId, initials } from '../lib/utils';

export function PhotoCarousel({
  photos,
  name,
  id,
  className,
  showBars = true,
  showArrows = true,
  barsRightInset = false,
  onIndexChange,
  index: controlledIndex,
}: {
  photos: string[];
  name: string;
  id?: string;
  className?: string;
  showBars?: boolean;
  /** Story-style surfaces navigate by tapping, so the hover arrows are hidden. */
  showArrows?: boolean;
  /** Stops the dashes short of the right edge, where a control floats. */
  barsRightInset?: boolean | 'wide';
  onIndexChange?: (index: number) => void;
  /** When provided the carousel is controlled by the parent. */
  index?: number;
}) {
  const [internalIndex, setInternalIndex] = useState(0);
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const tapStart = useRef<{ x: number; y: number } | null>(null);
  const isControlled = controlledIndex !== undefined;
  const index = isControlled ? controlledIndex : internalIndex;

  const setIndex = (value: number): void => {
    if (!isControlled) setInternalIndex(value);
    onIndexChange?.(value);
  };

  useEffect(() => {
    if (isControlled) return;
    setInternalIndex(0);
    setBroken({});
  }, [photos, isControlled]);

  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  const count = photos.length;
  const current = mediaUrl(photos[index]);
  const showPhoto = count > 0 && current && !broken[index];

  const move = (delta: number): void => {
    if (photos.length === 0) return;
    // Stay on the first/last photo instead of wrapping around: a tap on the
    // right edge should never jump back to the start of the story.
    setIndex(Math.min(Math.max(index + delta, 0), photos.length - 1));
  };

  const startTap = (event: React.PointerEvent<HTMLButtonElement>): void => {
    tapStart.current = { x: event.clientX, y: event.clientY };
  };

  const finishTap = (
    delta: number,
  ): ((event: React.PointerEvent<HTMLButtonElement>) => void) => {
    return (event) => {
      const start = tapStart.current;
      tapStart.current = null;
      if (!start) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      // A swipe of the whole card must not also step the photo.
      if (moved < 10) move(delta);
    };
  };

  return (
    <div className={cn('force-dark group relative h-full w-full overflow-hidden bg-ink-800', className)}>
      <AnimatePresence initial={false} mode="popLayout">
        {showPhoto ? (
          <motion.img
            key={`${current}-${index}`}
            src={current}
            alt={`${name} photo ${index + 1}`}
            className="absolute inset-0 h-full w-full object-cover"
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            draggable={false}
            onError={() => setBroken((state) => ({ ...state, [index]: true }))}
          />
        ) : (
          <div
            key="fallback"
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundImage: gradientForId(id ?? name) }}
          >
            <span className="text-6xl font-black tracking-tight text-white/80">
              {initials(name)}
            </span>
          </div>
        )}
      </AnimatePresence>

      {/*
        Story-style tap zones. They live here rather than in each page so a
        photo can always be stepped from Discovery, likes, profile views and
        the member's own preview. Controls above them keep `data-photo-control`
        and stop propagation, so the info button and progress bars still work.
      */}
      {count > 1 && (
        <>
          <button
            type="button"
            data-photo-control
            aria-label="Previous photo"
            onPointerDown={startTap}
            onPointerUp={finishTap(-1)}
            onPointerCancel={() => {
              tapStart.current = null;
            }}
            onClick={(event) => {
              event.stopPropagation();
              // Keyboard activation does not emit pointer events.
              if (event.detail === 0) move(-1);
            }}
            className="absolute inset-y-0 left-0 z-10 w-[32%] cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neon/60"
          />
          <button
            type="button"
            data-photo-control
            aria-label="Next photo"
            onPointerDown={startTap}
            onPointerUp={finishTap(1)}
            onPointerCancel={() => {
              tapStart.current = null;
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (event.detail === 0) move(1);
            }}
            className="absolute inset-y-0 right-0 z-10 w-[32%] cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neon/60"
          />
        </>
      )}

      {showBars && count > 0 && (
        <div
          className={cn(
            'absolute left-3 top-2 z-20 flex gap-1',
            barsRightInset === 'wide'
              ? 'right-[9.25rem]'
              : barsRightInset
                ? 'right-[3.5rem]'
                : 'right-3',
          )}
          data-testid="photo-bars"
        >
          {photos.map((photo, barIndex) => (
            <button
              key={`${photo}-${barIndex}`}
              type="button"
              data-photo-control
              aria-label={`Show photo ${barIndex + 1}`}
              onClick={(event) => {
                event.stopPropagation();
                setIndex(barIndex);
              }}
              /* The visible dash is thin; the padded button keeps it tappable
                 without growing into the badges below it. */
              className="flex-1 py-1"
            >
              <span className="block h-1 overflow-hidden rounded-full bg-black/25 shadow-sm backdrop-blur-sm">
                <span
                  className={cn(
                    'block h-full rounded-full bg-white transition-all',
                    barIndex <= index ? 'w-full' : 'w-0',
                  )}
                />
              </span>
            </button>
          ))}
        </div>
      )}

      {showArrows && count > 1 && (
        <>
          <button
            type="button"
            data-photo-control
            aria-label="Previous photo"
            onClick={(event) => {
              event.stopPropagation();
              move(-1);
            }}
            className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/25 p-1 text-white/70 opacity-0 backdrop-blur transition hover:bg-black/50 hover:text-white group-hover:opacity-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            data-photo-control
            aria-label="Next photo"
            onClick={(event) => {
              event.stopPropagation();
              move(1);
            }}
            className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/25 p-1 text-white/70 opacity-0 backdrop-blur transition hover:bg-black/50 hover:text-white group-hover:opacity-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}

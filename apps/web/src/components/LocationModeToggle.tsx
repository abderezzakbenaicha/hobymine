import { Globe2, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';

export type LocationMode = 'nearby' | 'global';

const OPTIONS: { value: LocationMode; label: string; icon: typeof MapPin }[] = [
  { value: 'nearby', label: 'Nearby', icon: MapPin },
  { value: 'global', label: 'Worldwide', icon: Globe2 },
];

/**
 * Switches discovery between "people near me" (strict distance from the
 * shared GPS position) and "worldwide" (no distance bound at all).
 */
export function LocationModeToggle({
  mode,
  onChange,
  className,
  compact = false,
}: {
  mode: LocationMode;
  onChange: (mode: LocationMode) => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-1 rounded-2xl border border-white/8 bg-ink-900/90 p-1',
        className,
      )}
      role="group"
      aria-label="Discovery location mode"
    >
      {OPTIONS.map((option) => {
        const active = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-xl font-semibold transition',
              compact ? 'px-2.5 py-1.5 text-[0.6875rem]' : 'px-3 py-2.5 text-xs',
              active
                ? 'bg-neon text-ink-950 shadow-glow-sm'
                : 'text-ink-300 hover:bg-white/5 hover:text-white',
            )}
          >
            <option.icon className={cn('shrink-0', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

import { cn } from '../lib/utils';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function RangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  label,
  formatValue,
  className,
}: {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  label?: string;
  formatValue?: (value: number) => string;
  className?: string;
}) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-ink-300">{label}</span>
          <span className="font-semibold text-neon">
            {formatValue ? formatValue(value) : value}
          </span>
        </div>
      )}
      <div className="relative flex h-7 items-center">
        <div className="absolute h-1.5 w-full rounded-full bg-ink-700" />
        <div
          className="absolute h-1.5 rounded-full bg-neon-gradient"
          style={{ width: `${clamp(percent, 0, 100)}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label ?? 'Range'}
          onChange={(event) => onChange(Number(event.target.value))}
          className="range-input absolute inset-0 w-full"
        />
      </div>
    </div>
  );
}

export function DualRangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  formatValue,
  className,
}: {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  formatValue?: (value: number) => string;
  className?: string;
}) {
  const [low, high] = value;
  const left = ((low - min) / (max - min)) * 100;
  const right = ((high - min) / (max - min)) * 100;

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-ink-300">Age range</span>
        <span className="font-semibold text-neon">
          {formatValue ? `${formatValue(low)} – ${formatValue(high)}` : `${low} – ${high}`}
        </span>
      </div>
      <div className="relative flex h-8 items-center">
        <div className="absolute h-1.5 w-full rounded-full bg-ink-700" />
        <div
          className="absolute h-1.5 rounded-full bg-neon-gradient"
          style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={low}
          aria-label="Minimum age"
          onChange={(event) =>
            onChange([Math.min(Number(event.target.value), high), high])
          }
          className="range-input range-input-dual absolute inset-0 w-full"
          style={{ zIndex: low > max - (max - min) * 0.1 ? 5 : 3 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={high}
          aria-label="Maximum age"
          onChange={(event) =>
            onChange([low, Math.max(Number(event.target.value), low)])
          }
          className="range-input range-input-dual absolute inset-0 w-full"
          style={{ zIndex: 4 }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[0.625rem] text-ink-500">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

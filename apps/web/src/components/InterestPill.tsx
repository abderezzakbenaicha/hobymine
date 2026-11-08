import { cn, interestEmoji } from '../lib/utils';

export function InterestPill({
  label,
  shared = false,
  className,
}: {
  label: string;
  shared?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium backdrop-blur',
        shared
          ? 'border-neon/30 bg-neon/10 text-neon-soft'
          : 'border-white/15 bg-white/[0.07] text-ink-200',
        className,
      )}
    >
      <span aria-hidden="true">{interestEmoji(label)}</span>
      {label}
    </span>
  );
}

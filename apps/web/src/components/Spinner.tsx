import { Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-neon', className)} />;
}

export function FullPageLoader({ label = 'Finding your people…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-neon/30 animate-pulse-ring" />
        <span className="absolute inset-2 rounded-full border border-neon/40" />
        <Loader2 className="h-8 w-8 animate-spin text-neon" />
      </div>
      <p className="text-sm text-ink-300">{label}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-2xl bg-gradient-to-r from-ink-800 via-ink-750 to-ink-800 bg-[length:200%_100%]',
        className,
      )}
    />
  );
}

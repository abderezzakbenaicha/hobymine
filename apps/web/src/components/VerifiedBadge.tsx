import { BadgeCheck, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';

export function VerifiedBadge({
  size = 'md',
  label = false,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  label?: boolean;
  className?: string;
}) {
  const iconClass = size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full text-sky',
        label && 'bg-sky/10 px-2 py-1 text-[0.6875rem] font-semibold',
        className,
      )}
      title="Selfie verified"
    >
      {label ? <ShieldCheck className={iconClass} /> : <BadgeCheck className={iconClass} />}
      {label && 'Verified'}
    </span>
  );
}

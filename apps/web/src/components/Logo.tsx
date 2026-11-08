import logoMark from '../assets/hobymine-mark.png';
import { cn } from '../lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src={logoMark}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn('select-none bg-transparent object-contain', className || 'h-6')}
    />
  );
}

export function Logo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <LogoMark className={compact ? 'h-5' : 'h-6'} />
      <span
        className={cn(
          'font-black leading-none tracking-[-0.055em] text-white',
          compact ? 'text-[0.9375rem]' : 'text-lg',
        )}
      >
        Hoby<span className="text-neon">Mine</span>
      </span>
    </div>
  );
}

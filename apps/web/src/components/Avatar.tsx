import { useState } from 'react';
import { mediaUrl } from '../lib/media';
import { cn, gradientForId, initials } from '../lib/utils';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

const SIZE_CLASSES: Record<Size, string> = {
  xs: 'h-7 w-7 text-[0.625rem]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-24 w-24 text-2xl',
  '2xl': 'h-32 w-32 text-3xl',
  '3xl': 'h-40 w-40 text-4xl',
};

const DOT_CLASSES: Record<Size, string> = {
  xs: 'h-2 w-2 border',
  sm: 'h-2.5 w-2.5 border',
  md: 'h-3 w-3 border-2',
  lg: 'h-3.5 w-3.5 border-2',
  xl: 'h-4 w-4 border-2',
  '2xl': 'h-5 w-5 border-2',
  '3xl': 'h-6 w-6 border-2',
};

interface AvatarProps {
  name: string;
  photos?: string[];
  id?: string;
  size?: Size;
  online?: boolean;
  className?: string;
  ring?: boolean;
}

export function Avatar({
  name,
  photos = [],
  id = name,
  size = 'md',
  online = false,
  className,
  ring = false,
}: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const photo = mediaUrl(photos[0]);
  const showPhoto = Boolean(photo) && !broken;

  return (
    <div className={cn('relative shrink-0 rounded-full', className)}>
      <div
        className={cn(
          'force-dark relative overflow-hidden rounded-full bg-ink-800',
          SIZE_CLASSES[size],
          ring && 'ring-2 ring-neon/70 ring-offset-2 ring-offset-canvas',
        )}
        style={!showPhoto ? { backgroundImage: gradientForId(id) } : undefined}
      >
        {showPhoto ? (
          <img
            src={photo ?? undefined}
            alt={name}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-bold text-white/90">
            {initials(name)}
          </span>
        )}
      </div>
      {online && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-canvas bg-neon shadow-glow-sm',
            DOT_CLASSES[size],
          )}
          aria-label="Online"
        />
      )}
    </div>
  );
}

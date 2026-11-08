import { cn } from '../../lib/utils';

export function TypingIndicator({ isMineBubble = false }: { isMineBubble?: boolean }) {
  return (
    <div className={cn('flex', isMineBubble ? 'justify-end' : 'justify-start')}>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/[0.06] bg-ink-750 px-4 py-3">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-ink-300"
            style={{ animationDelay: `${index * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

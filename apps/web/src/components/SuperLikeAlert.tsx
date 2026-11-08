import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, Star } from 'lucide-react';
import { useEffect } from 'react';
import type { PublicUser } from '../types';
import { Avatar } from './Avatar';

export interface SuperLikeAlertData {
  id: string;
  user: PublicUser;
}

/**
 * A dedicated, lightweight alert for Super Likes. It is deliberately not a
 * regular toast: it slides down from the top with a short star pulse and a
 * single sheen sweep, so a Super Like feels different from an ordinary like
 * without ever blocking the screen for long.
 */
export function SuperLikeAlert({
  alert,
  onDismiss,
  onOpen,
}: {
  alert: SuperLikeAlertData | null;
  onDismiss: () => void;
  onOpen: (user: PublicUser) => void;
}) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!alert) return undefined;
    const timer = window.setTimeout(onDismiss, 6000);
    return () => window.clearTimeout(timer);
  }, [alert, onDismiss]);

  const firstName = alert?.user.name.split(' ')[0] ?? 'Someone';

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex justify-center px-4"
    >
      <AnimatePresence>
        {alert && (
          <motion.button
            key={alert.id}
            type="button"
            onClick={() => onOpen(alert.user)}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -26, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.97 }}
            transition={
              reducedMotion
                ? { duration: 0.18 }
                : { type: 'spring', stiffness: 420, damping: 30, mass: 0.7 }
            }
            className="pointer-events-auto relative w-full max-w-[21.5rem] overflow-hidden rounded-2xl border border-neon/35 bg-ink-900/95 p-3 text-left shadow-[0_18px_50px_-12px_rgba(236,19,80,0.5)] backdrop-blur-xl"
            aria-label={`${firstName} sent you a Super Like. Open Likes.`}
          >
            {!reducedMotion && (
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_20%,rgba(111,211,255,0.16)_45%,rgba(255,138,162,0.22)_55%,transparent_80%)]"
                initial={{ x: '-120%' }}
                animate={{ x: '120%' }}
                transition={{ duration: 1.3, ease: 'easeInOut', delay: 0.12 }}
              />
            )}

            <div className="relative flex items-center gap-3">
              <div className="relative shrink-0">
                <span
                  aria-hidden="true"
                  className="absolute -inset-1 rounded-full bg-neon/25 blur-md"
                />
                <Avatar
                  name={alert.user.name}
                  photos={alert.user.photos}
                  id={alert.user.id}
                  size="md"
                  className="relative"
                />
                <motion.span
                  className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-neon-gradient text-ink-950 shadow-glow-sm ring-2 ring-ink-900"
                  animate={reducedMotion ? undefined : { scale: [1, 1.18, 1] }}
                  transition={{ duration: 0.8, repeat: 2, ease: 'easeInOut' }}
                >
                  <Star className="h-3 w-3 fill-current" />
                </motion.span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-[0.5625rem] font-bold uppercase tracking-[0.18em] text-neon">
                  <Star className="h-3 w-3 fill-current" />
                  Super Like
                </p>
                <p className="mt-0.5 truncate text-[0.8125rem] font-semibold text-white">
                  {firstName} is serious about you
                </p>
                <p className="truncate text-[0.6875rem] text-ink-300">
                  Tap to see who sent it
                </p>
              </div>

              <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
            </div>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

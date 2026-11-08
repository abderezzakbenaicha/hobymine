import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { registerOverlay } from '../lib/native';
import { cn } from '../lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  hideClose?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  hideClose = false,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // The Android hardware back button closes the dialog instead of the app.
    const unregisterOverlay = registerOverlay(onClose);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      unregisterOverlay();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            aria-label="Close dialog"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title ?? 'Dialog'}
            className={cn(
              'relative z-10 flex max-h-[calc(100dvh-var(--safe-top,0px)-0.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] border border-white/10 bg-ink-850 shadow-card sm:max-h-[calc(100dvh-2.5rem)] sm:rounded-[1.75rem]',
              className,
            )}
            initial={{ y: 40, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 30, scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            {(title || !hideClose) && (
              <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-2 pt-5 sm:gap-4 sm:px-6 sm:pt-6">
                <div className="min-w-0">
                  {title && (
                    <h2 className="text-lg font-bold leading-tight text-white sm:text-xl">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="mt-1 text-xs leading-relaxed text-ink-300 sm:text-sm">
                      {description}
                    </p>
                  )}
                </div>
                {!hideClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="shrink-0 rounded-full border border-white/10 bg-white/5 p-2 text-ink-300 transition hover:bg-white/10 hover:text-white"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            <div className="modal-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 sm:px-6">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

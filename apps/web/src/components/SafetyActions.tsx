import { Ban, Flag } from 'lucide-react';
import { useUiStore } from '../store/ui';

export interface SafetyTarget {
  id: string;
  name: string;
  matchId?: string;
}

/**
 * The two safety actions every profile and chat screen exposes. Both open the
 * shared dialogs, so behaviour (and wording) stays identical everywhere.
 */
export function SafetyActions({
  target,
  onAct,
  className,
}: {
  target: SafetyTarget;
  /** Called before the dialog opens, e.g. to close the profile behind it. */
  onAct?: () => void;
  className?: string;
}) {
  const openReport = useUiStore((state) => state.openReport);
  const openBlock = useUiStore((state) => state.openBlock);
  const firstName = target.name.split(' ')[0];

  return (
    <div className={className ?? 'flex gap-2'}>
      <button
        type="button"
        className="btn-ghost flex-1 py-2.5 text-xs"
        onClick={() => {
          onAct?.();
          openReport(target);
        }}
        aria-label={`Report ${target.name}`}
      >
        <Flag className="h-3.5 w-3.5" />
        Report
      </button>
      <button
        type="button"
        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-rose/25 bg-rose/[0.08] px-4 py-2.5 text-xs font-semibold text-rose transition hover:bg-rose/15"
        onClick={() => {
          onAct?.();
          openBlock(target);
        }}
        aria-label={`Block ${target.name}`}
      >
        <Ban className="h-3.5 w-3.5" />
        Block {firstName}
      </button>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { api, ApiClientError } from '../lib/api';
import { REPORT_REASONS, cn } from '../lib/utils';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import { Modal } from './Modal';
import { Switch } from './Switch';

export function ReportDialog() {
  const target = useUiStore((state) => state.reportTarget);
  const closeReport = useUiStore((state) => state.closeReport);
  const removeMatch = useChatStore((state) => state.removeMatch);
  const navigate = useNavigate();
  const location = useLocation();

  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [block, setBlock] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (target) {
      setReason(REPORT_REASONS[0]);
      setDetails('');
      setBlock(true);
    }
  }, [target]);

  const submit = async (): Promise<void> => {
    if (!target) return;
    setSubmitting(true);
    try {
      await api.post('/api/reports', {
        targetId: target.id,
        reason,
        details,
        block,
      });
      if (block && target.matchId) {
        removeMatch(target.matchId);
        if (location.pathname === `/chat/${target.matchId}`) navigate('/matches');
      }
      toast.success('Report sent. Our safety team will review it.');
      closeReport();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not send report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={closeReport}
      title={`Report ${target?.name ?? 'this profile'}`}
      description="Reports are confidential. We review every one, usually within 24 hours."
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-2xl border border-rose/20 bg-rose/5 p-3.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose" />
          <p className="text-xs leading-relaxed text-ink-300">
            If someone is in immediate danger, contact local emergency services. HobyMine is an
            independent demo project, not an emergency service.
          </p>
        </div>

        <div className="space-y-2">
          {REPORT_REASONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setReason(option)}
              className={cn(
                'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition',
                reason === option
                  ? 'border-neon/40 bg-neon/10 text-white'
                  : 'border-white/8 bg-white/[0.02] text-ink-300 hover:bg-white/5',
              )}
            >
              {option}
              <span
                className={cn(
                  'h-3.5 w-3.5 rounded-full border',
                  reason === option
                    ? 'border-neon bg-neon shadow-glow-sm'
                    : 'border-white/25',
                )}
              />
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="report-details" className="label">
            What happened? <span className="text-ink-500">(optional)</span>
          </label>
          <textarea
            id="report-details"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Add any context that would help us review this."
            className="field resize-none"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
          <div>
            <p className="text-sm font-medium text-white">Block this person</p>
            <p className="text-xs text-ink-400">
              They won’t be able to find you or message you.
            </p>
          </div>
          <Switch checked={block} onChange={setBlock} label="Block this person" />
        </div>

        <div className="flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={closeReport}>
            Cancel
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl bg-rose px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? 'Sending…' : block ? 'Report & block' : 'Send report'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

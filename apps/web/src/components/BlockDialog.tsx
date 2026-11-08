import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Ban, Loader2 } from 'lucide-react';
import { api, ApiClientError } from '../lib/api';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import { Modal } from './Modal';

/**
 * Confirms a block on its own, without filing a report. The server removes the
 * match for both people, so the conversation disappears from every screen.
 */
export function BlockDialog() {
  const target = useUiStore((state) => state.blockTarget);
  const closeBlock = useUiStore((state) => state.closeBlock);
  const removeMatch = useChatStore((state) => state.removeMatch);
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!target) setSubmitting(false);
  }, [target]);

  const submit = async (): Promise<void> => {
    if (!target || submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/api/blocks/${target.id}`);
      if (target.matchId) {
        removeMatch(target.matchId);
        if (location.pathname === `/chat/${target.matchId}`) navigate('/matches');
      }
      toast.success(`${target.name.split(' ')[0]} is blocked`, {
        description: 'They cannot find you, message you, or appear in your deck.',
      });
      closeBlock();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not block this person');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={closeBlock}
      title={`Block ${target?.name ?? 'this person'}?`}
      description="Blocks are mutual and take effect immediately."
    >
      <div className="space-y-4 pb-1">
        <div className="flex items-start gap-3 rounded-2xl border border-rose/20 bg-rose/5 p-3.5">
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-rose" />
          <p className="text-xs leading-relaxed text-ink-300">
            They will not be able to find your profile, message you, or appear in your deck. Any
            match and conversation between you will be removed for both of you.
          </p>
        </div>
        <p className="text-[0.6875rem] leading-relaxed text-ink-500">
          Blocking is permanent until you unblock them from Safety in your profile. If they broke
          the rules, report them as well so our safety team can review the account.
        </p>

        <div className="flex gap-3 pt-1">
          <button type="button" className="btn-ghost flex-1" onClick={closeBlock}>
            Cancel
          </button>
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            {submitting ? 'Blocking…' : 'Block'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

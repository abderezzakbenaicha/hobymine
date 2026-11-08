import { Check, Heart, RotateCcw, Sparkles, Video, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../store/ui';
import { Modal } from './Modal';

function resetLabel(value?: string): string {
  if (!value) return 'at midnight UTC';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'at midnight UTC';
  return `at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

const BENEFITS = [
  'Unlimited likes, every day',
  'Unlimited 1-on-1 video calls',
  'Rewind your last swipe',
  'See everyone who likes you',
  'Read receipts and profile boost',
];

export function PaywallModal() {
  const paywall = useUiStore((state) => state.paywall);
  const closePaywall = useUiStore((state) => state.closePaywall);
  const navigate = useNavigate();

  const reason = paywall?.reason ?? 'rewind';
  const isLikes = reason === 'like_limit';
  const isVideo = reason === 'video_limit';
  const Icon = isLikes ? Heart : isVideo ? Video : RotateCcw;

  const title = isLikes
    ? 'You’re popular today.'
    : isVideo
      ? 'Your free video minute is up.'
      : 'Undo is a Plus move.';

  const description = isLikes
    ? `Free members get ${paywall?.limit ?? 15} likes a day. You have used all of them.`
    : isVideo
      ? 'The one-time 60-second video trial has been used. HobyMine Plus unlocks unlimited 1-on-1 video calling.'
      : 'Rewind your last swipe whenever you change your mind — available with HobyMine Plus.';

  const heading = isLikes
    ? 'Keep the momentum going'
    : isVideo
      ? 'Keep the camera rolling'
      : 'Never lose the one that got away';

  const body = isLikes
    ? `Your daily budget resets ${resetLabel(paywall?.resetsAt)}. Plus members can keep liking without a daily cap.`
    : isVideo
      ? 'Free members get a single minute of video calling to try it out. Plus members can video call for as long as they like, every day.'
      : 'Plus members can rewind any swipe and go back to a profile they passed by accident.';

  const openPlans = (): void => {
    closePaywall();
    navigate('/plus');
  };

  return (
    <Modal open={Boolean(paywall)} onClose={closePaywall} title={title} description={description}>
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-2xl border border-neon/20 bg-gradient-to-br from-neon/[0.12] via-ink-900 to-sky/[0.06] p-4">
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-neon/15 blur-2xl"
            aria-hidden="true"
          />
          <div className="relative flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-neon/30 bg-neon/10 text-neon">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{heading}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-300">{body}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {BENEFITS.map((benefit) => (
            <div
              key={benefit}
              className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3.5 py-2.5"
            >
              <Check className="h-4 w-4 shrink-0 text-neon" />
              <span className="text-xs text-ink-200">{benefit}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-2 pt-1 sm:grid-cols-2">
          <button type="button" onClick={closePaywall} className="btn-ghost">
            Not now
          </button>
          <button type="button" onClick={openPlans} className="btn-primary">
            <Zap className="h-4 w-4" />
            Get HobyMine Plus
          </button>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-center text-[0.625rem] text-ink-500">
          <Sparkles className="h-3 w-3 text-neon" />
          Cancel anytime. Your free account keeps working.
        </p>
      </div>
    </Modal>
  );
}

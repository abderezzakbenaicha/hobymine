import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  Check,
  Clock,
  Loader2,
  Lock,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Skeleton } from '../components/Spinner';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { api, ApiClientError } from '../lib/api';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import type { MeUser } from '../types';

interface VerificationStatus {
  verified: boolean;
  status: string;
  selfieUrl: string | null;
  submittedAt: string | null;
}

const STEPS = [
  {
    icon: ScanFace,
    title: 'A quick selfie',
    text: 'Look straight at the camera in good light. No filters, no group shots.',
  },
  {
    icon: ShieldCheck,
    title: 'We compare it to your photos',
    text: 'Our demo review checks that you look like the person on your profile.',
  },
  {
    icon: BadgeCheck,
    title: 'You get the verified check',
    text: 'A verified badge appears on your profile and in every deck you land in.',
  },
];

export function VerifyPage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<VerificationStatus>('/api/verification/status')
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ verified: false, status: 'unverified', selfieUrl: null, submittedAt: null });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const choose = (event: ChangeEvent<HTMLInputElement>): void => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      toast.error('Choose an image file');
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      toast.error('Selfies must be under 10 MB');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const submit = async (useDemo: boolean): Promise<void> => {
    if (submitting) return;
    if (!useDemo && !file) {
      toast.error('Take or choose a selfie first');
      return;
    }
    setSubmitting(true);
    try {
      let data: { user: MeUser; message?: string; reviewedAt?: string };
      if (useDemo || !file) {
        data = await api.post<{ user: MeUser; message?: string }>('/api/verification/selfie', {
          selfieUrl: '/seed/alex-1.svg',
        });
      } else {
        const form = new FormData();
        form.append('selfie', file);
        data = await api.upload<{ user: MeUser; message?: string }>('/api/verification/selfie', form);
      }
      setUser(data.user);
      setStatus({
        verified: true,
        status: 'approved',
        selfieUrl: preview,
        submittedAt: new Date().toISOString(),
      });
      setPreview(null);
      setFile(null);
      toast.success('You’re verified', {
        description: data.message ?? 'The verified badge is now on your profile.',
      });
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  const verified = Boolean(status?.verified) || Boolean(user?.verified);
  const submittedLabel = status?.submittedAt
    ? new Date(status.submittedAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className="animate-slide-up">
      <div className="flex items-center gap-3">
        <Link
          to="/profile"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-ink-300 transition hover:text-white"
          aria-label="Back to profile"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.28em] text-neon">Trust</p>
          <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
            Selfie verification
          </h1>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-80 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            {verified ? (
              <section className="relative overflow-hidden rounded-[1.75rem] border border-sky/25 bg-gradient-to-br from-sky/[0.12] via-ink-900 to-neon/[0.06] p-6 sm:p-8">
                <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sky/15 blur-3xl" />
                <div className="relative flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky/15 text-sky shadow-[0_0_30px_rgba(111,211,255,0.2)]">
                    <BadgeCheck className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-[0.625rem] font-bold uppercase tracking-[0.2em] text-sky">
                      Verification complete
                    </p>
                    <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-white">
                      You&rsquo;re the real deal.
                    </h2>
                    <p className="mt-2 max-w-md text-xs leading-relaxed text-ink-300">
                      Your selfie was approved and the verified badge now appears on your profile,
                      in matches, and in every deck you show up in.
                    </p>
                    {submittedLabel && (
                      <p className="mt-4 flex items-center gap-1.5 text-[0.625rem] text-ink-400">
                        <Clock className="h-3 w-3" />
                        Verified on {submittedLabel}
                      </p>
                    )}
                  </div>
                </div>
                <div className="relative mt-6 flex flex-wrap items-center gap-2">
                  <VerifiedBadge label />
                  <Link
                    to="/discover"
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.625rem] font-semibold text-ink-200 transition hover:bg-white/10 hover:text-white"
                  >
                    Back to discovery
                  </Link>
                  <Link
                    to="/profile"
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.625rem] font-semibold text-ink-200 transition hover:bg-white/10 hover:text-white"
                  >
                    View profile
                  </Link>
                </div>
              </section>
            ) : (
              <section className="panel p-5 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">Take your verification selfie</h2>
                    <p className="mt-1 text-xs leading-relaxed text-ink-400">
                      Good light, face centred, eyes open. This is a demo — review is instant and
                      the image is only stored locally.
                    </p>
                  </div>
                  <Camera className="h-5 w-5 shrink-0 text-neon" />
                </div>

                <div className="mt-6 grid gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
                  <div className="relative mx-auto aspect-[3/4] w-full max-w-[12.5rem] overflow-hidden rounded-2xl border border-white/10 bg-ink-850">
                    {preview ? (
                      <img src={preview} alt="Your selfie preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-white/15 bg-white/[0.03]">
                          <ScanFace className="h-7 w-7 text-ink-500" />
                        </span>
                        <p className="text-[0.625rem] leading-relaxed text-ink-500">
                          Your selfie will appear here
                        </p>
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-3 rounded-[50%] border border-dashed border-neon/20" />
                  </div>

                  <div>
                    <input
                      ref={inputRef}
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="hidden"
                      onChange={choose}
                    />
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="btn-primary w-full"
                    >
                      <Camera className="h-4 w-4" />
                      {file ? 'Retake selfie' : 'Open camera / choose photo'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void submit(false)}
                      disabled={!file || submitting}
                      className="btn-ghost mt-3 w-full"
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {submitting ? 'Checking your selfie…' : 'Submit for verification'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void submit(true)}
                      disabled={submitting}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-neon/20 bg-neon/[0.05] px-4 py-2.5 text-[0.6875rem] font-semibold text-neon transition hover:bg-neon/10 disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Use the demo selfie instead
                    </button>
                    <p className="mt-3 flex items-start gap-1.5 text-[0.625rem] leading-relaxed text-ink-500">
                      <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>
                        In production, selfies are reviewed by a moderation partner and deleted
                        after approval. This demo stores the upload on your local machine only.
                      </span>
                    </p>
                  </div>
                </div>
              </section>
            )}

            <section className="panel p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-white">How it works</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {STEPS.map((step, index) => (
                  <div key={step.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between">
                      <step.icon className="h-4 w-4 text-neon" />
                      <span className="text-[0.625rem] font-bold text-ink-600">0{index + 1}</span>
                    </div>
                    <p className="mt-3 text-xs font-semibold text-white">{step.title}</p>
                    <p className="mt-1 text-[0.65625rem] leading-relaxed text-ink-400">{step.text}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <div className="panel p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-sky" />
                <h2 className="text-sm font-semibold text-white">Why verify?</h2>
              </div>
              <ul className="mt-4 space-y-3">
                {[
                  'Verified profiles get up to 40% more matches in the demo.',
                  'The badge tells people there is a real human behind the photos.',
                  'Verification is free, always.',
                  'Discovery, messaging and calls unlock once you’re verified.',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[0.6875rem] leading-relaxed text-ink-300">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-neon" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <h3 className="text-xs font-semibold text-white">A note on privacy</h3>
              <p className="mt-1.5 text-[0.65625rem] leading-relaxed text-ink-400">
                We never show your selfie to other members and never use it in your profile. It
                exists only to confirm that you match your photos.
              </p>
            </div>

            <Link
              to="/safety"
              className="flex items-center gap-3 rounded-2xl border border-sky/15 bg-sky/[0.04] p-4 transition hover:border-sky/30"
            >
              <ShieldCheck className="h-5 w-5 shrink-0 text-sky" />
              <div>
                <p className="text-[0.6875rem] font-semibold text-white">Safety centre</p>
                <p className="text-[0.625rem] text-ink-400">Reporting, blocking, and dating tips.</p>
              </div>
            </Link>
          </aside>
        </div>
      )}

      {user && !verified && (
        <p className={cn('mt-6 text-center text-[0.625rem] text-ink-600')}>
          Verification is required to browse Discovery and to send messages. It is free and
          takes under a minute.
        </p>
      )}
    </div>
  );
}

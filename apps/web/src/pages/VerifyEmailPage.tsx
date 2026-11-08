import { ArrowRight, Loader2, LogOut, MailCheck, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Logo } from '../components/Logo';
import { landingRoute } from '../lib/profile';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';

/** Matches the server side cooldown so a resend never bounces with a 429. */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * The last step of sign up: the six digit code that confirms the address the
 * account was created with. The account is already signed in at this point, so
 * the screen simply unlocks the rest of the app once the code checks out.
 */
export function VerifyEmailPage() {
  const user = useAuthStore((state) => state.user);
  const devCode = useAuthStore((state) => state.devCode);
  const verifyEmail = useAuthStore((state) => state.verifyEmail);
  const resendVerification = useAuthStore((state) => state.resendVerification);
  const logout = useAuthStore((state) => state.logout);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.emailVerified) {
      navigate(landingRoute(user), { replace: true });
    }
  }, [user, navigate]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    },
    [],
  );

  const startCooldown = (): void => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      setCooldown((seconds) => {
        if (seconds <= 1) {
          if (timer.current !== null) window.clearInterval(timer.current);
          timer.current = null;
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!user || busy) return;
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error('Enter the six digit code');
      return;
    }
    setBusy(true);
    try {
      await verifyEmail(user.email, code);
      toast.success('Email confirmed', { description: 'Your profile is ready to go live.' });
      const current = useAuthStore.getState().user;
      navigate(landingRoute(current), { replace: true });
    } catch {
      // The store error is rendered below.
    } finally {
      setBusy(false);
    }
  };

  const resend = async (): Promise<void> => {
    if (!user || resending || cooldown > 0) return;
    setResending(true);
    try {
      const result = await resendVerification(user.email);
      if (result.alreadyVerified) {
        navigate(landingRoute(user), { replace: true });
        return;
      }
      startCooldown();
      toast.success('New code sent', {
        description: result.devCode
          ? `Demo code: ${result.devCode}`
          : 'Check your inbox for the six digit code.',
      });
    } catch {
      // The store error is rendered below.
    } finally {
      setResending(false);
    }
  };

  if (!user) return null;

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-canvas">
      <div className="app-ambient" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[28rem] flex-col justify-center px-5 pb-[calc(2rem+max(var(--safe-bottom,0px),env(safe-area-inset-bottom,0px)))] pt-[calc(2rem+max(var(--safe-top,0px),env(safe-area-inset-top,0px)))] sm:px-8">
        <Logo />

        <p className="mt-8 flex items-center gap-2 text-[0.625rem] font-bold uppercase tracking-[0.28em] text-neon">
          <MailCheck className="h-3 w-3" />
          Almost there
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
          Confirm your email.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">
          We sent a six digit code to{' '}
          <span className="font-semibold text-white">{user.email}</span>. Enter it to finish setting
          up your account.
        </p>

        <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
          <div>
            <label htmlFor="verify-code" className="label">
              Six digit code
            </label>
            <input
              id="verify-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                if (error) clearError();
              }}
              className="field text-center text-lg tracking-[0.4em]"
              placeholder="000000"
              maxLength={6}
              required
            />
            {devCode && (
              <p className="mt-1.5 text-[0.6875rem] text-ink-400">
                Demo code: <span className="font-semibold text-neon">{devCode}</span>
              </p>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose/25 bg-rose/[0.07] px-3.5 py-3 text-xs leading-relaxed text-rose"
            >
              {error}
            </div>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Confirming…
              </>
            ) : (
              <>
                Confirm my email
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void resend()}
            disabled={resending || cooldown > 0}
            className={cn(
              'flex items-center justify-center gap-1.5 text-[0.6875rem] font-semibold transition disabled:opacity-60',
              cooldown > 0 ? 'text-ink-500' : 'text-neon hover:underline',
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', resending && 'animate-spin')} />
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new code'}
          </button>

          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/welcome', { replace: true });
            }}
            className="mx-auto flex items-center gap-1.5 text-[0.625rem] font-semibold text-ink-500 transition hover:text-white"
          >
            <LogOut className="h-3 w-3" />
            Use a different email
          </button>
        </div>
      </div>
    </div>
  );
}

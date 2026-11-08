import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Heart,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  Server,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CountryPicker } from '../components/CountryPicker';
import { LegalDocument, type LegalKind } from '../components/LegalDocument';
import { Logo, LogoMark } from '../components/Logo';
import { Modal } from '../components/Modal';
import { ServerSettingsModal } from '../components/ServerSettingsModal';
import { checkEmail } from '../lib/email';
import { landingRoute } from '../lib/profile';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import type { Gender, InterestedIn } from '../types';

type Mode = 'login' | 'register';

const HERO_PHOTOS = [
  { src: '/seed/maya-1.svg', alt: 'Maya', className: 'left-0 top-8 h-52 w-40 rotate-[-7deg]' },
  { src: '/seed/isla-1.svg', alt: 'Isla', className: 'left-36 top-0 h-60 w-44 rotate-[4deg]' },
  { src: '/seed/priya-1.svg', alt: 'Priya', className: 'left-12 top-60 h-52 w-40 rotate-[5deg]' },
  { src: '/seed/luna-1.svg', alt: 'Luna', className: 'left-52 top-64 h-48 w-36 rotate-[-5deg]' },
];

const FEATURES = [
  {
    icon: Heart,
    title: 'Swipe with intention',
    text: 'Right to like, left to pass, up for a Super Like when someone really catches your eye.',
  },
  {
    icon: MessageCircle,
    title: 'Real-time chemistry',
    text: 'Mutual likes open a live chat with typing indicators, photos, and voice notes.',
  },
  {
    icon: ShieldCheck,
    title: 'Verified humans',
    text: 'Selfie verification and easy reporting keep the room full of real people.',
  },
];

export function WelcomePage() {
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const forgotPassword = useAuthStore((state) => state.forgotPassword);
  const resetPassword = useAuthStore((state) => state.resetPassword);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Forgot password flow.
  const [resetMode, setResetMode] = useState(false);
  const [resetStage, setResetStage] = useState<'email' | 'code'>('email');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [name, setName] = useState('');
  const [age, setAge] = useState('26');
  const [gender, setGender] = useState<Gender>('woman');
  const [countryCode, setCountryCode] = useState('');
  const [interestedIn, setInterestedIn] = useState<InterestedIn>('everyone');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalKind | null>(null);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);

  const switchMode = (next: Mode): void => {
    clearError();
    setEmailError(null);
    setMode(next);
  };

  const startReset = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    const check = checkEmail(email);
    if (!check.valid) {
      setEmailError(check.message);
      toast.error(check.message ?? 'Enter a valid email address');
      return;
    }
    setBusy(true);
    try {
      const result = await forgotPassword(email);
      setDevCode(result.devCode ?? null);
      setResetStage('code');
      toast.success('Reset code sent', {
        description: result.devCode
          ? `Demo code: ${result.devCode}`
          : 'Check your inbox for the six digit code.',
      });
    } catch {
      // The store error is rendered below.
    } finally {
      setBusy(false);
    }
  };

  const finishReset = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(resetCode.trim())) {
      toast.error('Enter the six digit code');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email, resetCode, newPassword);
      toast.success('Password updated', { description: 'You can sign in with it now.' });
      setResetStage('email');
      setResetCode('');
      setNewPassword('');
      setMode('login');
    } catch {
      // The store error is rendered below.
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) return;

    const check = checkEmail(email);
    if (!check.valid) {
      setEmailError(check.message);
      toast.error(check.message ?? 'Enter a valid email address');
      return;
    }
    setEmailError(null);

    if (mode === 'register' && !countryCode) {
      toast.error('Choose your country to create your account');
      return;
    }
    if (mode === 'register' && !ageConfirmed) {
      toast.error('Confirm that you are 18 or older to create an account', {
        description: 'HobyMine is strictly for adults.',
      });
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
        toast.success('Welcome back');
      } else {
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
          age: Number(age),
          gender,
          countryCode,
          interestedIn,
          ageConfirmed,
        });
        toast.success('Your account is ready', {
          description: 'Enter the six digit code we sent to confirm your email.',
        });
      }
      const current = useAuthStore.getState().user;
      navigate(landingRoute(current), { replace: true });
    } catch {
      // The store exposes a friendly message in the form.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-canvas">
      <div className="app-ambient" aria-hidden="true" />

      <div className="relative z-10 mx-auto grid min-h-dvh w-full max-w-[82.5rem] safe-top lg:grid-cols-[1.05fr_0.95fr]">
        {/* Brand story */}
        <section className="relative hidden flex-col justify-between overflow-hidden px-10 py-12 lg:flex xl:px-16">
          <Logo />

          <div className="relative mt-10 max-w-lg">
            <p className="flex items-center gap-2 text-[0.625rem] font-bold uppercase tracking-[0.34em] text-neon">
              <span className="h-1.5 w-1.5 rounded-full bg-neon shadow-glow-sm" />
              Find your frequency
            </p>
            <h1 className="mt-5 text-balance text-6xl font-black leading-[0.92] tracking-[-0.06em] text-white xl:text-7xl">
              Less small talk.
              <br />
              More <span className="bg-neon-gradient bg-clip-text text-transparent">spark.</span>
            </h1>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-ink-300">
              HobyMine is a neon-lit dating experience for people who would rather trade voice notes
              than &ldquo;hey&rdquo;. Swipe, match, and meet in real time.
            </p>

            <div className="force-dark relative mt-9 h-[18.75rem]">
              {HERO_PHOTOS.map((photo) => (
                <div
                  key={photo.alt}
                  className={cn(
                    'absolute overflow-hidden rounded-3xl border border-white/15 shadow-card',
                    photo.className,
                  )}
                >
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    className="h-full w-full object-cover"
                    loading="eager"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                </div>
              ))}
              <div className="absolute left-[-12px] top-[11.75rem] flex items-center gap-2 rounded-full border border-neon/30 bg-ink-950/90 px-3 py-2 text-[0.625rem] font-bold uppercase tracking-[0.16em] text-neon shadow-glow-sm backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                It&rsquo;s a match
              </div>
              <div className="absolute left-[18.25rem] top-[14.125rem] flex h-11 w-11 items-center justify-center rounded-full bg-neon-gradient text-ink-950 shadow-glow">
                <Heart className="h-5 w-5 fill-ink-950" />
              </div>
            </div>
          </div>

          <div className="mt-8 grid max-w-lg gap-4">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neon/20 bg-neon/[0.08] text-neon">
                  <feature.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">{feature.title}</p>
                  <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-400">{feature.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Auth card */}
        <section className="flex min-h-[calc(100dvh-var(--safe-top,0px))] flex-col justify-center px-5 pb-[calc(2.5rem+max(var(--safe-bottom,0px),env(safe-area-inset-bottom,0px)))] pt-10 sm:px-10 lg:border-l lg:border-white/[0.06] lg:bg-canvas/60 lg:backdrop-blur-sm">
          <div className="mx-auto w-full max-w-[26.25rem]">
            <div className="flex items-center justify-between lg:hidden">
              <Logo />
            </div>

            <div className="mt-8 lg:mt-0">
              <p className="text-[0.625rem] font-bold uppercase tracking-[0.28em] text-neon">
                {resetMode
                  ? 'Password reset'
                  : mode === 'login'
                    ? 'Welcome back'
                    : 'Create your account'}
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
                {resetMode
                  ? 'Get back in.'
                  : mode === 'login'
                    ? 'Your people are waiting.'
                    : 'Start something real.'}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-ink-400">
                {resetMode
                  ? 'Enter your email and we will send you a six digit code to set a new password.'
                  : mode === 'login'
                    ? 'Sign in to pick up where the sparks left off.'
                    : 'Two minutes now, a much better Saturday later.'}
              </p>
            </div>

            {!resetMode && (
              <div className="mt-7 grid grid-cols-2 gap-1 rounded-2xl border border-white/8 bg-ink-900/90 p-1.5">
                {(
                  [
                    { value: 'login', label: 'Sign in' },
                    { value: 'register', label: 'Sign up' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => switchMode(option.value)}
                    className={cn(
                      'rounded-xl px-4 py-2.5 text-sm font-semibold transition',
                      mode === option.value
                        ? 'bg-white text-canvas shadow-sm'
                        : 'text-ink-400 hover:text-white',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            {resetMode ? (
              <form
                onSubmit={(event) =>
                  void (resetStage === 'email' ? startReset(event) : finishReset(event))
                }
                className="mt-5 space-y-4"
              >
                {resetStage === 'email' ? (
                  <div>
                    <label htmlFor="email" className="label">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                      <input
                        id="email"
                        type="email"
                        inputMode="email"
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          if (emailError) setEmailError(null);
                        }}
                        className={cn('field pl-10', emailError && 'border-rose/50')}
                        placeholder="you@gmail.com"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        required
                      />
                    </div>
                    {emailError && (
                      <p className="mt-1.5 text-[0.6875rem] text-rose" role="alert">
                        {emailError}
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      <label htmlFor="reset-code" className="label">
                        Six digit code
                      </label>
                      <input
                        id="reset-code"
                        inputMode="numeric"
                        value={resetCode}
                        onChange={(event) =>
                          setResetCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        className="field text-center text-lg tracking-[0.4em]"
                        placeholder="000000"
                        autoComplete="one-time-code"
                        required
                      />
                      {devCode && (
                        <p className="mt-1.5 text-[0.6875rem] text-ink-400">
                          Demo code: <span className="font-semibold text-neon">{devCode}</span>
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="new-password" className="label">
                        New password
                      </label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                        <input
                          id="new-password"
                          type={showPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          className="field px-10"
                          placeholder="At least 8 characters"
                          autoComplete="new-password"
                          required
                          minLength={8}
                          maxLength={72}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-500 transition hover:text-white"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}

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
                      {resetStage === 'email' ? 'Sending code…' : 'Updating…'}
                    </>
                  ) : (
                    <>
                      {resetStage === 'email' ? 'Send my code' : 'Set new password'}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setResetMode(false);
                    setResetStage('email');
                  }}
                  className="w-full text-center text-[0.6875rem] font-semibold text-ink-400 transition hover:text-white"
                >
                  Back to sign in
                </button>
              </form>
            ) : (
            <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">
              {mode === 'register' && (
                <div>
                  <label htmlFor="name" className="label">
                    First name
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                    <input
                      id="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="field pl-10"
                      placeholder="Alex"
                      autoComplete="given-name"
                      required
                      minLength={2}
                      maxLength={40}
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="email" className="label">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                  <input
                    id="email"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    onBlur={() => {
                      if (!email.trim()) return;
                      const check = checkEmail(email);
                      setEmailError(check.valid ? null : check.message);
                    }}
                    className={cn('field pl-10', emailError && 'border-rose/50')}
                    placeholder="you@gmail.com"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                  />
                </div>
                {emailError && (
                  <p className="mt-1.5 text-[0.6875rem] text-rose" role="alert">
                    {emailError}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="label">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="field px-10"
                    placeholder="At least 8 characters"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                    minLength={mode === 'login' ? 1 : 8}
                    maxLength={72}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-500 transition hover:text-white"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      clearError();
                      setEmailError(null);
                      setResetMode(true);
                    }}
                    className="mt-1.5 text-[0.6875rem] font-semibold text-neon hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              {mode === 'register' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="age" className="label">
                        Age
                      </label>
                      <input
                        id="age"
                        type="number"
                        min={18}
                        max={99}
                        value={age}
                        onChange={(event) => setAge(event.target.value)}
                        className="field"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="gender" className="label">
                        I am
                      </label>
                      <select
                        id="gender"
                        value={gender}
                        onChange={(event) => setGender(event.target.value as Gender)}
                        className="field-select"
                      >
                        <option value="woman">Woman</option>
                        <option value="man">Man</option>
                        <option value="nonbinary">Non-binary</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="register-country" className="label">
                      Country
                    </label>
                    <CountryPicker
                      id="register-country"
                      value={countryCode}
                      onChange={setCountryCode}
                      placeholder="Choose your country"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="interested" className="label">
                      Show me
                    </label>
                    <select
                      id="interested"
                      value={interestedIn}
                      onChange={(event) =>
                        setInterestedIn(event.target.value as InterestedIn)
                      }
                      className="field-select"
                    >
                      <option value="women">Women</option>
                      <option value="men">Men</option>
                      <option value="everyone">Everyone</option>
                    </select>
                  </div>

                  <label
                    htmlFor="age-confirm"
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition',
                      ageConfirmed
                        ? 'border-neon/30 bg-neon/[0.06]'
                        : 'border-white/8 bg-white/[0.02] hover:border-white/15',
                    )}
                  >
                    <input
                      id="age-confirm"
                      type="checkbox"
                      checked={ageConfirmed}
                      onChange={(event) => setAgeConfirmed(event.target.checked)}
                      required
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-white/25 bg-white/5 accent-neon"
                    />
                    <span className="text-[0.6875rem] leading-relaxed text-ink-300">
                      I confirm I am{' '}
                      <span className="font-semibold text-white">18 years or older</span> and I
                      agree to the{' '}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setLegalDoc('terms');
                        }}
                        className="font-semibold text-neon hover:underline"
                      >
                        Terms of Service
                      </button>{' '}
                      and{' '}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setLegalDoc('privacy');
                        }}
                        className="font-semibold text-neon hover:underline"
                      >
                        Privacy Policy
                      </button>
                      . HobyMine is strictly for adults.
                    </span>
                  </label>
                </>
              )}

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
                    {mode === 'login' ? 'Signing in…' : 'Creating account…'}
                  </>
                ) : (
                  <>
                    {mode === 'login' ? 'Enter HobyMine' : 'Create my account'}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
            )}

            <div className="mt-5 flex items-start gap-2 text-[0.625rem] leading-relaxed text-ink-600">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-neon/70" />
              <p>
                By continuing you agree to our{' '}
                <button
                  type="button"
                  onClick={() => setLegalDoc('terms')}
                  className="font-semibold text-ink-400 transition hover:text-neon"
                >
                  Terms of Service
                </button>{' '}
                and{' '}
                <button
                  type="button"
                  onClick={() => setLegalDoc('privacy')}
                  className="font-semibold text-ink-400 transition hover:text-neon"
                >
                  Privacy Policy
                </button>
                , and confirm you are 18 or older. This is an independent demo project — not
                affiliated with any dating brand.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-center gap-4 text-[0.625rem] text-ink-600">
              <Link to="/safety" className="transition hover:text-neon">
                Safety
              </Link>
              <span className="h-1 w-1 rounded-full bg-ink-700" />
              <button
                type="button"
                onClick={() => setServerSettingsOpen(true)}
                className="flex items-center gap-1 transition hover:text-neon"
              >
                <Server className="h-3 w-3" />
                Server
              </button>
              <span className="h-1 w-1 rounded-full bg-ink-700" />
              <span className="flex items-center gap-1">
                <LogoMark className="h-3.5 w-3.5" />
                v1.5
              </span>
            </div>
          </div>
        </section>
      </div>

      <Modal
        open={legalDoc !== null}
        onClose={() => setLegalDoc(null)}
        className="max-w-2xl"
      >
        {legalDoc && <LegalDocument kind={legalDoc} className="pb-6" />}
      </Modal>

      <ServerSettingsModal
        open={serverSettingsOpen}
        onClose={() => setServerSettingsOpen(false)}
      />
    </div>
  );
}

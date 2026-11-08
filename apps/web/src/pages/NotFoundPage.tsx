import { ArrowLeft, Compass, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LogoMark } from '../components/Logo';
import { useAuthStore } from '../store/auth';

export function NotFoundPage() {
  const token = useAuthStore((state) => state.token);

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-canvas px-6 text-center">
      <div className="app-ambient" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md pb-[calc(1.5rem+max(var(--safe-bottom,0px),env(safe-area-inset-bottom,0px)))] pt-[calc(1.5rem+max(var(--safe-top,0px),env(safe-area-inset-top,0px)))]">
        <div className="relative mx-auto w-fit">
          <span className="absolute inset-0 animate-pulse-ring rounded-full border border-neon/30" />
          <LogoMark className="h-16 w-16" />
        </div>
        <p className="mt-8 text-[0.625rem] font-bold uppercase tracking-[0.34em] text-neon">404</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl">
          Off the map.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-400">
          This page isn’t part of your deck. It may have moved, or the link might be a little
          broken-hearted.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to={token ? '/discover' : '/welcome'} className="btn-primary">
            <Compass className="h-4 w-4" />
            {token ? 'Back to discovery' : 'Back to sign in'}
          </Link>
          {token && (
            <Link to="/matches" className="btn-ghost">
              <Heart className="h-4 w-4" />
              Your matches
            </Link>
          )}
        </div>
        <Link
          to={token ? '/discover' : '/welcome'}
          className="mt-8 inline-flex items-center gap-1.5 text-[0.6875rem] text-ink-500 transition hover:text-white"
        >
          <ArrowLeft className="h-3 w-3" />
          Take me home
        </Link>
      </div>
    </div>
  );
}

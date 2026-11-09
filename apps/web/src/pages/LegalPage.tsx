import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { LegalDocument, type LegalKind } from '../components/LegalDocument';
import { Logo } from '../components/Logo';

export function LegalPage({ kind }: { kind: LegalKind }) {
  const navigate = useNavigate();
  const other: LegalKind = kind === 'terms' ? 'privacy' : 'terms';

  return (
    <div className="relative min-h-dvh bg-canvas text-white">
      <div className="app-ambient" aria-hidden="true" />
      <div className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-[calc(4rem+min(max(var(--safe-bottom,0px),env(safe-area-inset-bottom,0px)),3.5rem))] pt-[calc(2rem+min(max(var(--safe-top,0px),env(safe-area-inset-top,0px)),3.5rem))] sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-ink-300 transition hover:text-white"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Link to="/welcome" aria-label="HobyMine home">
            <Logo />
          </Link>
        </div>

        <LegalDocument kind={kind} className="mt-8" />

        <footer className="mt-10 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-5 text-[0.6875rem]">
          <Link
            to={`/legal/${other}`}
            className="font-semibold text-neon transition hover:underline"
          >
            Read the {other === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
          </Link>
          <span className="h-1 w-1 rounded-full bg-ink-700" />
          <Link to="/safety" className="text-ink-400 transition hover:text-white">
            Safety centre
          </Link>
        </footer>
      </div>
    </div>
  );
}

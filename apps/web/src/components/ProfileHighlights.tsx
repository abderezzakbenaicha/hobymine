import { Baby, Heart, Languages, PawPrint, Ruler, Sparkles, Tag } from 'lucide-react';
import { cn, heightLabel } from '../lib/utils';
import type { PublicUser } from '../types';

type HighlightUser = Pick<
  PublicUser,
  | 'relationshipGoal'
  | 'heightCm'
  | 'languages'
  | 'lifestyle'
  | 'hasKids'
  | 'wantsKids'
  | 'kidsCount'
  | 'hasPets'
  | 'petTypes'
  | 'petsCount'
>;

interface ProfileHighlightsProps {
  user: HighlightUser;
  /** "card" is the compact overlay used on the swipe card; "full" is a detail panel. */
  variant?: 'card' | 'full';
  maxLifestyle?: number;
  maxLanguages?: number;
  className?: string;
}

/**
 * Renders the richer profile fields (relationship goal, height, languages and
 * lifestyle tags) in one place so the deck, profile pages and chat all show
 * the same information in the same order.
 */
export function ProfileHighlights({
  user,
  variant = 'card',
  maxLifestyle = 3,
  maxLanguages = 2,
  className,
}: ProfileHighlightsProps) {
  const height = heightLabel(user.heightCm);
  const lifestyle = (user.lifestyle ?? []).filter(Boolean);
  const languages = (user.languages ?? []).filter(Boolean);
  const goal = (user.relationshipGoal ?? '').trim();

  const kidsCount = user.kidsCount ?? 0;
  const family = [
    user.hasKids === 'yes'
      ? kidsCount > 0
        ? `${kidsCount} kid${kidsCount === 1 ? '' : 's'}`
        : 'Has kids'
      : user.hasKids === 'no'
        ? 'No kids'
        : '',
    user.wantsKids === 'yes'
      ? 'Wants kids'
      : user.wantsKids === 'maybe'
        ? 'Open to kids'
        : user.wantsKids === 'no'
          ? 'Doesn’t want kids'
          : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const petKinds = (user.petTypes ?? []).filter(Boolean);
  const petsCount = user.petsCount ?? 0;
  const pets = [
    user.hasPets === 'yes' ? (petKinds.length > 0 ? petKinds.join(', ') : 'Has pets') : '',
    user.hasPets === 'yes' && petsCount > 0
      ? `${petsCount} pet${petsCount === 1 ? '' : 's'}`
      : '',
    user.hasPets === 'no' ? 'No pets' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  if (
    !height &&
    !goal &&
    lifestyle.length === 0 &&
    languages.length === 0 &&
    !family &&
    !pets
  ) {
    return null;
  }

  if (variant === 'full') {
    return (
      <div className={cn('space-y-3', className)}>
        {(goal || height) && (
          <div className="grid grid-cols-2 gap-2">
            {goal && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[0.5625rem] font-bold uppercase tracking-[0.14em] text-ink-500">
                  <Heart className="h-3 w-3 text-neon" />
                  Looking for
                </p>
                <p className="mt-1 text-[0.6875rem] font-semibold leading-snug text-white">
                  {goal}
                </p>
              </div>
            )}
            {height && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[0.5625rem] font-bold uppercase tracking-[0.14em] text-ink-500">
                  <Ruler className="h-3 w-3 text-sky" />
                  Height
                </p>
                <p className="mt-1 text-[0.6875rem] font-semibold leading-snug text-white">
                  {height}
                </p>
              </div>
            )}
          </div>
        )}

        {(family || pets) && (
          <div className={cn('grid gap-2', family && pets ? 'grid-cols-2' : 'grid-cols-1')}>
            {family && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[0.5625rem] font-bold uppercase tracking-[0.14em] text-ink-500">
                  <Baby className="h-3 w-3 text-violet" />
                  Family
                </p>
                <p className="mt-1 text-[0.6875rem] font-semibold leading-snug text-white">
                  {family}
                </p>
              </div>
            )}
            {pets && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[0.5625rem] font-bold uppercase tracking-[0.14em] text-ink-500">
                  <PawPrint className="h-3 w-3 text-amber-300" />
                  Pets
                </p>
                <p className="mt-1 text-[0.6875rem] font-semibold leading-snug text-white">
                  {pets}
                </p>
              </div>
            )}
          </div>
        )}

        {languages.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[0.5625rem] font-bold uppercase tracking-[0.14em] text-ink-500">
              <Languages className="h-3 w-3 text-sky" />
              Speaks
            </p>
            <div className="flex flex-wrap gap-1.5">
              {languages.map((language) => (
                <span
                  key={language}
                  className="rounded-full border border-sky/20 bg-sky/[0.07] px-2.5 py-1 text-[0.6875rem] font-medium text-sky"
                >
                  {language}
                </span>
              ))}
            </div>
          </div>
        )}

        {lifestyle.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[0.5625rem] font-bold uppercase tracking-[0.14em] text-ink-500">
              <Sparkles className="h-3 w-3 text-violet" />
              Lifestyle
            </p>
            <div className="flex flex-wrap gap-1.5">
              {lifestyle.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[0.6875rem] font-medium text-ink-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const chips: { key: string; icon: typeof Heart; label: string; tone: string }[] = [];
  if (goal) chips.push({ key: 'goal', icon: Heart, label: goal, tone: 'text-neon' });
  if (height) chips.push({ key: 'height', icon: Ruler, label: height, tone: 'text-sky' });
  if (languages.length > 0) {
    chips.push({
      key: 'languages',
      icon: Languages,
      label: languages.slice(0, maxLanguages).join(' · '),
      tone: 'text-sky',
    });
  }
  lifestyle.slice(0, maxLifestyle).forEach((tag, index) => {
    chips.push({ key: `lifestyle-${index}`, icon: Tag, label: tag, tone: 'text-white/70' });
  });

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-white/15 bg-black/35 px-2 py-0.5 text-[0.625rem] font-medium text-white/85 backdrop-blur-md"
        >
          <chip.icon className={cn('h-2.5 w-2.5 shrink-0', chip.tone)} />
          <span className="truncate">{chip.label}</span>
        </span>
      ))}
    </div>
  );
}

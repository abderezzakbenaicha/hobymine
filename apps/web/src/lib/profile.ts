import type { MeUser, PublicUser } from '../types';

export function profileChecklist(user: MeUser) {
  return [
    { label: 'At least 2 photos', done: user.photos.length >= 2 },
    { label: 'A bio people can reply to', done: user.bio.trim().length >= 20 },
    { label: 'Job or what you do', done: user.job.trim().length > 0 },
    { label: 'Your country', done: user.countryCode.trim().length > 0 },
    { label: '3+ interests', done: user.interests.length >= 3 },
    { label: 'What you are looking for', done: user.relationshipGoal.trim().length > 0 },
    { label: '2+ lifestyle tags', done: user.lifestyle.length >= 2 },
    { label: 'Languages you speak', done: user.languages.length > 0 },
    { label: 'Your height', done: user.heightCm !== null },
    { label: 'A 20-second voice intro', done: user.voiceIntro !== null },
    { label: 'Selfie verified', done: user.verified },
  ];
}

/**
 * Interests with the shared ones first, so the profile and the deck lead with
 * what two members have in common.
 */
export function sortBySharedInterests(
  user: Pick<PublicUser, 'interests' | 'sharedInterests'>,
): string[] {
  return [...user.interests].sort((a, b) => {
    const aShared = user.sharedInterests.includes(a) ? 0 : 1;
    const bShared = user.sharedInterests.includes(b) ? 0 : 1;
    return aShared - bShared;
  });
}

export function profileCompletion(user: MeUser): {
  done: number;
  total: number;
  percent: number;
} {
  const items = profileChecklist(user);
  const done = items.filter((item) => item.done).length;
  return {
    done,
    total: items.length,
    percent: Math.round((done / items.length) * 100),
  };
}

/**
 * Everything the onboarding wizard collects. A member is only released into
 * the main app once the whole profile and the discovery preferences are in
 * place, so nothing has to be chased up later from Settings.
 */
export function needsOnboarding(user: MeUser | null | undefined): boolean {
  if (!user) return false;
  return (
    user.photos.length === 0 ||
    user.bio.trim().length < 20 ||
    user.job.trim().length === 0 ||
    user.countryCode.trim().length === 0 ||
    user.interests.length < 3 ||
    user.relationshipGoal.trim().length === 0 ||
    user.lifestyle.length < 2 ||
    user.languages.length === 0
  );
}

/**
 * Where a member should land: the sign in screen when signed out, then the
 * profile onboarding or the deck.
 */
export function landingRoute(user: MeUser | null | undefined): string {
  if (!user) return '/welcome';
  return needsOnboarding(user) ? '/onboarding' : '/discover';
}

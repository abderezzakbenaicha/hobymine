import { useCallback, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { trackProfileView } from '../lib/profileViews';
import { useAuthStore } from '../store/auth';
import type { PublicUser } from '../types';
import { FullProfile } from './FullProfile';
import { Modal } from './Modal';

interface UseProfileViewerResult {
  /** The profile currently open, or null when the sheet is closed. */
  profile: PublicUser | null;
  /** True while the complete record is being fetched from the API. */
  loading: boolean;
  /** Opens the full profile immediately, then refreshes it from the API. */
  openProfile: (person: PublicUser) => void;
  closeProfile: () => void;
}

/**
 * One way to open anybody's profile.
 *
 * The card or list row already carries most fields, so the sheet opens
 * instantly with that copy while the complete record — including the voice
 * introduction — is fetched in the background. Every surface (discover,
 * chat, likes, profile views and the member's own preview) uses this hook so
 * a profile always opens with the same layout and the freshest details.
 */
export function useProfileViewer(): UseProfileViewerResult {
  const viewerId = useAuthStore((state) => state.user?.id);
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const openProfile = useCallback(
    (person: PublicUser): void => {
      setProfile(person);
      setLoadingId(person.id);
      void trackProfileView(person.id, viewerId);
      void api
        .get<{ user: PublicUser }>(`/api/users/${encodeURIComponent(person.id)}`)
        .then((data) => {
          // Ignore a slow response if another profile was opened meanwhile.
          setProfile((current) => (current?.id === person.id ? data.user : current));
        })
        .catch(() => {
          // Offline or hidden profile: the data we already have still renders.
        })
        .finally(() => {
          setLoadingId((current) => (current === person.id ? null : current));
        });
    },
    [viewerId],
  );

  const closeProfile = useCallback((): void => {
    setProfile(null);
    setLoadingId(null);
  }, []);

  return {
    profile,
    loading: loadingId !== null,
    openProfile,
    closeProfile,
  };
}

interface ProfileSheetProps {
  user: PublicUser | null;
  onClose: () => void;
  /** Action row at the bottom of the profile (like/pass/back to chat). */
  footer?: ReactNode;
  /** Extra content after the interests, such as safety actions. */
  afterInterests?: ReactNode;
  /** Height override for the photo carousel. */
  photoClassName?: string;
  title?: string;
  /** Presence is only shown to matched members. */
  showPresence?: boolean;
}

/**
 * The modal every surface renders. It exists so discover, chat, likes and the
 * member's own preview cannot drift apart: they all show `FullProfile`.
 */
export function ProfileSheet({
  user,
  onClose,
  footer,
  afterInterests,
  photoClassName,
  title = 'Full profile',
  showPresence = false,
}: ProfileSheetProps) {
  return (
    <Modal open={Boolean(user)} onClose={onClose} title={title}>
      {user ? (
        <FullProfile
          user={user}
          photoClassName={photoClassName}
          afterInterests={afterInterests}
          footer={footer}
          showPresence={showPresence}
        />
      ) : null}
    </Modal>
  );
}

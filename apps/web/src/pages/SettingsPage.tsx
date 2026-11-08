import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  PauseCircle,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Modal } from '../components/Modal';
import { api, ApiClientError } from '../lib/api';
import { clearBackgroundSession } from '../lib/notifications';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';

/** Password input with a show/hide control that works on touch too. */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          disabled={disabled}
          className="field pr-12"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-ink-400 transition hover:text-white"
          aria-label={visible ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const [pauseOpen, setPauseOpen] = useState(false);
  const [pausing, setPausing] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!user) return null;

  const firstName = user.name.split(' ')[0];
  const canDelete = deletePassword.length > 0 && deleteConfirm.trim().toUpperCase() === 'DELETE';

  const changePassword = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPasswordError(null);

    if (!currentPassword) {
      setPasswordError('Enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Your new password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('Choose a new password that is different from your current one.');
      return;
    }

    setSavingPassword(true);
    try {
      await api.post('/api/me/password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated', {
        description: 'Use your new password the next time you sign in.',
      });
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.message
          : 'Could not update your password. Try again.';
      setPasswordError(message);
      toast.error(message);
    } finally {
      setSavingPassword(false);
    }
  };

  const pauseAccount = async (): Promise<void> => {
    setPausing(true);
    try {
      await api.post('/api/me/pause');
      void clearBackgroundSession();
      logout();
      navigate('/welcome', { replace: true });
      toast.success('Your account is paused', {
        description: 'Nobody can see your profile. Sign in again whenever you are ready.',
      });
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : 'Could not pause your account. Try again.',
      );
    } finally {
      setPausing(false);
    }
  };

  const deleteAccount = async (): Promise<void> => {
    if (!canDelete) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await api.delete('/api/me', { password: deletePassword });
      void clearBackgroundSession();
      logout();
      navigate('/welcome', { replace: true });
      toast.success('Your account was deleted', {
        description: 'Your profile, matches and messages are gone for good.',
      });
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.message
          : 'Could not delete your account. Try again.';
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  };

  const closeDelete = (): void => {
    if (deleting) return;
    setDeleteOpen(false);
    setDeletePassword('');
    setDeleteConfirm('');
    setDeleteError(null);
  };

  return (
    <div className="animate-slide-up mx-auto w-full max-w-3xl pb-1">
      <div className="flex items-start gap-3">
        <Link
          to="/profile"
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-ink-300 transition hover:text-white"
          aria-label="Back to profile"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.28em] text-neon">
            Your account
          </p>
          <h1 className="mt-1.5 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
            Settings
          </h1>
          <p className="mt-1.5 text-xs text-ink-400">
            Password, visibility and the big red button — all in one place.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <section className="panel p-5 sm:p-6" aria-labelledby="security-heading">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neon/10 text-neon">
              <KeyRound className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id="security-heading" className="text-sm font-semibold text-white">
                Change password
              </h2>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-400">
                Signed in as <span className="text-ink-200">{user.email}</span>. Your current
                password is required before a new one can be saved.
              </p>
            </div>
          </div>

          <form onSubmit={(event) => void changePassword(event)} className="mt-5 space-y-4">
            <PasswordField
              id="current-password"
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              placeholder="Your current password"
              disabled={savingPassword}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <PasswordField
                id="new-password"
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                disabled={savingPassword}
              />
              <PasswordField
                id="confirm-password"
                label="Confirm new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                placeholder="Repeat the new password"
                disabled={savingPassword}
              />
            </div>

            {passwordError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-rose/25 bg-rose/[0.07] px-3 py-2 text-[0.6875rem] leading-relaxed text-rose"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {passwordError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={savingPassword}
                className="btn-primary px-4 py-2.5 text-xs"
              >
                {savingPassword ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {savingPassword ? 'Updating…' : 'Update password'}
              </button>
              <p className="text-[0.625rem] leading-relaxed text-ink-500">
                You will stay signed in on this device.
              </p>
            </div>
          </form>
        </section>

        <section className="panel p-5 sm:p-6" aria-labelledby="account-heading">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky/10 text-sky">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id="account-heading" className="text-sm font-semibold text-white">
                Account status
              </h2>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-400">
                Take a break without losing your matches, or remove everything for good.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-semibold text-white">
                  <PauseCircle className="h-4 w-4 text-sky" />
                  Pause my account
                </p>
                <p className="mt-1 text-[0.625rem] leading-relaxed text-ink-400">
                  Your profile disappears from Discover and every list. Matches, chats and
                  photos stay safe. Signing back in resumes it.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPauseOpen(true)}
                className="btn-ghost shrink-0 px-4 py-2.5 text-xs"
              >
                Pause account
              </button>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-rose/20 bg-rose/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Trash2 className="h-4 w-4 text-rose" />
                  Delete my account
                </p>
                <p className="mt-1 text-[0.625rem] leading-relaxed text-ink-400">
                  Permanently removes your profile, photos, matches and messages. This cannot
                  be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-rose/30 bg-rose/10 px-4 py-2.5 text-xs font-semibold text-rose transition hover:border-rose/50 hover:bg-rose/15 active:scale-[0.985]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete account
              </button>
            </div>
          </div>
        </section>

        <section className="panel p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white">Sign out</h2>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-400">
                Leave this device signed in as {firstName}? Sign out and come back any time.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void clearBackgroundSession();
                logout();
                navigate('/welcome', { replace: true });
              }}
              className="btn-subtle shrink-0 self-start sm:self-auto"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </section>
      </div>

      <Modal
        open={pauseOpen}
        onClose={() => {
          if (!pausing) setPauseOpen(false);
        }}
        title="Pause your account?"
        description="Your profile will be hidden and you will be signed out on every device."
      >
        <div className="space-y-4 pb-2">
          <ul className="space-y-2.5 text-[0.75rem] leading-relaxed text-ink-300">
            {[
              'Your profile, photos and bio stay exactly as they are.',
              'Your matches and conversations are kept for when you return.',
              'Nobody new can see or like your profile while it is paused.',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky/15 text-sky">
                  <Check className="h-2.5 w-2.5" />
                </span>
                {line}
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setPauseOpen(false)}
              disabled={pausing}
              className="btn-ghost"
            >
              Keep my account
            </button>
            <button
              type="button"
              onClick={() => void pauseAccount()}
              disabled={pausing}
              className="btn-primary"
            >
              {pausing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
              {pausing ? 'Pausing…' : 'Pause account'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={closeDelete}
        title="Delete your account?"
        description="This permanently erases your HobyMine profile. There is no undo and no recovery."
      >
        <div className="space-y-4 pb-2">
          <div className="rounded-2xl border border-rose/25 bg-rose/[0.06] p-3.5">
            <p className="flex items-start gap-2 text-[0.6875rem] leading-relaxed text-ink-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose" />
              <span>
                Your photos, bio, likes, matches and every message you sent will be deleted.
                Other people will no longer find your profile.
              </span>
            </p>
          </div>

          <PasswordField
            id="delete-password"
            label="Confirm your password"
            value={deletePassword}
            onChange={setDeletePassword}
            autoComplete="current-password"
            placeholder="Your current password"
            disabled={deleting}
          />

          <div>
            <label htmlFor="delete-confirm" className="label">
              Type DELETE to confirm
            </label>
            <input
              id="delete-confirm"
              type="text"
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="DELETE"
              disabled={deleting}
              className={cn(
                'field uppercase tracking-[0.2em] placeholder:normal-case placeholder:tracking-normal',
                deleteConfirm.length > 0 &&
                  deleteConfirm.trim().toUpperCase() !== 'DELETE' &&
                  'border-rose/40',
              )}
            />
          </div>

          {deleteError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose/25 bg-rose/[0.07] px-3 py-2 text-[0.6875rem] leading-relaxed text-rose"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {deleteError}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button type="button" onClick={closeDelete} disabled={deleting} className="btn-ghost">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void deleteAccount()}
              disabled={!canDelete || deleting}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-rose/40 bg-rose/15 px-4 py-3 text-sm font-bold text-rose transition hover:bg-rose/20 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? 'Deleting…' : 'Delete forever'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

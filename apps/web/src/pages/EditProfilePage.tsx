import {
  ArrowLeft,
  Baby,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Heart,
  ImagePlus,
  Languages,
  Loader2,
  Mic,
  Minus,
  PawPrint,
  Plus,
  Ruler,
  Save,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CountryPicker } from '../components/CountryPicker';
import { Spinner } from '../components/Spinner';
import { VoiceIntroRecorder } from '../components/VoiceIntro';
import { api, ApiClientError } from '../lib/api';
import { mediaUrl } from '../lib/media';
import { ensureCamera, ensurePhotoAccess } from '../lib/permissions';
import { prepareImageForUpload } from '../lib/image';
import {
  INTERESTS,
  LANGUAGES,
  LIFESTYLE_TAGS,
  MAX_PHOTOS,
  RELATIONSHIP_GOALS,
  cn,
  interestEmoji,
} from '../lib/utils';
import { useAuthStore } from '../store/auth';
import type { Gender, MeUser } from '../types';

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'nonbinary', label: 'Non-binary' },
];

const YES_NO: { value: 'yes' | 'no'; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const WANTS_KIDS_OPTIONS: { value: 'yes' | 'maybe' | 'no'; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'no', label: 'No' },
];

const PET_TYPES = ['Dog', 'Cat', 'Bird', 'Fish', 'Rabbit', 'Reptile', 'Other'] as const;

/** Small round -/+ control shared by the kids and pets counts. */
function CountStepper({
  value,
  onChange,
  max,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  max: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label={`Decrease ${label}`}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-ink-300 transition hover:border-neon/40 hover:text-white disabled:opacity-30"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-6 text-center text-sm font-bold text-white">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`Increase ${label}`}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-ink-300 transition hover:border-neon/40 hover:text-white disabled:opacity-30"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function EditProfilePage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState(user?.name ?? '');
  const [age, setAge] = useState(String(user?.age ?? 25));
  const [gender, setGender] = useState<Gender>(user?.gender ?? 'woman');
  const [job, setJob] = useState(user?.job ?? '');
  const [countryCode, setCountryCode] = useState(user?.countryCode ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [interests, setInterests] = useState<string[]>(user?.interests ?? []);
  const [customInterest, setCustomInterest] = useState('');
  const [lifestyle, setLifestyle] = useState<string[]>(user?.lifestyle ?? []);
  const [languages, setLanguages] = useState<string[]>(user?.languages ?? []);
  const [heightCm, setHeightCm] = useState(user?.heightCm ? String(user.heightCm) : '');
  const [relationshipGoal, setRelationshipGoal] = useState(user?.relationshipGoal ?? '');
  const [hasKids, setHasKids] = useState<'yes' | 'no' | ''>(user?.hasKids ?? '');
  const [wantsKids, setWantsKids] = useState<'yes' | 'no' | 'maybe' | ''>(
    user?.wantsKids ?? '',
  );
  const [kidsCount, setKidsCount] = useState(user?.kidsCount ?? 1);
  const [hasPets, setHasPets] = useState<'yes' | 'no' | ''>(user?.hasPets ?? '');
  const [petTypes, setPetTypes] = useState<string[]>(user?.petTypes ?? []);
  const [petsCount, setPetsCount] = useState(user?.petsCount ?? 1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setAge(String(user.age));
    setGender(user.gender);
    setJob(user.job);
    setCountryCode(user.countryCode);
    setBio(user.bio);
    setInterests(user.interests);
    setLifestyle(user.lifestyle);
    setLanguages(user.languages);
    setHeightCm(user.heightCm ? String(user.heightCm) : '');
    setRelationshipGoal(user.relationshipGoal);
    setHasKids(user.hasKids ?? '');
    setWantsKids(user.wantsKids ?? '');
    setKidsCount(user.kidsCount ?? 1);
    setHasPets(user.hasPets ?? '');
    setPetTypes(user.petTypes ?? []);
    setPetsCount(user.petsCount ?? 1);
  }, [user?.id]);

  // The profile page links to /profile/edit#voice, so land on the recorder.
  useEffect(() => {
    if (window.location.hash !== '#voice') return;
    const section = document.getElementById('voice');
    if (!section) return;
    const frame = window.requestAnimationFrame(() => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!user) return null;

  const toggleInterest = (label: string): void => {
    setInterests((current) => {
      if (current.includes(label)) return current.filter((item) => item !== label);
      if (current.length >= 12) {
        toast.error('You can pick up to 12 interests');
        return current;
      }
      return [...current, label];
    });
  };

  const addCustomInterest = (): void => {
    const label = customInterest.trim().replace(/\s+/g, ' ');
    if (!label) return;
    if (label.length > 32) {
      toast.error('Keep interests under 32 characters');
      return;
    }
    if (interests.some((item) => item.toLowerCase() === label.toLowerCase())) {
      toast.error('That interest is already on your profile');
      return;
    }
    if (interests.length >= 12) {
      toast.error('You can pick up to 12 interests');
      return;
    }
    setInterests((current) => [...current, label]);
    setCustomInterest('');
  };

  const toggleLifestyle = (label: string): void => {
    setLifestyle((current) => {
      if (current.includes(label)) return current.filter((item) => item !== label);
      if (current.length >= 8) {
        toast.error('You can pick up to 8 lifestyle tags');
        return current;
      }
      return [...current, label];
    });
  };

  const toggleLanguage = (label: string): void => {
    setLanguages((current) => {
      if (current.includes(label)) return current.filter((item) => item !== label);
      if (current.length >= 6) {
        toast.error('You can pick up to 6 languages');
        return current;
      }
      return [...current, label];
    });
  };

  /** Pets are a single choice; tapping the active kind clears it. */
  const selectPetType = (label: string): void => {
    setPetTypes((current) => (current[0] === label ? [] : [label]));
  };

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Photos must be under 10 MB');
      return;
    }
    // Ask for library access up front so Android does not silently drop the
    // pick when the photo permission has not been granted yet.
    const access = await ensurePhotoAccess();
    if (!access.granted && access.reason === 'denied') {
      toast.error('Photo access is needed to add pictures', {
        description: 'Allow photo access in Android settings and try again.',
      });
      return;
    }
    setUploading(true);
    try {
      // Re-encode to JPEG first: Android galleries hand over HEIC files that
      // many browsers cannot decode or show.
      const prepared = await prepareImageForUpload(file);
      const form = new FormData();
      form.append('photo', prepared.file);
      const data = await api.upload<{ user: MeUser; url: string }>('/api/me/photos', form);
      setUser(data.user);
      if (prepared.previewUrl) URL.revokeObjectURL(prepared.previewUrl);
      toast.success('Photo added');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not upload photo');
    } finally {
      setUploading(false);
    }
  };

  const takePhoto = async (): Promise<void> => {
    const access = await ensureCamera();
    if (!access.granted) {
      toast.error(
        access.reason === 'unavailable'
          ? 'No camera available on this device'
          : 'Camera access is needed to take a photo',
        access.reason === 'denied'
          ? { description: 'Allow camera access in Android settings and try again.' }
          : undefined,
      );
      return;
    }
    cameraInputRef.current?.click();
  };

  const reorderPhotos = async (from: number, to: number): Promise<void> => {
    if (to < 0 || to >= user.photos.length || from === to) return;
    const photos = [...user.photos];
    const [moved] = photos.splice(from, 1);
    if (!moved) return;
    photos.splice(to, 0, moved);
    try {
      const data = await api.patch<{ user: MeUser }>('/api/me/photos', { photos });
      setUser(data.user);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not reorder photos');
    }
  };

  const removePhoto = async (url: string): Promise<void> => {
    setRemoving(url);
    try {
      const data = await api.delete<{ user: MeUser }>('/api/me/photos', { url });
      setUser(data.user);
      toast.success('Photo removed');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not remove photo');
    } finally {
      setRemoving(null);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (saving) return;
    if (name.trim().length < 2) {
      toast.error('Your name needs at least 2 characters');
      return;
    }
    const ageValue = Number(age);
    if (!Number.isFinite(ageValue) || ageValue < 18 || ageValue > 99) {
      toast.error('Age must be between 18 and 99');
      return;
    }
    if (!countryCode) {
      toast.error('Choose your country so discovery can find the right people');
      return;
    }
    let heightValue: number | null = null;
    if (heightCm.trim()) {
      heightValue = Number(heightCm);
      if (!Number.isFinite(heightValue) || heightValue < 120 || heightValue > 230) {
        toast.error('Height must be between 120 and 230 cm');
        return;
      }
      heightValue = Math.round(heightValue);
    }
    if (hasKids === 'yes' && (kidsCount < 1 || kidsCount > 10)) {
      toast.error('Kids must be between 1 and 10');
      return;
    }
    if (hasPets === 'yes' && petTypes.length === 0) {
      toast.error('Pick the kind of pet you have');
      return;
    }
    if (hasPets === 'yes' && (petsCount < 1 || petsCount > 20)) {
      toast.error('Pets must be between 1 and 20');
      return;
    }

    setSaving(true);
    try {
      const data = await api.patch<{ user: MeUser }>('/api/me', {
        name: name.trim(),
        age: ageValue,
        gender,
        job: job.trim(),
        countryCode,
        bio: bio.trim(),
        interests,
        lifestyle,
        languages,
        heightCm: heightValue,
        relationshipGoal,
        hasKids: hasKids || null,
        wantsKids: wantsKids || null,
        kidsCount: hasKids === 'yes' ? kidsCount : null,
        hasPets: hasPets || null,
        petTypes: hasPets === 'yes' ? petTypes : [],
        petsCount: hasPets === 'yes' ? petsCount : null,
      });
      setUser(data.user);
      toast.success('Profile updated');
      navigate('/profile');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-slide-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/profile"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-ink-300 transition hover:text-white"
            aria-label="Back to profile"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.28em] text-neon">Profile</p>
            <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
              Make it yours
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const form = document.getElementById('edit-profile-form') as HTMLFormElement | null;
            form?.requestSubmit();
          }}
          disabled={saving}
          className="btn-primary px-4 py-2.5 text-xs"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <form
        id="edit-profile-form"
        onSubmit={(event) => void submit(event)}
        className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]"
      >
        <section className="panel h-fit p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Photos</h2>
              <p className="mt-1 text-[0.6875rem] text-ink-400">
                {user.photos.length}/{MAX_PHOTOS} · your first photo is the cover.
              </p>
            </div>
            <Camera className="h-4 w-4 text-neon" />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {user.photos.map((photo, index) => (
              <div
                key={photo}
                className="force-dark group relative aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-ink-800"
              >
                <img
                  src={mediaUrl(photo) ?? undefined}
                  alt={`Profile ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                {index === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-neon px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-ink-950">
                    Cover
                  </span>
                )}
                {user.photos.length > 1 && (
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => void reorderPhotos(index, index - 1)}
                      disabled={index === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white/80 backdrop-blur transition hover:text-white disabled:opacity-30"
                      aria-label="Move photo earlier"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => void reorderPhotos(index, 0)}
                        className="rounded bg-black/65 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-white/80"
                      >
                        Cover
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void reorderPhotos(index, index + 1)}
                      disabled={index === user.photos.length - 1}
                      className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white/80 backdrop-blur transition hover:text-white disabled:opacity-30"
                      aria-label="Move photo later"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void removePhoto(photo)}
                  disabled={removing === photo || user.photos.length <= 1}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white/80 backdrop-blur transition hover:bg-rose hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={`Remove photo ${index + 1}`}
                  title={user.photos.length <= 1 ? 'Keep at least one photo' : 'Remove photo'}
                >
                  {removing === photo ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            ))}

            {user.photos.length < MAX_PHOTOS && (
              <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-ink-400">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex flex-col items-center gap-1.5 transition hover:text-neon disabled:opacity-50"
                  aria-label="Add a photo from your library"
                >
                  {uploading ? (
                    <Spinner className="h-5 w-5" />
                  ) : (
                    <>
                      <ImagePlus className="h-5 w-5" />
                      <span className="text-[0.5625rem] font-semibold uppercase tracking-wider">Add</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void takePhoto()}
                  disabled={uploading}
                  className="flex items-center gap-1 text-[0.5625rem] font-semibold uppercase tracking-wider transition hover:text-neon disabled:opacity-50"
                  aria-label="Take a photo with the camera"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Camera
                </button>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void uploadPhoto(event)}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => void uploadPhoto(event)}
          />

          <div className="mt-4 rounded-xl border border-sky/15 bg-sky/[0.04] p-3 text-[0.65625rem] leading-relaxed text-ink-300">
            <span className="font-semibold text-sky">Photo tip:</span> use a clear face shot for
            your cover, then show a hobby, a place you love, and your best unfiltered laugh.
          </div>
        </section>

        <div className="space-y-5">
          <section className="panel p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-white">The basics</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="edit-name" className="label">
                  Name
                </label>
                <input
                  id="edit-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={40}
                  required
                  minLength={2}
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="edit-age" className="label">
                  Age
                </label>
                <input
                  id="edit-age"
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
                <label htmlFor="edit-job" className="label">
                  What you do
                </label>
                <input
                  id="edit-job"
                  value={job}
                  onChange={(event) => setJob(event.target.value)}
                  maxLength={80}
                  placeholder="Product designer"
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="edit-country" className="label">
                  Country
                </label>
                <CountryPicker
                  id="edit-country"
                  value={countryCode}
                  onChange={setCountryCode}
                  placeholder="Choose your country"
                  required
                />
                <p className="mt-1.5 text-[0.625rem] text-ink-500">
                  Used to anchor your discovery deck and distance.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <span className="label">I am</span>
              <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/8 bg-ink-900 p-1.5">
                {GENDERS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setGender(option.value)}
                    className={cn(
                      'rounded-xl px-2 py-2.5 text-xs font-semibold transition',
                      gender === option.value
                        ? 'bg-neon text-ink-950 shadow-glow-sm'
                        : 'text-ink-300 hover:bg-white/5 hover:text-white',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <label htmlFor="edit-bio" className="label mb-0">
                  Bio
                </label>
                <span className="text-[0.625rem] text-ink-500">{bio.length}/500</span>
              </div>
              <textarea
                id="edit-bio"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                rows={4}
                maxLength={500}
                placeholder="The thing you'd tell a friend across the table. Keep it specific."
                className="field mt-2 resize-none"
              />
              <p className="mt-1.5 text-[0.625rem] text-ink-500">
                Mention a place, a ritual, or a mild dare — it gives people something to reply to.
              </p>
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Interests</h2>
                <p className="mt-1 text-[0.6875rem] text-ink-400">
                  Pick up to 12. Shared interests are highlighted in the deck.
                </p>
              </div>
              <span className="rounded-full bg-neon/10 px-2.5 py-1 text-[0.625rem] font-bold text-neon">
                {interests.length}/12
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {INTERESTS.map((interest) => {
                const active = interests.includes(interest.label);
                return (
                  <button
                    key={interest.label}
                    type="button"
                    onClick={() => toggleInterest(interest.label)}
                    className={cn('chip px-3 py-2', active && 'chip-active')}
                  >
                    <span aria-hidden="true">{interest.emoji}</span>
                    {interest.label}
                    {active ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Plus className="h-3 w-3 opacity-50" />
                    )}
                  </button>
                );
              })}
              {interests
                .filter((label) => !INTERESTS.some((interest) => interest.label === label))
                .map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleInterest(label)}
                    className="chip chip-active px-3 py-2"
                  >
                    <span aria-hidden="true">{interestEmoji(label)}</span>
                    {label}
                    <X className="h-3 w-3" />
                  </button>
                ))}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <input
                value={customInterest}
                onChange={(event) => setCustomInterest(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addCustomInterest();
                  }
                }}
                maxLength={32}
                placeholder="Add your own interest"
                aria-label="Add a custom interest"
                className="field h-10 flex-1 py-2 text-xs"
              />
              <button
                type="button"
                onClick={addCustomInterest}
                disabled={!customInterest.trim()}
                className="btn-ghost h-10 shrink-0 px-3 py-2 text-xs disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
            <p className="mt-2 text-[0.625rem] text-ink-500">
              Anything goes — from bouldering to vinyl. Custom interests show with a sparkle.
            </p>
          </section>

          <section className="panel p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Sparkles className="h-4 w-4 text-violet" />
                  More about you
                </h2>
                <p className="mt-1 text-[0.6875rem] text-ink-400">
                  These details help people start a better conversation.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <span className="label flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5 text-neon" />
                Looking for
              </span>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {RELATIONSHIP_GOALS.map((goal) => {
                  const active = relationshipGoal === goal;
                  return (
                    <button
                      key={goal}
                      type="button"
                      onClick={() => setRelationshipGoal(active ? '' : goal)}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-[0.6875rem] font-semibold transition',
                        active
                          ? 'border-neon/40 bg-neon/10 text-neon-soft'
                          : 'border-white/8 bg-white/[0.02] text-ink-300 hover:border-white/15 hover:text-white',
                      )}
                    >
                      {goal}
                      {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 sm:max-w-[15rem]">
              <label htmlFor="edit-height" className="label flex items-center gap-1.5">
                <Ruler className="h-3.5 w-3.5 text-sky" />
                Height (cm)
              </label>
              <input
                id="edit-height"
                type="number"
                inputMode="numeric"
                min={120}
                max={230}
                value={heightCm}
                onChange={(event) => setHeightCm(event.target.value)}
                placeholder="e.g. 178"
                className="field mt-2"
              />
              <p className="mt-1.5 text-[0.625rem] text-ink-500">
                Optional. Shown as centimetres and feet on your profile.
              </p>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <span className="label mb-0 flex items-center gap-1.5">
                  <Languages className="h-3.5 w-3.5 text-sky" />
                  Languages
                </span>
                <span className="text-[0.625rem] text-ink-500">{languages.length}/6</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {LANGUAGES.map((language) => {
                  const active = languages.includes(language);
                  return (
                    <button
                      key={language}
                      type="button"
                      onClick={() => toggleLanguage(language)}
                      className={cn('chip px-3 py-1.5', active && 'chip-active')}
                    >
                      {language}
                      {active && <Check className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <span className="label mb-0 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-violet" />
                  Lifestyle
                </span>
                <span className="text-[0.625rem] text-ink-500">{lifestyle.length}/8</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {LIFESTYLE_TAGS.map((tag) => {
                  const active = lifestyle.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleLifestyle(tag)}
                      className={cn('chip px-3 py-1.5', active && 'chip-active')}
                    >
                      {tag}
                      {active && <Check className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Baby className="h-4 w-4 text-violet" />
                  Family &amp; pets
                </h2>
                <p className="mt-1 text-[0.6875rem] text-ink-400">
                  Keep these answers current — they show on your profile and help people find a
                  good fit.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              <div className="space-y-4">
                <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <Baby className="h-3.5 w-3.5 text-violet" />
                  Kids
                </p>

                <div>
                  <p className="text-[0.6875rem] font-medium text-ink-300">Do you have kids?</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-white/8 bg-ink-900 p-1.5">
                    {YES_NO.map((option) => {
                      const active = hasKids === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setHasKids(option.value)}
                          aria-pressed={active}
                          className={cn(
                            'rounded-lg px-3 py-2 text-xs font-semibold transition',
                            active
                              ? 'bg-neon text-ink-950 shadow-glow-sm'
                              : 'text-ink-300 hover:bg-white/5 hover:text-white',
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {hasKids === 'yes' && (
                  <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-2.5">
                    <span className="text-[0.6875rem] font-medium text-ink-300">How many?</span>
                    <CountStepper
                      value={kidsCount}
                      onChange={setKidsCount}
                      max={10}
                      label="kids"
                    />
                  </div>
                )}

                <div>
                  <p className="text-[0.6875rem] font-medium text-ink-300">Do you want kids?</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl border border-white/8 bg-ink-900 p-1.5">
                    {WANTS_KIDS_OPTIONS.map((option) => {
                      const active = wantsKids === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setWantsKids(option.value)}
                          aria-pressed={active}
                          className={cn(
                            'rounded-lg px-2 py-2 text-xs font-semibold transition',
                            active
                              ? 'bg-neon text-ink-950 shadow-glow-sm'
                              : 'text-ink-300 hover:bg-white/5 hover:text-white',
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-4 sm:border-l sm:border-white/[0.06] sm:pl-6">
                <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <PawPrint className="h-3.5 w-3.5 text-amber-300" />
                  Pets
                </p>

                <div>
                  <p className="text-[0.6875rem] font-medium text-ink-300">Do you have pets?</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-white/8 bg-ink-900 p-1.5">
                    {YES_NO.map((option) => {
                      const active = hasPets === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setHasPets(option.value)}
                          aria-pressed={active}
                          className={cn(
                            'rounded-lg px-3 py-2 text-xs font-semibold transition',
                            active
                              ? 'bg-neon text-ink-950 shadow-glow-sm'
                              : 'text-ink-300 hover:bg-white/5 hover:text-white',
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {hasPets === 'yes' && (
                  <>
                    <div>
                      <p className="text-[0.6875rem] font-medium text-ink-300">What kind?</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {PET_TYPES.map((pet) => {
                          const active = petTypes[0] === pet;
                          return (
                            <button
                              key={pet}
                              type="button"
                              onClick={() => selectPetType(pet)}
                              aria-pressed={active}
                              className={cn('chip px-3 py-1.5', active && 'chip-active')}
                            >
                              {pet}
                              {active && <Check className="h-3 w-3" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-2.5">
                      <span className="text-[0.6875rem] font-medium text-ink-300">How many?</span>
                      <CountStepper
                        value={petsCount}
                        onChange={setPetsCount}
                        max={20}
                        label="pets"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <Link
              to="/preferences"
              className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-3 text-[0.6875rem] font-semibold text-ink-300 transition hover:border-neon/30 hover:text-white"
            >
              <span className="flex items-center gap-2">
                <Compass className="h-3.5 w-3.5 text-neon" />
                Who you meet, age range and distance
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" />
            </Link>
          </section>

          <section id="voice" className="panel scroll-mt-24 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Mic className="h-4 w-4 text-neon" />
                  Your voice intro
                </h2>
                <p className="mt-1 text-[0.6875rem] text-ink-400">
                  A short hello in your own voice. Other members can play it right inside your
                  full profile.
                </p>
              </div>
              {user.voiceIntro && (
                <span className="shrink-0 rounded-full border border-neon/30 bg-neon/10 px-2.5 py-1 text-[0.5625rem] font-bold uppercase tracking-[0.12em] text-neon">
                  Saved
                </span>
              )}
            </div>
            <VoiceIntroRecorder
              intro={user.voiceIntro}
              onChange={setUser}
              className="mt-4"
            />
          </section>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link to="/profile" className="btn-ghost flex-1">
              <X className="h-4 w-4" />
              Cancel
            </Link>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>

          <p className="flex items-center justify-center gap-1.5 text-[0.625rem] text-ink-600">
            <UserRound className="h-3 w-3" />
            Changes appear in discovery immediately.
          </p>
        </div>
      </form>
    </div>
  );
}

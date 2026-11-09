import {
  ArrowRight,
  Baby,
  Camera,
  Check,
  Heart,
  ImagePlus,
  Languages,
  Loader2,
  MapPin,
  Minus,
  PawPrint,
  Plus,
  Ruler,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CountryPicker } from '../components/CountryPicker';
import { LocationModeToggle, type LocationMode } from '../components/LocationModeToggle';
import { Logo } from '../components/Logo';
import { DualRangeSlider, RangeSlider } from '../components/RangeSlider';
import { Spinner } from '../components/Spinner';
import { api, ApiClientError } from '../lib/api';
import { countryByCode } from '../lib/countries';
import { prepareImageForUpload } from '../lib/image';
import { detectLocation } from '../lib/location';
import { mediaUrl } from '../lib/media';
import { ensureCamera, ensurePhotoAccess } from '../lib/permissions';
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
import type { Gender, InterestedIn, MeUser } from '../types';

const STEPS = [
  {
    title: 'Show your face',
    text: 'Add at least one photo so people can actually find you in the deck.',
  },
  {
    title: 'The basics',
    text: 'Your name, age and the few lines people read before they swipe.',
  },
  {
    title: 'More about you',
    text: 'The details that turn a profile into an easy first message.',
  },
  {
    title: 'Family & pets',
    text: 'A few quick answers about home life, so the right people find you.',
  },
  {
    title: 'What you love',
    text: 'Pick a few interests. Shared ones light up on your card.',
  },
  {
    title: 'Who you want to meet',
    text: 'Set the mix and age range for your discovery deck.',
  },
  {
    title: 'Where and how far',
    text: 'Choose whether to stay nearby or open up the whole world.',
  },
] as const;

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'nonbinary', label: 'Non-binary' },
];

const INTERESTED_IN: { value: InterestedIn; label: string; icon: typeof Heart }[] = [
  { value: 'women', label: 'Women', icon: Heart },
  { value: 'men', label: 'Men', icon: Users },
  { value: 'everyone', label: 'Everyone', icon: Sparkles },
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

/** Small round -/+ control used for the two "how many" questions. */
function CountStepper({
  value,
  onChange,
  max,
}: {
  value: number;
  onChange: (next: number) => void;
  max: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label="Decrease"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-ink-300 transition hover:border-neon/40 hover:text-white disabled:opacity-30"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-6 text-center text-sm font-bold text-white">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Increase"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-ink-300 transition hover:border-neon/40 hover:text-white disabled:opacity-30"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function OnboardingPage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState(0);
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
  const [interestedIn, setInterestedIn] = useState<InterestedIn>(
    user?.preferences.interestedIn ?? 'everyone',
  );
  const [ageRange, setAgeRange] = useState<[number, number]>([
    user?.preferences.ageMin ?? 21,
    user?.preferences.ageMax ?? 40,
  ]);
  const [distance, setDistance] = useState(user?.preferences.maxDistance ?? 50);
  const [locationMode, setLocationMode] = useState<LocationMode>(
    user?.preferences.locationMode ?? 'global',
  );
  const [discoveryCountry, setDiscoveryCountry] = useState(user?.preferences.countryCode ?? '');
  const [locating, setLocating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const selectedCountry = countryByCode(countryCode);
  const discoveryCountryData = discoveryCountry ? countryByCode(discoveryCountry) : null;

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
    const access = await ensurePhotoAccess();
    if (!access.granted && access.reason === 'denied') {
      toast.error('Photo access is needed to add pictures', {
        description: 'Allow photo access in Android settings and try again.',
      });
      return;
    }
    setUploading(true);
    try {
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

  /** Pets are a single choice: tapping the active kind clears it. */
  const selectPetType = (label: string): void => {
    setPetTypes((current) => (current[0] === label ? [] : [label]));
  };

  const saveBasics = async (): Promise<void> => {
    if (name.trim().length < 2) {
      toast.error('Your name needs at least 2 characters');
      return;
    }
    const ageValue = Number(age);
    if (!Number.isFinite(ageValue) || ageValue < 18 || ageValue > 99) {
      toast.error('Age must be between 18 and 99');
      return;
    }
    if (!job.trim()) {
      toast.error('Tell people what you do');
      return;
    }
    if (!countryCode) {
      toast.error('Choose your country so discovery can find the right people');
      return;
    }
    if (bio.trim().length < 20) {
      toast.error('Write at least 20 characters in your bio', {
        description: 'A sentence or two gives people something to reply to.',
      });
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
      });
      setUser(data.user);
      setStep(2);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  };

  const saveMore = async (): Promise<void> => {
    if (!relationshipGoal) {
      toast.error('Pick what you are looking for');
      return;
    }
    if (languages.length === 0) {
      toast.error('Add at least one language');
      return;
    }
    if (lifestyle.length < 2) {
      toast.error('Pick at least two lifestyle tags');
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
    setSaving(true);
    try {
      const data = await api.patch<{ user: MeUser }>('/api/me', {
        relationshipGoal,
        heightCm: heightValue,
        languages,
        lifestyle,
      });
      setUser(data.user);
      setStep(3);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  };

  const saveFamily = async (): Promise<void> => {
    if (!hasKids) {
      toast.error('Let people know whether you have kids');
      return;
    }
    if (!wantsKids) {
      toast.error('Pick whether you want kids');
      return;
    }
    if (!hasPets) {
      toast.error('Let people know whether you have pets');
      return;
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
        hasKids,
        wantsKids,
        kidsCount: hasKids === 'yes' ? kidsCount : null,
        hasPets,
        petTypes: hasPets === 'yes' ? petTypes : [],
        petsCount: hasPets === 'yes' ? petsCount : null,
      });
      setUser(data.user);
      setStep(4);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save your answers');
    } finally {
      setSaving(false);
    }
  };

  const saveInterests = async (): Promise<void> => {
    if (interests.length < 3) {
      toast.error('Pick at least three interests');
      return;
    }
    setSaving(true);
    try {
      const data = await api.patch<{ user: MeUser }>('/api/me', { interests });
      setUser(data.user);
      setStep(5);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save interests');
    } finally {
      setSaving(false);
    }
  };

  const useMyLocation = async (): Promise<void> => {
    if (locating) return;
    setLocating(true);
    try {
      const detected = await detectLocation();
      if (!detected) {
        toast.error('Could not read your location', {
          description: 'Allow location access in the app settings and try again.',
        });
        return;
      }
      const data = await api.put<{ user: MeUser }>('/api/me/location', {
        latitude: detected.latitude,
        longitude: detected.longitude,
        city: detected.city ?? undefined,
        countryCode: detected.countryCode ?? undefined,
      });
      setUser(data.user);
      setLocationMode('nearby');
      if (detected.countryCode) setDiscoveryCountry(detected.countryCode);
      toast.success('Location updated', {
        description: detected.city
          ? `Showing people near ${detected.city}.`
          : 'Showing people near you.',
      });
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not save your location',
      );
    } finally {
      setLocating(false);
    }
  };

  const finish = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    try {
      const data = await api.patch<{ user: MeUser }>('/api/me/preferences', {
        interestedIn,
        ageMin: ageRange[0],
        ageMax: ageRange[1],
        maxDistance: distance,
        locationMode,
        countryCode: discoveryCountry || null,
      });
      setUser(data.user);
      toast.success('You’re in', { description: 'Your profile is live in discovery.' });
      navigate('/discover', { replace: true });
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not save your preferences',
      );
    } finally {
      setSaving(false);
    }
  };

  const current = STEPS[step];

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-canvas">
      <div className="app-ambient" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[28rem] flex-col px-5 pb-[calc(2rem+min(max(var(--safe-bottom,0px),env(safe-area-inset-bottom,0px)),3.5rem))] pt-[calc(2rem+min(max(var(--safe-top,0px),env(safe-area-inset-top,0px)),3.5rem))] sm:px-8">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="text-[0.625rem] font-bold uppercase tracking-[0.22em] text-ink-500">
            {step + 1} / {STEPS.length}
          </span>
        </div>

        <div className="mt-6 flex gap-1.5" aria-hidden="true">
          {STEPS.map((_, index) => (
            <span
              key={STEPS[index].title}
              className={cn(
                'h-1 flex-1 rounded-full',
                index <= step ? 'bg-neon shadow-glow-sm' : 'bg-white/10',
              )}
            />
          ))}
        </div>

        <p className="mt-8 flex items-center gap-2 text-[0.625rem] font-bold uppercase tracking-[0.28em] text-neon">
          <Sparkles className="h-3 w-3" />
          Set up your profile
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
          {current.title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">{current.text}</p>

        <div className="mt-6 flex-1">
          {step === 0 && (
            <div>
              <div className="grid grid-cols-3 gap-2.5">
                {user.photos.map((photo, index) => (
                  <div
                    key={photo}
                    className="relative aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-ink-800"
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
                          <span className="text-[0.5625rem] font-semibold uppercase tracking-wider">
                            Add
                          </span>
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
              <p className="mt-4 text-[0.6875rem] leading-relaxed text-ink-500">
                A clear face shot first, then a hobby or a place you love. You can add more later.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="onboard-name" className="label">
                    Name
                  </label>
                  <input
                    id="onboard-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={40}
                    required
                    minLength={2}
                    className="field"
                  />
                </div>
                <div>
                  <label htmlFor="onboard-age" className="label">
                    Age
                  </label>
                  <input
                    id="onboard-age"
                    type="number"
                    min={18}
                    max={99}
                    value={age}
                    onChange={(event) => setAge(event.target.value)}
                    className="field"
                    required
                  />
                </div>
              </div>

              <div>
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

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="onboard-job" className="label">
                    What you do
                  </label>
                  <input
                    id="onboard-job"
                    value={job}
                    onChange={(event) => setJob(event.target.value)}
                    maxLength={80}
                    placeholder="Product designer"
                    className="field"
                  />
                </div>
                <div>
                  <label htmlFor="onboard-country" className="label">
                    Country
                  </label>
                  <CountryPicker
                    id="onboard-country"
                    value={countryCode}
                    onChange={setCountryCode}
                    placeholder="Choose your country"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="onboard-bio" className="label mb-0">
                    Bio
                  </label>
                  <span className="text-[0.625rem] text-ink-500">{bio.length}/500</span>
                </div>
                <textarea
                  id="onboard-bio"
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  rows={5}
                  maxLength={500}
                  placeholder="The thing you'd tell a friend across the table. Keep it specific."
                  className="field mt-2 resize-none"
                />
                <p className="mt-1.5 text-[0.625rem] text-ink-500">
                  At least 20 characters — mention a place, a ritual, or a mild dare.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
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

              <div className="sm:max-w-[15rem]">
                <label htmlFor="onboard-height" className="label flex items-center gap-1.5">
                  <Ruler className="h-3.5 w-3.5 text-sky" />
                  Height (cm)
                </label>
                <input
                  id="onboard-height"
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

              <div>
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

              <div>
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
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <Baby className="h-4 w-4 text-neon" />
                  <h2 className="text-sm font-semibold text-white">Kids</h2>
                </div>

                <div className="mt-4 space-y-4">
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
                      <span className="text-[0.6875rem] font-medium text-ink-300">
                        How many?
                      </span>
                      <CountStepper value={kidsCount} onChange={setKidsCount} max={10} />
                    </div>
                  )}

                  <div>
                    <p className="text-[0.6875rem] font-medium text-ink-300">
                      Do you want kids?
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl border border-white/8 bg-ink-900 p-1.5">
                      {WANTS_KIDS_OPTIONS.map((option) => {
                        const active = wantsKids === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setWantsKids(option.value)}
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
              </section>

              <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <PawPrint className="h-4 w-4 text-sky" />
                  <h2 className="text-sm font-semibold text-white">Pets</h2>
                </div>

                <div className="mt-4 space-y-4">
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
                        <span className="text-[0.6875rem] font-medium text-ink-300">
                          How many?
                        </span>
                        <CountStepper value={petsCount} onChange={setPetsCount} max={20} />
                      </div>
                    </>
                  )}
                </div>
              </section>

              <p className="px-1 text-[0.625rem] leading-relaxed text-ink-500">
                These answers appear on your profile and help people find a good fit.
              </p>
            </div>
          )}

          {step === 4 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[0.6875rem] text-ink-400">Pick up to 12. Three is the minimum.</p>
                <span className="rounded-full bg-neon/10 px-2.5 py-1 text-[0.625rem] font-bold text-neon">
                  {interests.length}/12
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
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
                      {active ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 opacity-50" />}
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
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-neon" />
                  <h2 className="text-sm font-semibold text-white">Who you want to meet</h2>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl border border-white/8 bg-ink-900 p-1.5">
                  {INTERESTED_IN.map((option) => {
                    const active = interestedIn === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setInterestedIn(option.value)}
                        className={cn(
                          'flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-xs font-semibold transition',
                          active
                            ? 'bg-neon text-ink-950 shadow-glow-sm'
                            : 'text-ink-300 hover:bg-white/5 hover:text-white',
                        )}
                      >
                        <option.icon
                          className={cn('h-4 w-4', active ? 'text-ink-950' : 'text-ink-400')}
                        />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-sky" />
                  <h2 className="text-sm font-semibold text-white">Age range</h2>
                </div>
                <div className="mt-7">
                  <DualRangeSlider min={18} max={60} value={ageRange} onChange={setAgeRange} />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {[0, 1].map((index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-white/8 bg-white/[0.025] px-3.5 py-3"
                    >
                      <p className="text-[0.5625rem] font-bold uppercase tracking-wider text-ink-500">
                        {index === 0 ? 'Youngest' : 'Oldest'}
                      </p>
                      <p className="mt-1 text-lg font-bold text-white">
                        {ageRange[index]}{' '}
                        <span className="text-[0.6875rem] font-normal text-ink-500">years</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-neon" />
                  <h2 className="text-sm font-semibold text-white">Where you are</h2>
                </div>
                <p className="mt-1 text-[0.6875rem] text-ink-400">
                  Share your GPS position to meet people around you, or keep it wide and discover
                  the world.
                </p>
                <div className="mt-4">
                  <LocationModeToggle mode={locationMode} onChange={setLocationMode} />
                </div>
                <button
                  type="button"
                  onClick={() => void useMyLocation()}
                  disabled={locating}
                  className="btn-ghost mt-4 w-full py-2.5 text-xs disabled:opacity-50"
                >
                  {locating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MapPin className="h-4 w-4 text-neon" />
                  )}
                  {locating ? 'Locating…' : 'Use my current location'}
                </button>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-sky" />
                  <h2 className="text-sm font-semibold text-white">How far you&rsquo;ll look</h2>
                </div>
                <div className="mt-7">
                  <RangeSlider
                    min={1}
                    max={5000}
                    value={distance}
                    onChange={setDistance}
                    formatValue={(value) =>
                      value >= 1000 ? `${Math.round(value / 1000)}k km` : `${value} km`
                    }
                  />
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {[25, 500, 5000].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDistance(value)}
                      className={cn('chip justify-center', distance === value && 'chip-active')}
                    >
                      {value >= 1000 ? 'Anywhere' : `${value} km`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="onboard-discovery-country" className="label">
                  Discovery country
                </label>
                <CountryPicker
                  id="onboard-discovery-country"
                  value={discoveryCountry}
                  onChange={setDiscoveryCountry}
                  placeholder="Anywhere in the world"
                  allowClear
                />
                <p className="mt-2 text-[0.625rem] leading-relaxed text-ink-500">
                  {discoveryCountryData
                    ? `Only people in ${discoveryCountryData.name} will appear in your deck.`
                    : 'Leave this empty to see people everywhere within your distance setting.'}
                </p>
              </div>

              <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-3">
                <p className="text-[0.5625rem] font-bold uppercase tracking-wider text-ink-500">
                  Your country
                </p>
                <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
                  {selectedCountry ? (
                    <>
                      <span aria-hidden="true">{selectedCountry.flag}</span>
                      {selectedCountry.name}
                    </>
                  ) : (
                    'Not set'
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 space-y-3 pb-4">
          {step > 0 && (
            <button
              type="button"
              disabled={saving || uploading}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              className="w-full text-center text-[0.6875rem] font-semibold text-ink-400 transition hover:text-white disabled:opacity-40"
            >
              Back
            </button>
          )}

          {step === 0 && (
            <button
              type="button"
              disabled={user.photos.length === 0 || uploading}
              onClick={() => setStep(1)}
              className="btn-primary w-full"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
          {step === 1 && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveBasics()}
              className="btn-primary w-full"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Continue'}
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveMore()}
              className="btn-primary w-full"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Continue'}
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveFamily()}
              className="btn-primary w-full"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Continue'}
            </button>
          )}
          {step === 4 && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveInterests()}
              className="btn-primary w-full"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Continue'}
            </button>
          )}
          {step === 5 && (
            <button
              type="button"
              disabled={saving}
              onClick={() => setStep(6)}
              className="btn-primary w-full"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
          {step === 6 && (
            <button
              type="button"
              disabled={saving || locating}
              onClick={() => void finish()}
              className="btn-primary w-full"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {saving ? 'Saving…' : 'Start discovering'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

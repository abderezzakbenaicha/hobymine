import {
  ArrowLeft,
  Compass,
  Heart,
  Loader2,
  MapPin,
  Save,
  Sparkles,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CountryPicker } from '../components/CountryPicker';
import { LocationModeToggle, type LocationMode } from '../components/LocationModeToggle';
import { DualRangeSlider, RangeSlider } from '../components/RangeSlider';
import { api, ApiClientError } from '../lib/api';
import { countryByCode } from '../lib/countries';
import { detectLocation } from '../lib/location';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import type { InterestedIn, MeUser } from '../types';

const OPTIONS: { value: InterestedIn; label: string; icon: typeof Heart }[] = [
  { value: 'women', label: 'Women', icon: Heart },
  { value: 'men', label: 'Men', icon: Users },
  { value: 'everyone', label: 'Everyone', icon: Sparkles },
];

export function PreferencesPage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const navigate = useNavigate();

  const [interestedIn, setInterestedIn] = useState<InterestedIn>(
    user?.preferences.interestedIn ?? 'everyone',
  );
  const [age, setAge] = useState<[number, number]>([
    user?.preferences.ageMin ?? 21,
    user?.preferences.ageMax ?? 40,
  ]);
  const [distance, setDistance] = useState(user?.preferences.maxDistance ?? 50);
  const [locationMode, setLocationMode] = useState<LocationMode>(
    user?.preferences.locationMode ?? 'global',
  );
  const [locating, setLocating] = useState(false);
  const [discoveryCountry, setDiscoveryCountry] = useState(
    user?.preferences.countryCode ?? '',
  );
  const [countryCode, setCountryCode] = useState(user?.countryCode ?? '');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const selectedCountry = countryByCode(countryCode);
  const discoveryCountryData = discoveryCountry ? countryByCode(discoveryCountry) : null;

  const save = async (): Promise<void> => {
    if (saving) return;
    if (!countryCode) {
      toast.error('Choose your country before saving');
      return;
    }
    setSaving(true);
    try {
      const prefs = await api.patch<{ user: MeUser }>('/api/me/preferences', {
        interestedIn,
        ageMin: age[0],
        ageMax: age[1],
        maxDistance: distance,
        locationMode,
        countryCode: discoveryCountry || null,
      });
      setUser(prefs.user);

      if (countryCode !== user.countryCode) {
        const profile = await api.patch<{ user: MeUser }>('/api/me', {
          countryCode,
        });
        setUser(profile.user);
      }

      toast.success('Discovery updated', {
        description: 'Your deck will refresh with the new filters.',
      });
      navigate('/discover');
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not save your preferences',
      );
    } finally {
      setSaving(false);
    }
  };

  const reset = (): void => {
    setInterestedIn('everyone');
    setAge([21, 40]);
    setDistance(50);
    setLocationMode('global');
    setDiscoveryCountry('');
    toast('Reset to the house defaults');
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
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.28em] text-neon">
              Discovery
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
              Your preferences
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-primary px-4 py-2.5 text-xs"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="panel p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-neon" />
              <h2 className="text-sm font-semibold text-white">Who you want to meet</h2>
            </div>
            <p className="mt-1 text-[0.6875rem] text-ink-400">
              This changes the gender mix in your discovery deck.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-white/8 bg-ink-900 p-1.5">
              {OPTIONS.map((option) => {
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
                    <option.icon className={cn('h-4 w-4', active ? 'text-ink-950' : 'text-ink-400')} />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky" />
              <h2 className="text-sm font-semibold text-white">Age range</h2>
            </div>
            <p className="mt-1 text-[0.6875rem] text-ink-400">
              People outside this range won&rsquo;t appear in your deck.
            </p>
            <div className="mt-7">
              <DualRangeSlider min={18} max={60} value={age} onChange={setAge} />
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
                    {age[index]} <span className="text-[0.6875rem] font-normal text-ink-500">years</span>
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-neon" />
              <h2 className="text-sm font-semibold text-white">Where you are</h2>
            </div>
            <p className="mt-1 text-[0.6875rem] text-ink-400">
              Share your GPS position to meet people who are really around you, or keep it wide
              and discover the world.
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
            {user.latitude !== null && user.latitude !== undefined && (
              <p className="mt-3 flex items-center gap-2 text-[0.625rem] text-ink-500">
                <MapPin className="h-3 w-3 shrink-0 text-neon/70" />
                {user.locationCity
                  ? `${user.locationCity} · ${user.countryName ?? ''}`
                  : `GPS position shared (${user.latitude.toFixed(3)}, ${user.longitude?.toFixed(3)})`}
              </p>
            )}
          </section>

          <section className="panel p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-violet" />
              <h2 className="text-sm font-semibold text-white">How far you&rsquo;ll look</h2>
            </div>
            <p className="mt-1 text-[0.6875rem] text-ink-400">
              People in your country are always included. Slide wider to add nearby countries.
            </p>
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
          </section>

          <section className="panel p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-neon" />
              <h2 className="text-sm font-semibold text-white">Your location</h2>
            </div>
            <p className="mt-1 text-[0.6875rem] text-ink-400">
              Your country anchors distance and stays visible on your profile. We never show
              exact coordinates.
            </p>
            <div className="mt-4">
              <label htmlFor="pref-country" className="label">
                Country
              </label>
              <CountryPicker
                id="pref-country"
                value={countryCode}
                onChange={setCountryCode}
                placeholder="Choose your country"
                required
              />
            </div>
            {selectedCountry && (
              <p className="mt-3 flex items-center gap-2 text-[0.625rem] text-ink-500">
                <span aria-hidden="true" className="text-sm">
                  {selectedCountry.flag}
                </span>
                {selectedCountry.name} · {selectedCountry.region}
              </p>
            )}
            <div className="mt-5">
              <label htmlFor="pref-discovery-country" className="label">
                Discovery country
              </label>
              <CountryPicker
                id="pref-discovery-country"
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
          </section>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={reset} className="btn-ghost flex-1">
              Reset defaults
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="btn-primary flex-1"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save & show my deck'}
            </button>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="relative overflow-hidden rounded-3xl border border-neon/20 bg-gradient-to-br from-neon/[0.1] via-ink-900 to-sky/[0.04] p-5">
            <Sparkles className="h-5 w-5 text-neon" />
            <h2 className="mt-3 text-sm font-semibold text-white">Your current mix</h2>
            <dl className="mt-4 space-y-3 text-[0.6875rem]">
              <div className="flex items-center justify-between">
                <dt className="text-ink-400">Looking for</dt>
                <dd className="font-semibold capitalize text-white">{interestedIn}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink-400">Ages</dt>
                <dd className="font-semibold text-white">
                  {age[0]} – {age[1]}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink-400">Distance</dt>
                <dd className="font-semibold text-white">
                  {distance >= 1000 ? `${Math.round(distance / 1000)}k km` : `${distance} km`}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-400">Country</dt>
                <dd className="truncate text-right font-semibold text-white">
                  {selectedCountry ? `${selectedCountry.flag} ${selectedCountry.name}` : 'Not set'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-400">Deck country</dt>
                <dd className="truncate text-right font-semibold text-white">
                  {discoveryCountryData
                    ? `${discoveryCountryData.flag} ${discoveryCountryData.name}`
                    : 'Anywhere'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <h3 className="text-xs font-semibold text-white">A little nudge</h3>
            <p className="mt-1.5 text-[0.65625rem] leading-relaxed text-ink-400">
              If your deck runs dry, widen the age range by a couple of years before pushing the
              distance to 5,000 km. Quality beats quantity.
            </p>
          </div>

          <Link
            to="/plus"
            className="flex items-center gap-3 rounded-2xl border border-neon/20 bg-neon/[0.05] p-4 transition hover:border-neon/40"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neon/15">
              <Sparkles className="h-4 w-4 text-neon" />
            </div>
            <div>
              <p className="text-[0.6875rem] font-semibold text-white">See who likes you</p>
              <p className="text-[0.625rem] text-ink-400">Skip the guessing with HobyMine Plus.</p>
            </div>
          </Link>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <h3 className="text-xs font-semibold text-white">Legal</h3>
            <div className="mt-2 space-y-1.5">
              <Link
                to="/legal/terms"
                className="block text-[0.6875rem] font-semibold text-neon transition hover:underline"
              >
                Terms of Service
              </Link>
              <Link
                to="/legal/privacy"
                className="block text-[0.6875rem] font-semibold text-neon transition hover:underline"
              >
                Privacy Policy
              </Link>
            </div>
            <p className="mt-2 text-[0.625rem] leading-relaxed text-ink-500">
              HobyMine is strictly 18+ and only for adults.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

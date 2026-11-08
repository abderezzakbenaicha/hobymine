import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { MapPin, Sparkles } from 'lucide-react';
import { api, ApiClientError } from '../lib/api';
import { countryByCode } from '../lib/countries';
import { detectLocation } from '../lib/location';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import type { MeUser, Preferences } from '../types';
import { CountryPicker } from './CountryPicker';
import { LocationModeToggle, type LocationMode } from './LocationModeToggle';
import { Modal } from './Modal';
import { DualRangeSlider, RangeSlider } from './RangeSlider';

const INTERESTED_OPTIONS = [
  { value: 'women', label: 'Women' },
  { value: 'men', label: 'Men' },
  { value: 'everyone', label: 'Everyone' },
] as const;

export function FilterSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const navigate = useNavigate();
  const [interestedIn, setInterestedIn] = useState<Preferences['interestedIn']>('everyone');
  const [age, setAge] = useState<[number, number]>([21, 40]);
  const [distance, setDistance] = useState(50);
  const [countryCode, setCountryCode] = useState('');
  const [locationMode, setLocationModeState] = useState<LocationMode>('global');
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setInterestedIn(user.preferences.interestedIn);
    setAge([user.preferences.ageMin, user.preferences.ageMax]);
    setDistance(user.preferences.maxDistance);
    setCountryCode(user.preferences.countryCode ?? '');
    setLocationMode(user.preferences.locationMode);
  }, [open, user]);

  const filterCountry = countryCode ? countryByCode(countryCode) : null;

  const setLocationMode = (mode: LocationMode): void => {
    setLocationModeState(mode);
    if (mode === 'global') setDistance(20_000);
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
      if (detected.countryCode) setCountryCode(detected.countryCode);
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

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const data = await api.patch<{ user: MeUser }>('/api/me/preferences', {
        interestedIn,
        ageMin: age[0],
        ageMax: age[1],
        maxDistance: distance,
        locationMode,
        countryCode: countryCode || null,
      });
      setUser(data.user);
      toast.success('Discovery filters updated');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save filters');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tune your discovery"
      description="We’ll only show people who fit. Change this whenever you like."
    >
      <div className="space-y-7">
        <div>
          <p className="label">Show me</p>
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/8 bg-ink-900 p-1.5">
            {INTERESTED_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setInterestedIn(option.value)}
                className={cn(
                  'rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  interestedIn === option.value
                    ? 'bg-neon text-ink-950 shadow-glow-sm'
                    : 'text-ink-300 hover:bg-white/5 hover:text-white',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <DualRangeSlider
          min={18}
          max={60}
          value={age}
          onChange={setAge}
          formatValue={(value) => `${value}`}
        />

        <div>
          <p className="label">Location</p>
          <LocationModeToggle
            mode={locationMode}
            onChange={(mode) => setLocationMode(mode)}
          />
          <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
            {locationMode === 'nearby'
              ? 'Only people within your distance radius. Share your location to use your real GPS position.'
              : 'No distance limit — discover people from every country.'}
          </p>
          <button
            type="button"
            onClick={() => void useMyLocation()}
            disabled={locating}
            className="mt-2 inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold text-neon hover:underline disabled:opacity-50"
          >
            <MapPin className="h-3.5 w-3.5" />
            {locating ? 'Locating…' : 'Use my current location'}
          </button>
        </div>

        <div>
          <p className="label">Country</p>
          <CountryPicker
            value={countryCode}
            onChange={setCountryCode}
            placeholder="Anywhere in the world"
            allowClear
          />
          <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
            {filterCountry
              ? `Showing people in ${filterCountry.name}. Distances are measured from there.`
              : 'No country selected — your own country is always included.'}
          </p>
        </div>

        <RangeSlider
          min={1}
          max={5000}
          step={1}
          value={distance}
          onChange={setDistance}
          label="Maximum distance"
          formatValue={(value) => (value >= 1000 ? `${Math.round(value / 1000)}k km` : `${value} km`)}
        />
        <p className="-mt-4 text-[0.6875rem] leading-relaxed text-ink-500">
          {filterCountry
            ? `Slide wider to also see people in ${filterCountry.name}’s neighbours.`
            : 'Your country is always included. Slide wider to add nearby countries too.'}
        </p>

        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <MapPin className="h-4 w-4 text-neon" />
            {user?.countryName || user?.city || 'Country not set'}
            {user?.countryFlag && <span aria-hidden="true">{user.countryFlag}</span>}
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate('/preferences');
            }}
            className="mt-2 text-xs font-semibold text-neon hover:underline"
          >
            Change country & location
          </button>
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-primary w-full"
        >
          <Sparkles className="h-4 w-4" />
          {saving ? 'Updating…' : 'Show my picks'}
        </button>
      </div>
    </Modal>
  );
}

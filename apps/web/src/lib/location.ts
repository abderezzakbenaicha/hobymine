import { Capacitor, registerPlugin } from '@capacitor/core';
import { COUNTRIES, type Country } from './countries';

interface NativeLocationPlugin {
  requestPermission(): Promise<{ granted: boolean }>;
  getLastKnownPosition(): Promise<{
    granted: boolean;
    latitude: number;
    longitude: number;
    accuracy?: number;
  }>;
  reverseGeocode(options: {
    latitude: number;
    longitude: number;
  }): Promise<{ city: string; countryName: string; countryCode: string }>;
}

const NativeLocation = registerPlugin<NativeLocationPlugin>('HobymineLocation');

export interface DetectedLocation {
  latitude: number;
  longitude: number;
  city: string | null;
  countryCode: string | null;
  countryName: string | null;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/** Great-circle distance in kilometres. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * The closest country for a position. The app ships the full ISO 3166-1
 * dataset with coordinates, so the country can be resolved without calling an
 * external geocoding service.
 */
export function nearestCountry(latitude: number, longitude: number): Country | null {
  let best: Country | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const country of COUNTRIES) {
    const distance = haversineKm(latitude, longitude, country.lat, country.lng);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = country;
    }
  }
  return best;
}

/** Asks for the location permission (Android runtime permission on device). */
export async function requestLocationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await NativeLocation.requestPermission();
      if (result.granted) return true;
    } catch {
      // The plugin is not available in this build — try the browser flow.
    }
  }
  if (!navigator.permissions?.query) return true;
  try {
    const status = await navigator.permissions.query({
      name: 'geolocation' as PermissionName,
    });
    return status.state !== 'denied';
  } catch {
    return true;
  }
}

function readBrowserPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000 },
    );
  });
}

/**
 * Detects the current position and works out the city and country. Returns
 * `null` when the permission was refused or no position is available.
 */
export async function detectLocation(): Promise<DetectedLocation | null> {
  const granted = await requestLocationPermission();
  if (!granted) return null;

  let latitude: number | null = null;
  let longitude: number | null = null;

  if (Capacitor.isNativePlatform()) {
    try {
      const last = await NativeLocation.getLastKnownPosition();
      if (last.granted && last.latitude !== 0 && last.longitude !== 0) {
        latitude = last.latitude;
        longitude = last.longitude;
      }
    } catch {
      // Fall back to the WebView geolocation API.
    }
  }

  if (latitude === null || longitude === null) {
    const position = await readBrowserPosition();
    if (position) {
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
    }
  }

  if (latitude === null || longitude === null) return null;

  let city: string | null = null;
  let countryCode: string | null = null;
  let countryName: string | null = null;

  if (Capacitor.isNativePlatform()) {
    try {
      const geocoded = await NativeLocation.reverseGeocode({ latitude, longitude });
      if (geocoded.city) city = geocoded.city;
      if (geocoded.countryCode) {
        countryCode = geocoded.countryCode.toUpperCase();
        countryName = geocoded.countryName || null;
      }
    } catch {
      // Reverse geocoding is best effort.
    }
  }

  if (!countryCode) {
    const nearest = nearestCountry(latitude, longitude);
    if (nearest) {
      countryCode = nearest.code;
      countryName = nearest.name;
    }
  }

  return { latitude, longitude, city, countryCode, countryName };
}

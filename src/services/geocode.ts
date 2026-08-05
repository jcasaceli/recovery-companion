/**
 * Reverse geocoding for check-in locations. We store an address at check-in
 * time, but older rows (or ones where the geocode failed) may only have
 * coordinates. To honor "always show an address, never raw coordinates," this
 * fills the address in lazily on display — cached, bounded, and web-safe.
 */
import * as Location from 'expo-location';
import { Platform } from 'react-native';

const cache = new Map<string, string>();

/** Coords → a human address (or null on web / failure). Cached by ~11m grid. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (Platform.OS === 'web') return null; // expo-location reverseGeocode is native-only
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const g = geo[0];
    const addr = g ? [g.name, g.street, g.city, g.region].filter(Boolean).join(', ') : null;
    if (addr) cache.set(key, addr);
    return addr;
  } catch {
    return null;
  }
}

type Locatable = { address?: string | null; latitude?: number | null; longitude?: number | null; kind?: string };

/** Fill `address` for in-person rows that have coordinates but no stored
 *  address. Returns a NEW array only if something changed (so callers can skip a
 *  redundant setState). Bounded to avoid iOS reverse-geocode rate limits. */
export async function backfillAddresses<T extends Locatable>(rows: T[], limit = 12): Promise<T[]> {
  if (Platform.OS === 'web' || !rows.length) return rows;
  const out = rows.slice();
  let changed = false;
  let done = 0;
  for (let i = 0; i < out.length && done < limit; i++) {
    const c = out[i];
    if (c.kind !== 'online' && !c.address && c.latitude != null && c.longitude != null) {
      done++;
      const a = await reverseGeocode(c.latitude, c.longitude);
      if (a) { out[i] = { ...c, address: a }; changed = true; }
    }
  }
  return changed ? out : rows;
}

/**
 * In-person meeting search. Calls our backend, which merges real AA (Meeting
 * Guide) and NA (BMLT) data and returns the nearest in-person meetings. The
 * heavy lifting lives on the server — the app just asks "what's near me?".
 */
import { BACKEND_URL } from '../config';

export interface InPersonMeeting {
  source: string;
  slug: string;
  name: string;
  day: number | null; // 0=Sun..6=Sat
  time: string | null; // "HH:MM"
  fellowship: 'AA' | 'NA';
  types?: string[] | null;
  location?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  lat: number;
  lng: number;
  distance_mi: number;
  notes?: string | null;
  url?: string | null;
}

export interface NearbyResult {
  meetings: InPersonMeeting[];
  count: number;
  sources?: { aa: number; na: number };
  note?: string;
}

export async function getNearbyMeetings(
  lat: number,
  lng: number,
  opts?: { fellowship?: 'ALL' | 'AA' | 'NA'; day?: number | null; radius?: number; limit?: number },
): Promise<NearbyResult> {
  if (!BACKEND_URL) throw new Error('Meeting search needs the backend. Set EXPO_PUBLIC_BACKEND_URL.');
  const p = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: String(opts?.radius ?? 25),
    limit: String(opts?.limit ?? 60),
  });
  if (opts?.fellowship && opts.fellowship !== 'ALL') p.set('fellowship', opts.fellowship);
  if (opts?.day != null) p.set('day', String(opts.day));
  const res = await fetch(`${BACKEND_URL}/api/meetings/nearby?${p.toString()}`);
  if (!res.ok) throw new Error(`Meeting search failed (${res.status})`);
  return res.json();
}

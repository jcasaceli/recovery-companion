/**
 * In-person meeting search (Phase 1: California, AA + NA).
 *
 *   GET  /api/meetings/nearby?lat=&lng=&radius=&day=&fellowship=&limit=
 *        → nearest in-person meetings, sorted by distance, with distance_mi.
 *   POST /api/meetings/sync[?key=SECRET]
 *        → re-ingest the AA Meeting Guide feeds into Supabase (also runs nightly on cron).
 *
 * Data sources (all real, public, non-proprietary):
 *   • AA — per-intergroup "Meeting Guide" JSON feeds (code4recovery spec). We
 *     ingest these nightly into public.meetings_aa because the feeds are scattered
 *     and some block hot-linking; the server fetches with a browser UA and caches.
 *   • NA — the national BMLT aggregator (tomato.bmltenabled.org). Queried LIVE per
 *     request, so NA data is always current and needs no ingestion.
 *   • GA — no open feed exists, so the app links to the official GA directory instead.
 *
 * Honesty: only real feed data is stored/returned. A feed that fails to fetch is
 * skipped and logged — never faked. Results carry a "verify before attending" note.
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const admin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// AA "Meeting Guide" feeds to ingest. Each is a real intergroup feed verified to
// return the code4recovery JSON shape (name, slug, day 0-6, time, latitude,
// longitude, types, formatted_address). Add more CA intergroups here as verified;
// the sync skips any that fail so a bad/blocked URL never breaks the others.
// Confirmed-working AA intergroup Meeting Guide feeds across the US (each verified
// to return the code4recovery JSON with geo). NA is nationwide-live via BMLT, so
// this AA list adds density in major metros. Add more as they're verified; the
// sync skips any feed it can't fetch (a blocked/moved URL never breaks the rest).
const AA_FEEDS = [
  // West / CA
  { key: 'aa-san-diego', name: 'AA San Diego', url: 'https://aasandiego.org/wp-admin/admin-ajax.php?action=meetings' },
  { key: 'aa-orange-county', name: 'AA Orange County', url: 'https://oc-aa.org/wp-admin/admin-ajax.php?action=meetings' },
  { key: 'aa-seattle', name: 'AA Seattle', url: 'https://seattleaa.org/wp-admin/admin-ajax.php?action=meetings' },
  { key: 'aa-phoenix', name: 'AA Phoenix', url: 'https://aaphoenix.org/wp-admin/admin-ajax.php?action=meetings' },
  { key: 'aa-tucson', name: 'AA Tucson', url: 'https://aatucson.org/wp-admin/admin-ajax.php?action=meetings' },
  { key: 'aa-denver', name: 'AA Denver', url: 'https://daccaa.org/wp-admin/admin-ajax.php?action=meetings' },
  // Central / South
  { key: 'aa-houston', name: 'AA Houston', url: 'https://aahouston.org/wp-admin/admin-ajax.php?action=meetings' },
  { key: 'aa-kansas-city', name: 'AA Kansas City', url: 'https://kc-aa.org/wp-admin/admin-ajax.php?action=meetings' },
  { key: 'aa-minneapolis', name: 'AA Minneapolis', url: 'https://aaminneapolis.org/wp-admin/admin-ajax.php?action=meetings' },
  { key: 'aa-cincinnati', name: 'AA Cincinnati', url: 'https://aacincinnati.org/wp-admin/admin-ajax.php?action=meetings' },
  { key: 'aa-nashville', name: 'AA Nashville', url: 'https://aanashville.org/wp-admin/admin-ajax.php?action=meetings' },
  { key: 'aa-atlanta', name: 'AA Atlanta', url: 'https://atlantaaa.org/wp-admin/admin-ajax.php?action=meetings' },
  // Florida
  { key: 'aa-palm-beach', name: 'AA Palm Beach County', url: 'https://aapalmbeachcounty.org/wp-admin/admin-ajax.php?action=meetings' },
  { key: 'aa-pinellas', name: 'AA Pinellas (Tampa Bay)', url: 'https://aapinellas.org/wp-admin/admin-ajax.php?action=meetings' },
  // East Coast
  { key: 'aa-nyc', name: 'AA New York (Intergroup)', url: 'https://nyintergroup.org/wp-admin/admin-ajax.php?action=meetings' },
  { key: 'aa-connecticut', name: 'AA Connecticut', url: 'https://ct-aa.org/wp-admin/admin-ajax.php?action=meetings' },
  { key: 'aa-philadelphia', name: 'AA SE Pennsylvania', url: 'https://aasepia.org/wp-admin/admin-ajax.php?action=meetings' },
  { key: 'aa-dc', name: 'AA Washington DC', url: 'https://aa-dc.org/wp-admin/admin-ajax.php?action=meetings' },
  { key: 'aa-virginia', name: 'AA Virginia', url: 'https://aavirginia.org/wp-admin/admin-ajax.php?action=meetings' },
];

// National NA aggregator (BMLT). Queried live; -N geo_width = auto-expand radius
// until N results, so we always get the nearest meetings regardless of density.
const NA_AGGREGATOR = 'https://tomato.bmltenabled.org/main_server/client_interface/json/';

const R_MI = 3958.8; // earth radius, miles
function haversineMi(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R_MI * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function cityFromAddress(formatted, fallback) {
  // "6901 Central Ave, Lemon Grove, CA 91945, USA" -> "Lemon Grove"
  if (formatted && formatted.includes(',')) {
    const parts = formatted.split(',').map((p) => p.trim());
    if (parts.length >= 3) return parts[1];
  }
  return fallback || null;
}

async function fetchJson(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Normalize one AA Meeting Guide row to our table shape. Returns null if no geo
 *  or if it's an online-only meeting (this is the in-person directory). */
function normalizeAa(m, source) {
  const lat = parseFloat(m.latitude);
  const lng = parseFloat(m.longitude);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  if (m.attendance_option === 'online') return null; // keep in_person + hybrid only
  const day = m.day === '' || m.day == null ? null : parseInt(m.day, 10);
  return {
    source,
    slug: m.slug || `${source}-${m.id}`,
    name: (m.name || 'AA Meeting').toString().slice(0, 200),
    day: Number.isInteger(day) ? day : null,
    time: m.time || null,
    fellowship: 'AA',
    types: Array.isArray(m.types) ? m.types.slice(0, 20).map(String) : null,
    location: m.location || null,
    address: m.formatted_address || null,
    city: cityFromAddress(m.formatted_address, m.region),
    region: m.region || null,
    lat,
    lng,
    notes: m.notes ? String(m.notes).slice(0, 500) : null,
    url: m.url || null,
    timezone: m.timezone || null,
  };
}

/** Ingest all AA feeds into public.meetings_aa. Per-feed failures are skipped. */
export async function syncAaMeetings() {
  if (!admin) return { ok: false, error: 'no supabase admin client' };
  const report = [];
  for (const feed of AA_FEEDS) {
    try {
      const raw = await fetchJson(feed.url, 20000);
      if (!Array.isArray(raw)) throw new Error('feed not an array');
      const rows = raw.map((m) => normalizeAa(m, feed.key)).filter(Boolean);
      // De-dupe on slug within the feed (a feed is the full current list).
      const bySlug = new Map();
      for (const r of rows) bySlug.set(r.slug, r);
      const clean = [...bySlug.values()];
      await admin.from('meetings_aa').delete().eq('source', feed.key);
      for (let i = 0; i < clean.length; i += 500) {
        const chunk = clean.slice(i, i + 500);
        const { error } = await admin.from('meetings_aa').insert(chunk);
        if (error) throw new Error(error.message);
      }
      report.push({ feed: feed.key, meetings: clean.length, ok: true });
      console.log(`[meetings] synced ${feed.key}: ${clean.length} meetings`);
    } catch (e) {
      report.push({ feed: feed.key, ok: false, error: e?.message || String(e) });
      console.warn(`[meetings] skipped ${feed.key}: ${e?.message || e}`);
    }
  }
  return { ok: true, report };
}

/** Live-query the national NA aggregator for meetings near a point. */
async function fetchNaNearby(lat, lng, want = 50) {
  const fields = 'meeting_name,weekday_tinyint,start_time,location_street,location_municipality,location_province,latitude,longitude';
  // venue_types[] 1=in-person, 3=hybrid (exclude 2=virtual) — this is the in-person directory.
  const url =
    `${NA_AGGREGATOR}?switcher=GetSearchResults&data_field_key=${encodeURIComponent(fields)}` +
    `&lat_val=${lat}&long_val=${lng}&geo_width=-${Math.min(Math.max(want, 10), 60)}` +
    `&venue_types[]=1&venue_types[]=3`;
  const raw = await fetchJson(url, 8000);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => {
      const mlat = parseFloat(m.latitude);
      const mlng = parseFloat(m.longitude);
      if (!isFinite(mlat) || !isFinite(mlng)) return null;
      const wd = parseInt(m.weekday_tinyint, 10); // BMLT: 1=Sun..7=Sat
      return {
        source: 'na-bmlt',
        slug: `na-${m.meeting_name}-${mlat}-${mlng}-${wd}`,
        name: (m.meeting_name || 'NA Meeting').toString().slice(0, 200),
        day: Number.isInteger(wd) ? (wd - 1 + 7) % 7 : null, // -> 0=Sun..6=Sat
        time: m.start_time ? String(m.start_time).slice(0, 5) : null,
        fellowship: 'NA',
        types: null,
        address: m.location_street || null,
        city: m.location_municipality || null,
        region: m.location_province || null,
        lat: mlat,
        lng: mlng,
        notes: null,
        url: null,
      };
    })
    .filter(Boolean);
}

/** Query ingested AA meetings within a bounding box around a point. */
async function fetchAaNearby(lat, lng, radiusMi, limit) {
  if (!admin) return [];
  const dLat = radiusMi / 69; // ~69 miles per degree latitude
  const dLng = radiusMi / (69 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const { data, error } = await admin
    .from('meetings_aa')
    .select('source,slug,name,day,time,fellowship,types,location,address,city,region,lat,lng,notes,url')
    .gte('lat', lat - dLat)
    .lte('lat', lat + dLat)
    .gte('lng', lng - dLng)
    .lte('lng', lng + dLng)
    .limit(Math.min(limit * 8, 2000));
  if (error) {
    console.warn('[meetings] AA query error:', error.message);
    return [];
  }
  return data || [];
}

const router = express.Router();

router.get('/nearby', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (!isFinite(lat) || !isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  const radius = Math.min(Math.max(parseFloat(req.query.radius) || 25, 1), 100);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 60, 1), 100);
  const day = req.query.day != null && req.query.day !== '' ? parseInt(req.query.day, 10) : null;
  const fellowship = (req.query.fellowship || 'ALL').toString().toUpperCase();

  const wantAa = fellowship === 'ALL' || fellowship === 'AA';
  const wantNa = fellowship === 'ALL' || fellowship === 'NA';

  const [aa, na] = await Promise.all([
    wantAa ? fetchAaNearby(lat, lng, radius, limit).catch(() => []) : Promise.resolve([]),
    wantNa ? fetchNaNearby(lat, lng, limit).catch((e) => { console.warn('[meetings] NA fetch failed:', e?.message); return []; }) : Promise.resolve([]),
  ]);

  let all = [...aa, ...na]
    .map((m) => ({ ...m, distance_mi: Math.round(haversineMi(lat, lng, m.lat, m.lng) * 10) / 10 }))
    .filter((m) => m.distance_mi <= radius)
    .filter((m) => day == null || m.day === day)
    .sort((a, b) => a.distance_mi - b.distance_mi)
    .slice(0, limit);

  res.json({
    meetings: all,
    count: all.length,
    sources: { aa: aa.length, na: na.length },
    note: 'Meeting data from official AA (Meeting Guide) and NA (BMLT) sources. Always confirm details before attending.',
  });
});

router.post('/sync', async (req, res) => {
  const need = process.env.MEETINGS_SYNC_KEY;
  if (need && req.query.key !== need) return res.status(403).json({ error: 'bad key' });
  const result = await syncAaMeetings();
  res.json(result);
});

export default router;

/** Small formatting helpers used across screens. */

import { MoodLevel, ProgramType, SessionType, LevelOfCare } from '../types';

// Focused on sober livings: only this level is offered in the UI. (The DB enum
// still permits the others for future use.)
export const LEVELS_OF_CARE: LevelOfCare[] = ['sober_living'];

export const LEVEL_OF_CARE_LABELS: Record<LevelOfCare, string> = {
  detox: 'Detox',
  residential: 'Residential',
  php: 'PHP',
  iop: 'IOP',
  sober_companion: 'Sober Companion',
  sober_living: 'Sober Living',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad2(n: number) { return String(n).padStart(2, '0'); }

/** Parse a 'YYYY-MM-DD' string as a LOCAL date (avoids the UTC off-by-one
 *  that `new Date("2026-06-16")` causes in negative-offset timezones). */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

/** "2026-06-16" -> "06-16-2026" (US MM-DD-YYYY). */
export function formatDate(iso: string): string {
  // Date-only strings parse as local; full timestamps keep their instant.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso.slice(0, 10)) && iso.length <= 10
    ? parseLocalDate(iso)
    : new Date(iso);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${d.getFullYear()}`;
}

/** "2026-06-16" -> "Tuesday". */
export function dayOfWeek(iso: string): string {
  return DAYS[parseLocalDate(iso).getDay()];
}

/** "2026-05-31T15:20:00Z" -> "05-31-2026, 3:20 PM" (local) */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${d.getFullYear()}, ${h}:${m} ${ampm}`;
}

/** "2026-06-16T21:58:00Z" -> "9:58 PM" (local time only). */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/** Next weekly occurrence (today or later) of a date, as 'YYYY-MM-DD' (local). */
export function nextWeeklyISO(startISO: string): string {
  const start = parseLocalDate(startISO);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const DAY = 86400000;
  if (start.getTime() >= today.getTime()) return startISO.slice(0, 10);
  const diff = Math.round((today.getTime() - start.getTime()) / DAY);
  const rem = diff % 7;
  const next = new Date(today.getTime() + (rem === 0 ? 0 : 7 - rem) * DAY);
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
}

/** Friendly "when" line for a house meeting, e.g. "Tuesday, 06-16-2026 · 7:00 PM · Repeats weekly". */
export function houseEventWhen(date: string, time?: string, recurring?: boolean): string {
  const shown = recurring ? nextWeeklyISO(date) : date;
  return `${dayOfWeek(shown)}, ${formatDate(shown)}${time ? ` · ${to12h(time)}` : ''}${recurring ? ' · Repeats weekly' : ''}`;
}

/** Whole days between an ISO date and now. */
export function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}

export const MOOD_LABELS: Record<MoodLevel, string> = {
  1: 'Struggling',
  2: 'Low',
  3: 'Okay',
  4: 'Good',
  5: 'Thriving',
};

export const MOOD_EMOJI: Record<MoodLevel, string> = {
  1: '😟',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😊',
};

export const PROGRAM_LABELS: Record<ProgramType, string> = {
  detox: 'Detox',
  inpatient: 'Inpatient',
  residential: 'Residential',
  php: 'Partial Hospitalization (PHP)',
  iop: 'Intensive Outpatient (IOP)',
  outpatient: 'Outpatient',
  'sober-living': 'Sober Living',
  aftercare: 'Aftercare',
};

export const SESSION_LABELS: Record<SessionType, string> = {
  'individual-therapy': 'Individual Therapy',
  'group-therapy': 'Group Therapy',
  'family-therapy': 'Family Therapy',
  psychiatry: 'Psychiatry',
  medical: 'Medical',
  'support-group': 'Support Group',
};

/** Ordinal day-of-month, e.g. 1 -> "1st", 22 -> "22nd". */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Normalize a US phone number to E.164 (+1XXXXXXXXXX) for SMS verification.
 *  Members enter a plain 10-digit US number — we add the +1 automatically. */
export function toUsE164(raw?: string): string | undefined {
  if (!raw) return undefined;
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return raw.startsWith('+') ? raw : (d ? `+${d}` : undefined);
}

/** "19:00" -> "7:00 PM" */
export function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  if (isNaN(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(isNaN(m) ? 0 : m).padStart(2, '0')} ${period}`;
}

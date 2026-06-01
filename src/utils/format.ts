/** Small formatting helpers used across screens. */

import { MoodLevel, ProgramType, SessionType } from '../types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-05-31" -> "May 31" */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "2026-05-31T15:20:00Z" -> "May 31, 3:20 PM" (local) */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${h}:${m} ${ampm}`;
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

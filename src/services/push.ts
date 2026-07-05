/**
 * Push notifications (Expo).
 *
 * Two halves:
 *  1. DEVICE REGISTRATION — get this device's Expo push token and store it in
 *     `push_tokens` (via db.ts) so the backend can target it later.
 *  2. SENDING — a client cannot push to *other* users' devices. When a task or
 *     note is added, the app asks the backend to fan out a push to every linked
 *     account (facilitator + individual + supporters). That fan-out runs in a
 *     Supabase Edge Function (or the proxy server) that looks up the
 *     recipients' tokens and calls Expo's push API. See docs/BACKEND.md.
 *
 * For the prototype (no backend), `notifyCareTeam` shows a LOCAL notification on
 * this device so you can see the behavior end-to-end, and logs who *would* be
 * notified in production.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { BACKEND_URL } from '../config';
import { supabase } from './supabase';

async function authToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Notify a member's care team (member + facilitators) via the backend. */
export async function notifyCare(individualId: string, title: string, body: string, kind?: 'activity' | 'sos' | 'alert') {
  if (!BACKEND_URL) return;
  const t = await authToken();
  if (!t) return;
  fetch(`${BACKEND_URL}/api/notify/care`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify({ individualId, title, body, kind }),
  }).catch(() => {});
}

/** Notify everyone who opted into community alerts. */
export async function notifyCommunity(title: string, body: string) {
  if (!BACKEND_URL) return;
  const t = await authToken();
  if (!t) return;
  fetch(`${BACKEND_URL}/api/notify/community`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify({ title, body }),
  }).catch(() => {});
}

// Show notifications while the app is foregrounded too. (Native only.)
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Ask for permission and return this device's Expo push token (or null if
 * unavailable, e.g. a simulator). Safe to call on every app start.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null; // no native push on web
  if (!Device.isDevice) return null; // push tokens require a physical device

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
  } catch {
    return null;
  }
}

export type NotifyAudience = 'facilitator' | 'individual' | 'supporters';

export interface NotifyInput {
  title: string;
  body: string;
  /** Who should receive it. Production fan-out resolves these to push tokens. */
  audiences: NotifyAudience[];
  /** Display names, for the local-demo notification copy. */
  audienceNames?: string[];
}

/**
 * Notify the care team that something changed (a task or note was added).
 * Production: POSTs to the backend, which fans out Expo pushes to every linked
 * account. Prototype: shows a local notification so the behavior is visible.
 */
export async function notifyCareTeam(input: NotifyInput): Promise<void> {
  if (BACKEND_URL) {
    try {
      await fetch(`${BACKEND_URL}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      return;
    } catch (e) {
      console.warn('[push] backend notify failed, falling back to local', e);
    }
  }

  // Prototype fallback: a local notification on this device.
  await Notifications.scheduleNotificationAsync({
    content: { title: input.title, body: input.body },
    trigger: null, // fire immediately
  });
}

/** Human-readable summary of who a change will notify (for UI affordances). */
export function describeAudience(audiences: NotifyAudience[]): string {
  const label: Record<NotifyAudience, string> = {
    facilitator: 'the facilitator',
    individual: 'the individual getting help',
    supporters: 'family supporters',
  };
  const parts = audiences.map((a) => label[a]);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
}

// ── Nightly review reminder (local, repeating daily notification) ────────────
const NIGHTLY_ID = 'nightly-review-reminder';

/** Schedule a daily local reminder at hour:minute (24h). Returns false if the
 *  user declined notifications or on web (no local scheduling there). */
export async function scheduleNightlyReminder(hour: number, minute: number): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return false;
  try { await Notifications.cancelScheduledNotificationAsync(NIGHTLY_ID); } catch {}
  await Notifications.scheduleNotificationAsync({
    identifier: NIGHTLY_ID,
    content: { title: '🌙 Nightly Review', body: 'Take a few honest minutes to review your day before bed.' },
    trigger: { hour, minute, repeats: true } as any,
  });
  return true;
}

export async function cancelNightlyReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  try { await Notifications.cancelScheduledNotificationAsync(NIGHTLY_ID); } catch {}
}

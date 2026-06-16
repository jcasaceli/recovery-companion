/**
 * Client helpers for Stripe flows. Each call sends the user's Supabase access
 * token to our backend, which talks to Stripe (the secret key never lives in
 * the app). Hosted Stripe pages open in an in-app browser.
 *
 * Requires EXPO_PUBLIC_BACKEND_URL (the proxy server) to be set and the server
 * configured with Stripe keys. See server/.env.example.
 */

import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { BACKEND_URL } from '../config';

async function token(): Promise<string> {
  if (!supabase) throw new Error('Not signed in.');
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error('Not signed in.');
  return t;
}

async function call(path: string, method: 'GET' | 'POST', body?: unknown) {
  if (!BACKEND_URL) {
    throw new Error('Payments need the backend. Set EXPO_PUBLIC_BACKEND_URL and run the server.');
  }
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).error || `Request failed (${res.status})`);
  }
  return res.json();
}

export interface ConnectStatus {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
}

/** Facilitator: open Stripe Connect onboarding in the browser. */
export async function startConnectOnboarding() {
  const { url } = await call('/api/stripe/connect/onboard', 'POST');
  await WebBrowser.openBrowserAsync(url);
}

export async function getConnectStatus(): Promise<ConnectStatus> {
  return call('/api/stripe/connect/status', 'GET');
}

/** Facilitator: subscribe to the platform ($60/mo). */
export async function startPlatformSubscribe() {
  const { url } = await call('/api/stripe/platform/subscribe', 'POST');
  await WebBrowser.openBrowserAsync(url);
}

/** Resident: pay rent to their operator. recurring=true sets up monthly auto-pay. */
export async function startRentCheckout(recurring: boolean, amountCents?: number) {
  const { url } = await call('/api/stripe/rent/checkout', 'POST', { recurring, amountCents });
  await WebBrowser.openBrowserAsync(url);
}

/** Returns a Stripe checkout URL (without opening it) — e.g. to share with a
 *  loved one so they can pay the member's fee. Payment still credits the member. */
export async function getRentCheckoutUrl(recurring: boolean, amountCents?: number): Promise<string> {
  const { url } = await call('/api/stripe/rent/checkout', 'POST', { recurring, amountCents });
  return url;
}

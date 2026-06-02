/**
 * Account deletion. Calls our backend (which holds the service_role key) to
 * remove the signed-in user's auth account and associated data.
 */
import { supabase } from './supabase';
import { BACKEND_URL } from '../config';

/** Permanently delete the current user's account and data. Server-side. */
export async function deleteAccount(): Promise<void> {
  if (!BACKEND_URL) throw new Error('Account deletion needs the backend. Set EXPO_PUBLIC_BACKEND_URL.');
  if (!supabase) throw new Error('Not signed in.');
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error('Not signed in.');

  const res = await fetch(`${BACKEND_URL}/api/account/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).error || `Request failed (${res.status})`);
  }
}

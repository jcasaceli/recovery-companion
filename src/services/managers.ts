/**
 * House-manager management (owner only). Calls the backend, which creates the
 * staff login server-side. House managers are a free feature (no per-seat charge).
 */
import { supabase } from './supabase';
import { BACKEND_URL } from '../config';

export interface Manager { id: string; name?: string; email?: string }

async function call(path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown) {
  if (!BACKEND_URL) throw new Error('Set EXPO_PUBLIC_BACKEND_URL to manage house managers.');
  if (!supabase) throw new Error('Not signed in.');
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error('Not signed in.');
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).error || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function listManagers(): Promise<{ managers: Manager[]; priceConfigured: boolean }> {
  return call('/api/managers', 'GET');
}

/** Returns the temp password to share with the new manager. */
export async function addManager(name: string, email: string, phone: string): Promise<{ email: string; password: string; billed: boolean }> {
  return call('/api/managers', 'POST', { name, email, phone });
}

export async function removeManager(id: string): Promise<void> {
  await call(`/api/managers/${id}`, 'DELETE');
}

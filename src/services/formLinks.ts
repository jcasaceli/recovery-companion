/**
 * Emailing a form to a resident who doesn't use the app.
 *
 * Most residents never install the app, so an assigned form used to sit
 * unreachable in a tab they never open. The backend mints a one-off link for
 * that single form and emails it; they fill it in and sign in the browser and
 * it saves straight back to their file.
 */
import { supabase } from './supabase';
import { BACKEND_URL } from '../config';

export interface SendFormResult {
  ok: boolean;
  link: string;
  emailed: boolean;
  to?: string;
  reason?: 'no_email';
}

/** Staff: email this assigned form to the resident (and get the link back). */
export async function sendFormToResident(formId: string): Promise<SendFormResult> {
  if (!BACKEND_URL) throw new Error('Backend not configured.');
  if (!supabase) throw new Error('Not signed in.');
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error('Not signed in.');
  const res = await fetch(`${BACKEND_URL}/api/forms/${formId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).error || `Could not send (${res.status})`);
  }
  return res.json();
}

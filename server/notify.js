/**
 * Push fan-out. Sends Expo push notifications to other users' devices.
 *
 *  POST /api/notify/care      { individualId, title, body }
 *      → notifies that member + the org's facilitators (minus the sender)
 *  POST /api/notify/community { title, body }
 *      → notifies everyone who opted into community alerts (minus the sender)
 *
 * Auth: caller sends their Supabase access token. Recipients' Expo tokens come
 * from the push_tokens table (saved by the app on sign-in).
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const admin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

async function getUser(req) {
  if (!admin) return null;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

/** Look up Expo push tokens for a set of profile ids. */
export async function tokensFor(profileIds) {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) return [];
  const { data } = await admin.from('push_tokens').select('token').in('profile_id', ids);
  return (data ?? []).map((r) => r.token).filter(Boolean);
}

/** Send a push to each Expo token (chunked). */
export async function expoPush(tokens, title, body) {
  if (!tokens.length) return;
  const messages = tokens.map((to) => ({ to, title, body, sound: 'default' }));
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });
    } catch (e) {
      console.warn('[notify] expo push failed', e.message);
    }
  }
}

export const notifyRouter = express.Router();

notifyRouter.post('/care', async (req, res) => {
  if (!admin) return res.status(503).json({ error: 'not configured' });
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    const { individualId, title, body, kind } = req.body || {};
    if (!individualId) return res.status(400).json({ error: 'individualId required' });

    const { data: ind } = await admin
      .from('individuals')
      .select('profile_id, org_id')
      .eq('id', individualId)
      .maybeSingle();
    if (!ind) return res.json({ sent: 0 });

    const recipients = [];
    if (ind.profile_id) recipients.push(ind.profile_id);
    if (ind.org_id) {
      const { data: mems } = await admin.from('org_members').select('profile_id').eq('org_id', ind.org_id);
      let staff = (mems ?? []).map((m) => m.profile_id);
      // Routine resident activity (check-ins, payment reports) respects each
      // staff member's "notify me about resident activity" toggle. SOS / alerts
      // always go through.
      if (kind === 'activity' && staff.length) {
        const { data: prefs } = await admin.from('profiles').select('id, notify_member_activity').in('id', staff);
        const muted = new Set((prefs ?? []).filter((p) => p.notify_member_activity === false).map((p) => p.id));
        staff = staff.filter((id) => !muted.has(id));
      }
      staff.forEach((id) => recipients.push(id));
    }
    const targets = recipients.filter((id) => id !== user.id);
    const tokens = await tokensFor(targets);
    await expoPush(tokens, title || 'Update', body || '');
    res.json({ sent: tokens.length });
  } catch (e) {
    console.error('[notify] care', e);
    res.status(500).json({ error: e.message });
  }
});

notifyRouter.post('/community', async (req, res) => {
  if (!admin) return res.status(503).json({ error: 'not configured' });
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    const { title, body } = req.body || {};
    const { data: profs } = await admin
      .from('profiles')
      .select('id')
      .eq('community_notify', true)
      .neq('id', user.id);
    const tokens = await tokensFor((profs ?? []).map((p) => p.id));
    await expoPush(tokens, title || 'Community', body || '');
    res.json({ sent: tokens.length });
  } catch (e) {
    console.error('[notify] community', e);
    res.status(500).json({ error: e.message });
  }
});

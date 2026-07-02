/**
 * Member invites. When a facilitator adds a resident (with an email), the app
 * calls POST /api/invite/send { individualId } and we email that resident an
 * app invite with their PERSONAL join code (which links them to the exact
 * record the house manages) plus download links.
 *
 * Auth: caller sends their Supabase access token; we verify they're a member of
 * the resident's org before sending.
 *
 * SMS: not sent here — the server has no SMS provider yet. Wire Twilio later and
 * add a parallel send in this handler.
 */
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const admin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const INVITE_FROM = process.env.WELCOME_FROM || 'Sober Living Companion <joseph@soberlivingdirectory.com>';
const APP_STORE = 'https://apps.apple.com/app/sober-living-companion/id6780705094';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.soberlivingcompanion.app';
const WEB_APP = 'https://app.soberlivingcompanion.com';

async function getUser(req) {
  if (!admin) return null;
  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

function inviteHtml({ firstName, houseName, joinCode }) {
  const who = firstName || 'there';
  const house = houseName || 'your sober living';
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2b2b2b">
    <div style="background:#3E8E7E;border-radius:14px 14px 0 0;padding:18px 22px;color:#fff;font-weight:800;font-size:18px">🌱 You're invited to Sober Living Companion</div>
    <div style="border:1px solid #e3e0d9;border-top:0;border-radius:0 0 14px 14px;padding:24px;line-height:1.6">
      <p style="margin:0 0 12px">Hi ${who}, you've been invited to join <strong>${house}</strong> on the free Sober Living Companion app.</p>
      <p style="margin:0 0 12px">With the app you can track your sober days, see house meetings &amp; schedules, complete and sign agreements, and pay your membership fees — all from your phone.</p>
      <p style="margin:0 0 8px;font-weight:700">Your join code:</p>
      <p style="margin:0 0 16px;font-size:26px;font-weight:800;letter-spacing:3px;color:#2F6B5F">${joinCode}</p>
      <p style="margin:0 0 14px">Download the app, create your account, then enter the code above to connect to ${house}:</p>
      <p style="margin:0 0 16px">
        <a href="${APP_STORE}" style="background:#111;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;display:inline-block;margin:0 6px 8px 0">Download on iPhone</a>
        <a href="${PLAY_STORE}" style="background:#2E9E5B;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;display:inline-block;margin:0 6px 8px 0">Get it on Android</a>
      </p>
      <p style="margin:0 0 16px;color:#6b6b6b;font-size:14px">No app store? Open the web app: <a href="${WEB_APP}" style="color:#2F6B5F">app.soberlivingcompanion.com</a></p>
      <p style="margin:0;color:#9a9a9a;font-size:12px">Sober Living Companion · a program of Empower Next Project, a non-profit.</p>
    </div>
  </div>`;
}

export const inviteRouter = express.Router();

inviteRouter.post('/send', async (req, res) => {
  if (!admin) return res.status(503).json({ error: 'not configured' });
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const individualId = req.body?.individualId;
    if (!individualId) return res.status(400).json({ error: 'individualId required' });

    const { data: ind } = await admin
      .from('individuals')
      .select('id, org_id, first_name, email, house_name, join_code')
      .eq('id', individualId)
      .maybeSingle();
    if (!ind) return res.status(404).json({ error: 'member not found' });

    // Caller must belong to the resident's org.
    const { data: membership } = await admin
      .from('org_members')
      .select('org_id')
      .eq('profile_id', user.id)
      .eq('org_id', ind.org_id)
      .maybeSingle();
    if (!membership) return res.status(403).json({ error: 'forbidden' });

    if (!ind.email) return res.json({ sent: false, reason: 'no email on file' });
    if (!RESEND_API_KEY) return res.json({ sent: false, reason: 'email not configured' });

    // Prefer THIS member's personal code — redeeming it links to this exact
    // record (no email/phone matching, so no duplicate). Fall back to the org
    // master code only if the member has no personal code yet.
    const { data: org } = await admin.from('organizations').select('name, join_code').eq('id', ind.org_id).maybeSingle();
    const joinCode = ind.join_code || org?.join_code || '';
    const houseName = ind.house_name || org?.name || '';

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: INVITE_FROM,
        to: ind.email,
        reply_to: 'joseph@soberlivingdirectory.com',
        subject: `You're invited to ${houseName || 'your sober living'} on Sober Living Companion`,
        html: inviteHtml({ firstName: ind.first_name, houseName, joinCode }),
      }),
    });
    if (!r.ok) {
      console.error('[invite] resend failed', r.status, await r.text());
      return res.status(502).json({ error: 'email send failed' });
    }
    console.log('[invite] sent to', ind.email);
    return res.json({ sent: true });
  } catch (e) {
    console.error('[invite] error', e);
    return res.status(500).json({ error: 'server error' });
  }
});

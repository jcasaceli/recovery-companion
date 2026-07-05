/**
 * House managers. The org owner can create additional staff logins that share
 * the facilitator console (manage residents, UAs, payments, agreements) but
 * cannot see billing or manage other managers.
 *
 * House managers are a FREE feature — there is no per-manager charge. Add as
 * many as you need.
 *
 * House managers are modeled as role='facilitator' members of the org with
 * is_owner=false, so the existing is_facilitator_for() RLS already grants them
 * resident access. "Owner" = the profile that created the organization.
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const WELCOME_FROM = process.env.WELCOME_FROM || 'Sober Living Companion <joseph@mail.soberlivingdirectory.com>';
const APP_STORE = 'https://apps.apple.com/app/sober-living-companion/id6780705094';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.soberlivingcompanion.app';
const WEB_APP = 'https://app.soberlivingcompanion.com';

function managerHtml({ name, orgName, email, password }) {
  const who = name || 'there';
  const house = orgName || 'your sober living';
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2b2b2b">
    <div style="background:#3E8E7E;border-radius:14px 14px 0 0;padding:18px 22px;color:#fff;font-weight:800;font-size:18px">🏠 You're a house manager</div>
    <div style="border:1px solid #e3e0d9;border-top:0;border-radius:0 0 14px 14px;padding:24px;line-height:1.6">
      <p style="margin:0 0 12px">Hi ${who}, you've been added as a <strong>house manager</strong> for <strong>${house}</strong> on Sober Living Companion. You can manage residents, forms, agreements, UAs, and payments.</p>
      <p style="margin:0 0 6px;font-weight:700">Sign in with:</p>
      <p style="margin:0 0 4px">Email: <strong>${email}</strong></p>
      <p style="margin:0 0 16px">Temporary password: <strong style="font-size:18px;letter-spacing:1px;color:#2F6B5F">${password}</strong></p>
      <p style="margin:0 0 14px;color:#6b6b6b;font-size:14px">You'll be asked to set your own password the first time you log in.</p>
      <p style="margin:0 0 16px">
        <a href="${WEB_APP}" style="background:#3E8E7E;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;display:inline-block;margin:0 6px 8px 0">Open the web app</a>
        <a href="${APP_STORE}" style="background:#111;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;display:inline-block;margin:0 6px 8px 0">iPhone</a>
        <a href="${PLAY_STORE}" style="background:#2E9E5B;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;display:inline-block;margin:0 6px 8px 0">Android</a>
      </p>
      <p style="margin:0;color:#9a9a9a;font-size:12px">Sober Living Companion · a program of Empower Next Project, a non-profit.</p>
    </div>
  </div>`;
}

async function getUser(req) {
  if (!supabaseAdmin) return null;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) return null;
  return data.user;
}

/** The org this user is staff of (owner OR manager), or null. Managers get the
 *  same access as owners here; removing the owner is still blocked below. */
async function ownerOrg(userId) {
  const { data: m } = await supabaseAdmin
    .from('org_members')
    .select('org_id')
    .eq('profile_id', userId)
    .limit(1)
    .maybeSingle();
  if (!m?.org_id) return null;
  const { data } = await supabaseAdmin.from('organizations').select('*').eq('id', m.org_id).maybeSingle();
  return data || null;
}

/** House managers are FREE — no Stripe seat is added. We still return the
 *  current manager count for display. */
async function syncManagerSeats(org) {
  const { count } = await supabaseAdmin
    .from('org_members')
    .select('profile_id', { count: 'exact', head: true })
    .eq('org_id', org.id)
    .eq('is_owner', false);
  return { billed: false, seats: count || 0 };
}

function tempPassword() {
  // Short + easy to type: a word + 4 digits (e.g. "Sober4821").
  const n = 1000 + Math.floor(Math.random() * 9000);
  return `Sober${n}`;
}

export const managersRouter = Router();

// List the owner's house managers.
managersRouter.get('/', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Server missing SUPABASE_SERVICE_ROLE_KEY.' });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  const org = await ownerOrg(user.id);
  if (!org) return res.status(403).json({ error: 'Only the owner can manage house managers.' });

  const { data: members } = await supabaseAdmin
    .from('org_members').select('profile_id').eq('org_id', org.id).eq('is_owner', false);
  const ids = (members || []).map((m) => m.profile_id);
  let managers = [];
  if (ids.length) {
    const { data: profs } = await supabaseAdmin.from('profiles').select('id,full_name,email').in('id', ids);
    managers = (profs || []).map((p) => ({ id: p.id, name: p.full_name, email: p.email }));
  }
  res.json({ managers, priceConfigured: false });
});

// Create a new house manager (returns a one-time temp password to share).
managersRouter.post('/', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Server missing SUPABASE_SERVICE_ROLE_KEY.' });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  const org = await ownerOrg(user.id);
  if (!org) return res.status(403).json({ error: 'Only the owner can add house managers.' });

  const name = (req.body?.name || '').trim();
  const email = (req.body?.email || '').trim().toLowerCase();
  const phone = (req.body?.phone || '').trim();
  if (!name || !email || !phone) return res.status(400).json({ error: 'Name, email, and phone are required.' });

  try {
    const password = tempPassword();
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { role: 'facilitator', full_name: name, phone },
    });
    if (createErr) {
      if (/already/i.test(createErr.message)) return res.status(409).json({ error: 'That email already has an account.' });
      throw createErr;
    }
    const uid = created.user.id;

    // The signup trigger auto-creates an empty demo org for any new facilitator.
    // Remove it so the manager belongs ONLY to the owner's (subscribed) org —
    // otherwise they'd see "activate your sober living" and be locked out.
    const { data: strays } = await supabaseAdmin.from('organizations').select('id').eq('created_by', uid);
    for (const s of strays || []) {
      await supabaseAdmin.from('org_members').delete().eq('org_id', s.id);
      await supabaseAdmin.from('organizations').delete().eq('id', s.id);
    }

    await supabaseAdmin.from('profiles').upsert(
      { id: uid, role: 'facilitator', full_name: name, email, phone, email_verified: true },
      { onConflict: 'id' },
    );
    // Force them to set their own password on first login (best-effort — needs
    // migration 0047; ignored if the column isn't there yet).
    await supabaseAdmin.from('profiles').update({ must_change_password: true }).eq('id', uid);
    await supabaseAdmin.from('org_members').upsert(
      { org_id: org.id, profile_id: uid, is_owner: false },
      { onConflict: 'org_id,profile_id' },
    );

    // Email the new manager their temporary password.
    if (RESEND_API_KEY) {
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: WELCOME_FROM,
          to: email,
          reply_to: 'joseph@soberlivingdirectory.com',
          subject: `You're a house manager on ${org.name || 'Sober Living Companion'}`,
          html: managerHtml({ name, orgName: org.name, email, password }),
        }),
      }).then((r) => { if (!r.ok) r.text().then((t) => console.error('[managers] email failed', r.status, t)); })
        .catch((e) => console.error('[managers] email error', e));
    }

    const billing = await syncManagerSeats(org);
    res.json({ email, password, billed: billing.billed, seats: billing.seats });
  } catch (e) {
    console.error('[managers] create', e);
    res.status(500).json({ error: e.message });
  }
});

// Remove a house manager (deletes their login).
managersRouter.delete('/:id', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Server missing SUPABASE_SERVICE_ROLE_KEY.' });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  const org = await ownerOrg(user.id);
  if (!org) return res.status(403).json({ error: 'Only the owner can remove house managers.' });

  const targetId = req.params.id;
  try {
    // Only remove if they're actually a non-owner member of this org.
    const { data: m } = await supabaseAdmin
      .from('org_members').select('profile_id,is_owner')
      .eq('org_id', org.id).eq('profile_id', targetId).maybeSingle();
    if (!m || m.is_owner) return res.status(400).json({ error: 'Not a house manager of your org.' });

    await supabaseAdmin.from('org_members').delete().eq('org_id', org.id).eq('profile_id', targetId);
    await supabaseAdmin.auth.admin.deleteUser(targetId).catch(() => {});
    const billing = await syncManagerSeats(org);
    res.json({ ok: true, seats: billing.seats });
  } catch (e) {
    console.error('[managers] delete', e);
    res.status(500).json({ error: e.message });
  }
});
